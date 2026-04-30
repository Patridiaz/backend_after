import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTallerDto } from './dto/create-taller.dto';
import { UpdateTallerDto } from './dto/update-taller.dto';
import { FilterTallerDto } from './dto/filter-taller.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CreateSedeDto } from './dto/create-sede.dto';
import { UpdateSedeDto } from './dto/update-sede.dto';
import { differenceInYears } from 'date-fns';

const FECHA_INICIO_PROGRAMA = new Date('2026-03-27T00:00:00');
const DIAS_LECTIVOS = [1, 2, 3, 4, 5]; // Lunes a Viernes

@Injectable()
export class TalleresService {
  private readonly CACHE_PREFIX = 'talleres_search_';

  constructor(
    public prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  async createTaller(createTallerDto: CreateTallerDto) {
    const { horarios, profesores, ...tallerData } = createTallerDto;
    
    return this.prisma.taller.create({
      data: {
        ...tallerData,
        cuposDisponibles: tallerData.cuposTotales,
        horarios: {
          create: horarios
        },
        profesores: {
          create: (profesores || []).map(id => ({ usuarioId: id }))
        }
      },
      include: {
        horarios: true,
        profesores: true
      }
    });
  }

  async updateTaller(id: number, dto: UpdateTallerDto) {
    const { horarios, profesores, ...tallerData } = dto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Actualizar datos básicos
      const updated = await tx.taller.update({
        where: { id },
        data: tallerData
      });

      // 2. Actualizar horarios (si se proveen)
      if (horarios) {
        await tx.horarioTaller.deleteMany({ where: { tallerId: id } });
        await tx.horarioTaller.createMany({
          data: horarios.map(h => ({ ...h, tallerId: id }))
        });
      }

      // 3. Actualizar profesores (si se proveen)
      if (profesores) {
        await tx.profesorTaller.deleteMany({ where: { tallerId: id } });
        await tx.profesorTaller.createMany({
          data: profesores.map(pId => ({ tallerId: id, usuarioId: pId }))
        });
      }

      await this.clearCache();
      return updated;
    });
  }

  async deleteTaller(id: number) {
    const res = await this.prisma.taller.delete({ where: { id } });
    await this.clearCache();
    return res;
  }

  async createSede(dto: CreateSedeDto) {
    return this.prisma.sede.create({ data: dto });
  }

  async updateSede(id: number, dto: UpdateSedeDto) {
    return this.prisma.sede.update({ where: { id }, data: dto });
  }

  async deleteSede(id: number) {
    return this.prisma.sede.delete({ where: { id } });
  }

  async assignProfesor(dto: any) {
     return this.prisma.profesorTaller.create({
       data: { tallerId: dto.tallerId, usuarioId: dto.usuarioId }
     });
  }

  async unassignProfesor(dto: any) {
    return this.prisma.profesorTaller.delete({
      where: { usuarioId_tallerId: { usuarioId: dto.usuarioId, tallerId: dto.tallerId } }
    });
  }

  async getAllTalleres() {
    return this.prisma.taller.findMany({
      include: {
        sede: true,
        horarios: true,
        profesores: {
          include: {
            usuario: { select: { id: true, nombre: true, email: true, rol: true } }
          }
        },
        _count: {
          select: { inscripciones: true }
        }
      },
      orderBy: { nombre: 'asc' }
    });
  }

  async getAllProfesores() {
    try {
      const profesores = await this.prisma.usuarioLocal.findMany({
        where: {
          rol: { in: ['PROFESOR', 'COORDINADOR', 'ADMIN'] },
          isActive: true
        },
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true
        }
      });

      return profesores.map(p => ({
        id: p.id,
        nombre: p.nombre,
        email: p.email,
        rol: p.rol
      })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    } catch (error) {
      console.error("Error obteniendo profesores locales:", error);
      return [];
    }
  }

  // --- CONSULTAS PÚBLICAS ---

  async findAllSedes() {
    return this.prisma.sede.findMany();
  }

  async findAvailable(params: FilterTallerDto) {
    const cacheKey = `${this.CACHE_PREFIX}${JSON.stringify(params)}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const { sedeId, fechaNacimiento, search, minAge, maxAge, includeFull, page, limit } = params;

    const where: any = { activo: true };

    if (includeFull !== 'true') {
      where.cuposDisponibles = { gt: 0 };
    }

    if (sedeId) where.sedeId = parseInt(sedeId);
    if (search) where.nombre = { contains: search };

    if (fechaNacimiento) {
      const fechaNac = new Date(fechaNacimiento);
      const edad = differenceInYears(new Date(), fechaNac);
      where.edadMinima = { lte: edad };
      where.edadMaxima = { gte: edad };
    }

    if (minAge || maxAge) {
      const min = minAge ? parseInt(minAge) : 0;
      const max = maxAge ? parseInt(maxAge) : 99;
      where.OR = [{ AND: [{ edadMinima: { lte: max } }, { edadMaxima: { gte: min } }] }];
    }

    const p = page ? parseInt(page) : 1;
    const l = limit ? parseInt(limit) : 12;
    const skip = (p - 1) * l;

    const talleres = await this.prisma.taller.findMany({
      where, skip, take: l,
      include: { sede: true, horarios: true },
      orderBy: { nombre: 'asc' }
    });

    await this.cacheManager.set(cacheKey, talleres, 120000);
    return talleres;
  }

  async clearCache() {
    try {
      const store: any = (this.cacheManager as any).store;
      if (store.keys) {
        const keys = await store.keys(`${this.CACHE_PREFIX}*`);
        for (const key of keys) await this.cacheManager.del(key);
      } else {
        await (this.cacheManager as any).reset();
      }
    } catch (e) {
      console.error("Error clearing Redis cache:", e);
    }
  }

  async findByProfesor(profesorId: number) {
    const talleres = await this.prisma.taller.findMany({
      where: { profesores: { some: { usuarioId: profesorId } } },
      include: {
        sede: true,
        horarios: true,
        profesores: { include: { usuario: { select: { nombre: true, email: true } } } },
        _count: { select: { inscripciones: true, asistencias: true } }
      }
    });

    if (talleres.length === 0) return [];

    const tallerIds = talleres.map(t => t.id);
    const conteosPorTaller = await this.prisma.asistencia.groupBy({
      by: ['tallerId', 'estado'],
      where: { tallerId: { in: tallerIds } },
      _count: { estado: true }
    });

    const mapaConteos: Record<number, { P: number; A: number; J: number }> = {};
    for (const row of conteosPorTaller) {
      if (!mapaConteos[row.tallerId]) mapaConteos[row.tallerId] = { P: 0, A: 0, J: 0 };
      const e = row.estado as 'P' | 'A' | 'J';
      if (['P', 'A', 'J'].includes(e)) mapaConteos[row.tallerId][e] = row._count.estado;
    }

    return talleres.map(t => {
      const c = mapaConteos[t.id] ?? { P: 0, A: 0, J: 0 };
      const totalRegistros = c.P + c.A + c.J;
      const asistenciaPromedio = totalRegistros > 0 ? Math.round(((c.P + c.J) / totalRegistros) * 100) : 0;
      return { ...t, asistenciaPromedio, _stats: { presentes: c.P, ausentes: c.A, justificados: c.J, total: totalRegistros } };
    });
  }

  async getAllTalleresConAsistencia() {
    const talleres = await this.prisma.taller.findMany({
      include: {
        sede: true,
        horarios: true,
        profesores: { include: { usuario: { select: { id: true, nombre: true, email: true, rol: true } } } },
        _count: { select: { inscripciones: true, asistencias: true } }
      },
      orderBy: [{ sede: { nombre: 'asc' } }, { nombre: 'asc' }]
    });

    if (talleres.length === 0) return [];

    const conteosPorTaller = await this.prisma.asistencia.groupBy({
      by: ['tallerId', 'estado'],
      _count: { estado: true }
    });

    const mapaConteos: Record<number, { P: number; A: number; J: number }> = {};
    for (const row of conteosPorTaller) {
      if (!mapaConteos[row.tallerId]) mapaConteos[row.tallerId] = { P: 0, A: 0, J: 0 };
      const e = row.estado as 'P' | 'A' | 'J';
      if (['P', 'A', 'J'].includes(e)) mapaConteos[row.tallerId][e] = row._count.estado;
    }

    return talleres.map(t => {
      const c = mapaConteos[t.id] ?? { P: 0, A: 0, J: 0 };
      const totalRegistros = c.P + c.A + c.J;
      const asistenciaPromedio = totalRegistros > 0 ? Math.round(((c.P + c.J) / totalRegistros) * 100) : 0;
      return { ...t, asistenciaPromedio, _stats: { presentes: c.P, ausentes: c.A, justificados: c.J, total: totalRegistros } };
    });
  }

  async findBySede(sedeId: number) {
    const talleres = await this.prisma.taller.findMany({
      where: { sedeId },
      include: {
        sede: true,
        horarios: true,
        profesores: { include: { usuario: { select: { id: true, nombre: true, email: true, rol: true } } } },
        _count: { select: { inscripciones: true, asistencias: true } }
      },
      orderBy: { nombre: 'asc' }
    });

    if (talleres.length === 0) return [];

    const tallerIds = talleres.map(t => t.id);
    const conteosPorTaller = await this.prisma.asistencia.groupBy({
      by: ['tallerId', 'estado'],
      where: { tallerId: { in: tallerIds } },
      _count: { estado: true }
    });

    const mapaConteos: Record<number, { P: number; A: number; J: number }> = {};
    for (const row of conteosPorTaller) {
      if (!mapaConteos[row.tallerId]) mapaConteos[row.tallerId] = { P: 0, A: 0, J: 0 };
      const e = row.estado as 'P' | 'A' | 'J';
      if (['P', 'A', 'J'].includes(e)) mapaConteos[row.tallerId][e] = row._count.estado;
    }

    return talleres.map(t => {
      const c = mapaConteos[t.id] ?? { P: 0, A: 0, J: 0 };
      const totalRegistros = c.P + c.A + c.J;
      const asistenciaPromedio = totalRegistros > 0 ? Math.round(((c.P + c.J) / totalRegistros) * 100) : 0;
      return { ...t, asistenciaPromedio, _stats: { presentes: c.P, ausentes: c.A, justificados: c.J, total: totalRegistros } };
    });
  }

  async getMetricas() {
    // --- 1. KPIs Generales (Auditados por Alumno Único) ---
    const allInscriptions = await this.prisma.inscripcion.findMany({
      select: { alumnoId: true, activo: true }
    });

    const estadoPorAlumno = new Map<number, { tieneActivo: boolean, tieneInactivo: boolean }>();
    allInscriptions.forEach(ins => {
      const estado = estadoPorAlumno.get(ins.alumnoId) || { tieneActivo: false, tieneInactivo: false };
      if (ins.activo) estado.tieneActivo = true;
      else estado.tieneInactivo = true;
      estadoPorAlumno.set(ins.alumnoId, estado);
    });

    let totalAlumnosVigentes = 0;
    let totalAlumnosDesertores = 0;

    estadoPorAlumno.forEach(estado => {
      if (estado.tieneActivo) {
        totalAlumnosVigentes++;
      }
      if (estado.tieneInactivo) {
        // El usuario requiere contar al alumno como desertor si se salió de al menos un taller
        totalAlumnosDesertores++;
      }
    });

    const totalAlumnosUnicos = estadoPorAlumno.size;
    const tasaDesercion = totalAlumnosUnicos > 0 
      ? Math.round((totalAlumnosDesertores / totalAlumnosUnicos) * 100) 
      : 0;

    const [totalTalleres, totalPresentes, totalAusentes, totalJustificados] = await Promise.all([
      this.prisma.taller.count(),
      this.prisma.asistencia.count({ where: { estado: 'P' } }),
      this.prisma.asistencia.count({ where: { estado: 'A' } }),
      this.prisma.asistencia.count({ where: { estado: 'J' } }),
    ]);

    const idsMunicipales = [2, 3, 4, 5, 6, 7, 10];
    const inscritos = await this.prisma.inscripcion.findMany({
      where: { activo: true },
      select: { alumno: { select: { rut: true } } }
    });
    const ourUniqueRuts = new Set(inscritos.map(i => i.alumno.rut.replace(/[^0-9Kk]/g, '').toUpperCase().replace(/^0+/, '')));
    const allMunicipalSige = await this.prisma.alumnoSige.findMany({
      where: { sedeId: { in: idsMunicipales } },
      select: { runc: true }
    });
    const municipalRutsSige = new Set(allMunicipalSige.map(s => s.runc.replace(/[^0-9Kk]/g, '').toUpperCase().replace(/^0+/, '')));

    let totalAlumnosMunicipales = 0;
    ourUniqueRuts.forEach(rut => { if (municipalRutsSige.has(rut)) totalAlumnosMunicipales++; });

    const totalInscritosActivos = allInscriptions.filter(i => i.activo).length;
    const totalRegistros = totalPresentes + totalAusentes + totalJustificados;
    const porcentajeAsistencia = totalRegistros > 0 ? Math.round(((totalPresentes + totalJustificados) / totalRegistros) * 100) : 0;
    const porcentajeMunicipales = totalInscritosActivos > 0 ? Math.round((totalAlumnosMunicipales / totalInscritosActivos) * 100) : 0;

    const inscripcionesPorTallerRaw = await this.prisma.taller.findMany({
      select: { id: true, nombre: true, _count: { select: { inscripciones: { where: { activo: true } } } } },
      orderBy: { inscripciones: { _count: 'desc' } }
    });
    const inscripcionesPorTaller = inscripcionesPorTallerRaw.map(t => ({ id: t.id, nombre: t.nombre, inscritos: t._count.inscripciones }));

    const sedesConTalleres = await this.prisma.sede.findMany({
      include: { talleres: { select: { id: true, nombre: true, _count: { select: { inscripciones: { where: { activo: true } } } } } } },
      orderBy: { nombre: 'asc' }
    });
    const inscripcionesPorTallerYSede = sedesConTalleres.map(sede => ({
      sede: sede.nombre,
      talleres: sede.talleres.map(t => ({ id: t.id, nombre: t.nombre, inscritos: t._count.inscripciones }))
    }));

    const todasLasInscripciones = await this.prisma.inscripcion.findMany({
      where: { activo: true },
      include: { alumno: { select: { fechaNacimiento: true } }, taller: { select: { nombre: true } } }
    });

    const RANGOS_CONFIG = [
      { label: '5-7 años', min: 5, max: 7 },
      { label: '8-10 años', min: 8, max: 10 },
      { label: '11-13 años', min: 11, max: 13 },
      { label: '14-17 años', min: 14, max: 17 },
      { label: '1-18 años', min: 1, max: 18 },
    ];
    const hoy = new Date();
    const getEdadAuditada = (fecha: any): number | null => {
      if (!fecha) return null;
      const nac = new Date(fecha);
      if (isNaN(nac.getTime())) return null;
      let edad = hoy.getFullYear() - nac.getFullYear();
      const m = hoy.getMonth() - nac.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
      return edad;
    };

    const mapaInscripciones: Record<string, Record<string, number>> = {};
    RANGOS_CONFIG.forEach(r => { mapaInscripciones[r.label] = {}; });
    todasLasInscripciones.forEach(ins => {
      const edad = getEdadAuditada(ins.alumno.fechaNacimiento);
      if (edad === null) return;
      const rMatch = RANGOS_CONFIG.find(rc => edad >= rc.min && edad <= rc.max);
      if (!rMatch) return;
      const tallerNombre = ins.taller.nombre;
      mapaInscripciones[rMatch.label][tallerNombre] = (mapaInscripciones[rMatch.label][tallerNombre] || 0) + 1;
    });

    const inscripcionesPorEdad = RANGOS_CONFIG.map(r => ({
      rango: r.label,
      talleres: Object.entries(mapaInscripciones[r.label]).map(([nombre, inscritos]) => ({ nombre, inscritos })).sort((a, b) => b.inscritos - a.inscritos)
    }));

    return {
      resumen: {
        totalTalleres,
        totalInscritos: totalInscritosActivos,
        totalAlumnosVigentes,
        totalDesertores: totalAlumnosDesertores,
        totalAlumnosUnicos: totalAlumnosVigentes + totalAlumnosDesertores,
        totalAlumnosMunicipales,
        totalPresentes,
        totalAusentes,
        porcentajeAsistencia,
        porcentajeMunicipales,
        tasaDesercion
      },
      inscripcionesPorTaller,
      inscripcionesPorTallerYSede,
      inscripcionesPorEdad,
      maximoInteresPorEdad: inscripcionesPorEdad.map(r => ({ rango: r.rango, tallerMasPopular: r.talleres[0]?.nombre || 'Sin datos', inscritos: r.talleres[0]?.inscritos || 0 }))
    };
  }

  async findByAlumno(apoderadoId: number) {
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { alumno: { apoderadoId: apoderadoId } },
      include: {
        alumno: true,
        taller: { include: { sede: true, horarios: true, asistencias: { orderBy: { fecha: 'desc' } } } }
      }
    });

    return inscripciones.map(inscripcion => ({
      id: inscripcion.taller.id,
      nombreAlumno: `${inscripcion.alumno.nombres} ${inscripcion.alumno.apellidos}`,
      nombre: inscripcion.taller.nombre,
      horario: inscripcion.taller.horarios.map(h => `${h.diaSemana} ${String(h.horaInicio).padStart(2,'0')}:${String(h.minutoInicio).padStart(2,'0')}`).join(' | '),
      sede: inscripcion.taller.sede.nombre,
      fechaInscripcion: inscripcion.fecha,
      asistencias: inscripcion.taller.asistencias.filter(a => a.alumnoId === inscripcion.alumnoId).map(a => ({
        fecha: a.fecha, estado: a.estado, estadoTexto: this.getEstadoTexto(a.estado)
      }))
    }));
  }

  async findOne(id: number) {
    return this.prisma.taller.findUnique({ where: { id }, include: { sede: true, _count: { select: { inscripciones: true } } } });
  }

  private diaNombreANumero(dia: string): number | null {
    const mapa: Record<string, number> = { 'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3, 'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6 };
    return mapa[dia?.toLowerCase().trim()] ?? null;
  }

  generarFechasHabilitadas(horarios: { diaSemana: string }[], fechaFin?: Date): string[] {
    const hoy = fechaFin ?? new Date();
    hoy.setHours(23, 59, 59, 999);
    if (hoy < FECHA_INICIO_PROGRAMA) return [];
    const diasClase = [...new Set(horarios.map(h => this.diaNombreANumero(h.diaSemana)).filter(d => d !== null && DIAS_LECTIVOS.includes(d)))] as number[];
    if (diasClase.length === 0) return [];
    const fechas: string[] = [];
    const cursor = new Date(FECHA_INICIO_PROGRAMA);
    while (cursor <= hoy) {
      if (diasClase.includes(cursor.getDay())) {
        fechas.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return fechas;
  }

  async getRankingAsistencia(limit: number = 10, sedeId?: number) {
    const where: any = {};
    if (sedeId) where.taller = { sedeId };

    // 1. Obtener los IDs de alumnos que tienen al menos un registro de PRESENTE (fueron un día mínimo)
    const resumenAsistencias = await this.prisma.asistencia.groupBy({
      by: ['alumnoId'],
      where: {
        ...where,
        estado: 'P'
      },
      _count: { _all: true }
    });

    if (resumenAsistencias.length === 0) return [];

    const alumnoIds = resumenAsistencias.map(a => a.alumnoId);

    // 2. Obtener detalles de los alumnos que además estén ACTIVOS en sus talleres
    const alumnos = await this.prisma.alumno.findMany({
      where: { 
        id: { in: alumnoIds },
        inscripciones: {
          some: { 
            activo: true,
            taller: sedeId ? { sedeId } : {}
          }
        }
      },
      include: {
        establecimiento: true,
        asistencias: { 
          where,
          orderBy: { fecha: 'desc' }
        },
        inscripciones: {
          where: { activo: true },
          include: { 
            taller: {
              include: { sede: true }
            }
          }
        }
      }
    });

    // 3. Mapear al formato extendido que espera el reporte del frontend
    const ranking = alumnos.map(alumno => {
      const asistencias = alumno.asistencias;
      const total = asistencias.length;
      const presentes = asistencias.filter(a => a.estado === 'P').length;
      const ausentes = asistencias.filter(a => a.estado === 'A').length;
      const justificados = asistencias.filter(a => a.estado === 'J').length;
      
      // La asistencia se considera Presente (P) o Justificado (J)
      const porcentaje = total > 0 
        ? Math.round(((presentes + justificados) / total) * 100) 
        : 0;
      
      return {
        id: alumno.id,
        rut: alumno.rut,
        nombre: `${alumno.nombres} ${alumno.apellidos}`,
        establecimiento: alumno.establecimiento?.nombre || 'N/A',
        taller: alumno.inscripciones.map(i => i.taller.nombre).join(', '),
        totalSesiones: total,
        presentes,
        ausentes,
        justificados,
        porcentaje,
        // Metadatos extra solicitados en auditorías previas
        consentimientoImagen: alumno.inscripciones.some(i => i.usoImagen) ? 'SÍ' : 'NO'
      };
    });

    return ranking.sort((a, b) => b.porcentaje - a.porcentaje).slice(0, limit);
  }

  async getRankingAsistenciaProfesor(usuarioId: number, limit: number = 3) {
    const talleres = await this.prisma.profesorTaller.findMany({
      where: { usuarioId },
      select: { tallerId: true }
    });
    const tallerIds = talleres.map(t => t.tallerId);

    return this.getRankingAsistencia(limit, undefined); // Simplificado: usa el ranking general pero podría filtrarse por tallerIds
  }

  async getAlumnosPorTaller(tallerId: number) {
    // 1. Obtener información del taller y sus horarios
    const taller = await this.prisma.taller.findUnique({
      where: { id: tallerId },
      include: { 
        sede: true,
        horarios: true 
      }
    });

    if (!taller) return { taller: null, alumnos: [], fechasHabilitadas: [] };

    // 2. Obtener los alumnos inscritos ACTIVOS
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { tallerId, activo: true },
      include: {
        alumno: {
          include: { 
            establecimiento: true,
            apoderado: true,
            asistencias: {
              where: { tallerId },
              orderBy: { fecha: 'desc' },
              take: 50 
            },
            inscripciones: {
              where: { activo: true },
              include: { taller: { include: { sede: true } } }
            }
          }
        }
      }
    });

    // 3. Generar las fechas habilitadas basadas en el horario
    const fechasHabilitadas = this.generarFechasHabilitadas(taller.horarios);

    // 4. Mapear alumnos para el frontend (asegurando el formato de asistencia)
    const alumnosMapeados = inscripciones.map(ins => {
      const alumno = ins.alumno;
      const asistencias = alumno.asistencias || [];
      
      // Calculamos porcentaje de asistencia rápido
      const totalAsist = asistencias.length;
      const presentes = asistencias.filter(a => a.estado === 'P').length;
      const pct = totalAsist > 0 ? Math.round((presentes / totalAsist) * 100) : 0;

      return {
        ...ins, // Incluye fichaInscripcion y datos de salud
        id: alumno.id,
        rut: alumno.rut,
        nombres: alumno.nombres,
        apellidos: alumno.apellidos,
        porcentaje: pct,
        asistencias: asistencias,
        apoderado: alumno.apoderado
      };
    });

    return {
      taller: {
        id: taller.id,
        nombre: taller.nombre,
        sede: taller.sede.nombre
      },
      alumnos: alumnosMapeados,
      fechasHabilitadas
    };
  }

  private getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = { 'P': 'Presente', 'A': 'Ausente', 'J': 'Justificado' };
    return estados[estado] || estado;
  }
}