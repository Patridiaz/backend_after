import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { differenceInYears } from 'date-fns';
import { CreateSedeDto } from './dto/create-sede.dto';
import { CreateTallerDto } from './dto/create-taller.dto';
import { UpdateTallerDto } from './dto/update-taller.dto';
import { AssignProfesorDto } from './dto/assign-profesor.dto';
import { FilterTallerDto } from './dto/filter-taller.dto';

// ─── Fecha de Inicio Oficial del Programa ───────────────────────────────────
// Cambiar aquí si se modifica el calendario escolar.
const FECHA_INICIO_PROGRAMA = new Date('2026-03-27T00:00:00');
const DIAS_LECTIVOS = [1, 2, 3, 4, 5]; // Lunes a Viernes (0=Domingo, 6=Sábado)


@Injectable()
export class TalleresService {
  constructor(private prisma: PrismaService) {}

  // --- ADMINISTRACIÓN ---

  async updateTaller(id: number, dto: UpdateTallerDto) {
    // 1. Verificar existencia
    const existe = await this.prisma.taller.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException('El taller solicitado no existe.');

    const { horarios, ...restDto } = dto;
    const dataUpdate: any = { ...restDto };

    // 2. Si cambian los cupos totales, ajustar disponibles
    if (dto.cuposTotales !== undefined) {
      const inscritos = await this.prisma.inscripcion.count({ where: { tallerId: id } });
      const nuevosDisponibles = dto.cuposTotales - inscritos;
      dataUpdate.cuposDisponibles = nuevosDisponibles < 0 ? 0 : nuevosDisponibles;
    }

    // 3. Update normal y de horarios
    if (horarios) {
      dataUpdate.horarios = {
        deleteMany: {},
        create: horarios
      };
    }

    return this.prisma.taller.update({
      where: { id },
      data: dataUpdate
    });
  }

  async deleteTaller(id: number) {
    // Verificar si hay inscritos antes de borrar
    const inscritos = await this.prisma.inscripcion.count({ where: { tallerId: id } });
    if (inscritos > 0) {
      throw new ConflictException('No se puede eliminar un taller que ya tiene alumnos inscritos.');
    }

    return this.prisma.taller.delete({ where: { id } });
  }

  async createSede(dto: CreateSedeDto) {
    return this.prisma.sede.create({
      data: dto
    });
  }

  async createTaller(dto: CreateTallerDto) {
    const { sedeId, horarios, ...tallerData } = dto;
    return this.prisma.taller.create({
      data: {
        ...tallerData,
        cuposDisponibles: dto.cuposTotales, // Al inicio, disponibles = totales
        sedeId: sedeId,
        horarios: {
          create: horarios
        }
      }
    });
  }

  async assignProfesor(dto: AssignProfesorDto) {
    const { usuarioId, tallerId } = dto;

    // Verificamos si ya existe la asignación
    const existing = await this.prisma.profesorTaller.findFirst({
      where: {
        tallerId,
        usuarioId,
      }
    });

    if (existing) {
      throw new ConflictException('El profesor ya está asignado a este taller.');
    }

    return this.prisma.profesorTaller.create({
      data: {
        usuarioId,
        tallerId
      }
    });
  }

  async unassignProfesor(dto: AssignProfesorDto) {
    const { usuarioId, tallerId } = dto;

    const assignment = await this.prisma.profesorTaller.findFirst({
      where: {
        tallerId,
        usuarioId,
      }
    });

    if (!assignment) {
      throw new NotFoundException('No se encontró la asignación especificada.');
    }

    return this.prisma.profesorTaller.delete({
      where: { id: assignment.id }
    });
  }

  // Listar TODOS los talleres (Vista Admin)
  async getAllTalleres() {
    return this.prisma.taller.findMany({
      include: {
        sede: true,
        horarios: true,
        profesores: {
          include: {
            usuario: {
              select: { id: true, nombre: true, email: true, rol: true }
            }
          }
        },
        _count: {
          select: { inscripciones: true }
        }
      },
      orderBy: { nombre: 'asc' }
    });
  }

  // Traer usuarios con rol PROFESOR desde ticket-service
  // Traer usuarios con rol PROFESOR desde ticket-service + Profesores Locales
  /**
   * Obtiene todos los usuarios que han sido asignados como PROFESOR localmente
   */
  async getAllProfesores() {
    try {
      const locales = await this.prisma.usuarioLocal.findMany({
        where: { 
          rol: 'PROFESOR',
          isActive: true 
        },
        select: { id: true, email: true, nombre: true, isActive: true, externalId: true }
      });

      return locales.map(l => ({ 
        ...l, 
        tipo: l.externalId ? 'EXTERNO' : 'LOCAL' 
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
    const { sedeId, fechaNacimiento, search, minAge, maxAge } = params;

    const where: any = {
      cuposDisponibles: { gt: 0 },
    };

    // Filtro por Sede (SedeOpcional)
    if (sedeId) {
      where.sedeId = parseInt(sedeId);
    }

    // Filtro por Búsqueda de Texto (Search)
    if (search) {
      where.nombre = {
        contains: search
      };
    }

    // Filtro por Fecha de Nacimiento (Edad Exacta)
    if (fechaNacimiento) {
      const fechaNac = new Date(fechaNacimiento);
      const edad = differenceInYears(new Date(), fechaNac);
      where.edadMinima = { lte: edad };
      where.edadMaxima = { gte: edad };
    }

    // Filtro por Rango de Edad (Collides)
    if (minAge || maxAge) {
      const min = minAge ? parseInt(minAge) : 0;
      const max = maxAge ? parseInt(maxAge) : 99;
      
      // La edad del taller debe colisionar con el rango solicitado
      where.OR = [
        {
          AND: [
            { edadMinima: { lte: max } },
            { edadMaxima: { gte: min } }
          ]
        }
      ];
    }

    return this.prisma.taller.findMany({
      where: where,
      include: {
        sede: true, // Respuesta incluye el objeto Sede completo
        horarios: true
      },
      orderBy: { nombre: 'asc' }
    });
  }

  /**
   * Talleres asignados a un PROFESOR (su carga académica)
   */
  async findByProfesor(profesorId: number) {
    return this.prisma.taller.findMany({
      where: {
        profesores: {
          some: {
            usuarioId: profesorId
          }
        }
      },
      include: {
        sede: true,
        horarios: true,
        profesores: {
          include: {
            usuario: { select: { nombre: true, email: true } }
          }
        },
        _count: {
          select: { 
            inscripciones: true,
            asistencias: true
          }
        }
      }
    });
  }

  /**
   * Talleres de una SEDE específica (para ENCARGADO_ESCUELA)
   */
  async findBySede(sedeId: number) {
    return this.prisma.taller.findMany({
      where: { sedeId },
      include: {
        sede: true,
        horarios: true,
        profesores: {
          include: {
            usuario: { select: { id: true, nombre: true, email: true, rol: true } }
          }
        },
        _count: {
          select: { inscripciones: true, asistencias: true }
        }
      },
      orderBy: { nombre: 'asc' }
    });
  }

  /**
   * Métricas completas y auditadas del sistema (para COORDINADOR y ADMIN)
   * Garantiza que el 100% de los datos se reflejen en los desgloses.
   */
  async getMetricas() {
    // --- 1. KPIs Generales (Auditados) ---
    const [
      totalTalleres, 
      totalInscritosRaw, 
      totalAlumnosUnicos,
      totalPresentes, 
      totalAusentes
    ] = await Promise.all([
      this.prisma.taller.count(),
      this.prisma.inscripcion.count(),
      this.prisma.alumno.count({
        where: { inscripciones: { some: {} } }
      }),
      this.prisma.asistencia.count({ where: { estado: 'P' } }),
      this.prisma.asistencia.count({ where: { estado: 'A' } }),
    ]);

    const porcentajeAsistencia = (totalPresentes + totalAusentes) > 0
      ? Math.round((totalPresentes / (totalPresentes + totalAusentes)) * 100)
      : 0;

    // --- 2. Inscripciones por Taller (Debe sumar el 100%) ---
    const inscripcionesPorTallerRaw = await this.prisma.taller.findMany({
      select: {
        id: true,
        nombre: true,
        _count: { select: { inscripciones: true } }
      },
      orderBy: { inscripciones: { _count: 'desc' } }
    });

    const inscripcionesPorTaller = inscripcionesPorTallerRaw.map(t => ({
      id: t.id,
      nombre: t.nombre,
      inscritos: t._count.inscripciones
    }));

    // --- 3. Inscripciones por Taller y Sede ---
    const sedesConTalleres = await this.prisma.sede.findMany({
      include: {
        talleres: {
          select: {
            id: true,
            nombre: true,
            _count: { select: { inscripciones: true } }
          }
        }
      },
      orderBy: { nombre : 'asc' }
    });

    const inscripcionesPorTallerYSede = sedesConTalleres.map(sede => ({
      sede: sede.nombre,
      talleres: sede.talleres.map(t => ({
        id: t.id,
        nombre: t.nombre,
        inscritos: t._count.inscripciones
      }))
    }));

    // --- 4. Inscripciones por Edad (Auditado: Captura el 100%) ---
    const todasLasInscripciones = await this.prisma.inscripcion.findMany({
      include: {
        alumno: { select: { fechaNacimiento: true } },
        taller: { select: { nombre: true } }
      }
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

    // Inicializamos el mapa con todos los rangos (incluyendo "Sin rango / Otros")
    const mapaInscripciones: Record<string, Record<string, number>> = {};
    RANGOS_CONFIG.forEach(r => {
      mapaInscripciones[r.label] = {};
    });

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
      talleres: Object.entries(mapaInscripciones[r.label])
        .map(([nombre, inscritos]) => ({ nombre, inscritos }))
        .sort((a, b) => b.inscritos - a.inscritos)
    }));

    // --- 5. Máximo Interés por Edad ---
    const maximoInteresPorEdad = inscripcionesPorEdad
      .filter(r => r.rango !== 'Sin rango / Otros')
      .map(r => ({
        rango: r.rango,
        tallerMasPopular: r.talleres[0]?.nombre || 'Sin datos',
        inscritos: r.talleres[0]?.inscritos || 0
      }));

    return {
      resumen: {
        totalTalleres,
        totalInscritos: totalInscritosRaw,
        totalAlumnosUnicos,
        totalPresentes,
        totalAusentes,
        porcentajeAsistencia
      },
      inscripcionesPorTaller,
      inscripcionesPorTallerYSede,
      inscripcionesPorEdad,
      maximoInteresPorEdad
    };
  }

  /**
   * Talleres en los que están inscritos los alumnos de un APODERADO
   */
  async findByAlumno(apoderadoId: number) {
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { 
        alumno: {
          apoderadoId: apoderadoId
        }
      },
      include: {
        alumno: true,
        taller: {
          include: {
            sede: true,
            horarios: true,
            asistencias: {
              // Necesitamos las asistencias solo de este alumno
              orderBy: {
                fecha: 'desc'
              }
            }
          }
        }
      }
    });

    return inscripciones.map(inscripcion => ({
      id: inscripcion.taller.id,
      nombreAlumno: `${inscripcion.alumno.nombres} ${inscripcion.alumno.apellidos}`,
      nombre: inscripcion.taller.nombre,
      horario: inscripcion.taller.horarios.map(h => `${h.diaSemana} ${String(h.horaInicio).padStart(2,'0')}:${String(h.minutoInicio).padStart(2,'0')}${h.horaFin !== null ? ` a ${String(h.horaFin).padStart(2,'0')}:${String(h.minutoFin || 0).padStart(2,'0')}` : ''}`).join(' | '),
      sede: inscripcion.taller.sede.nombre,
      fechaInscripcion: inscripcion.fecha,
      asistencias: inscripcion.taller.asistencias.filter(a => a.alumnoId === inscripcion.alumnoId).map(a => ({
        fecha: a.fecha,
        estado: a.estado,
        estadoTexto: this.getEstadoTexto(a.estado)
      }))
    }));
  }

  /**
   * Ranking de asistencia por alumno (Auditado para ADMIN/COORD)
   */
  async getRankingAsistencia(limit: number = 50) {
    const alumnos = await this.prisma.alumno.findMany({
      select: {
        id: true,
        rut: true,
        nombres: true,
        apellidos: true,
        curso: true,
        establecimiento: { select: { nombre: true } },
        _count: {
          select: {
            asistencias: true,
            inscripciones: true
          }
        },
        asistencias: {
          select: { estado: true }
        }
      }
    });

    const ranking = alumnos.map(alumno => {
      const totalSesiones = alumno.asistencias.length;
      const presentes = alumno.asistencias.filter(a => a.estado === 'P').length;
      const porcentaje = totalSesiones > 0 
        ? Math.round((presentes / totalSesiones) * 100) 
        : 0;

      return {
        id: alumno.id,
        rut: alumno.rut,
        nombre: `${alumno.nombres} ${alumno.apellidos}`,
        curso: alumno.curso,
        establecimiento: alumno.establecimiento?.nombre || 'Sin asignación',
        totalSesiones,
        presentes,
        ausentes: totalSesiones - presentes,
        porcentaje,
        talleresInscritos: alumno._count.inscripciones
      };
    });

    // Ordenar por porcentaje y luego por total de sesiones (para dar peso a los que asisten más veces)
    return ranking
      .sort((a, b) => b.porcentaje - a.porcentaje || b.totalSesiones - a.totalSesiones)
      .slice(0, limit);
  }

  async getAlumnosPorTaller(tallerId: number) {
    // 1. Obtener el taller con su horario para generar el calendario
    const taller = await this.prisma.taller.findUnique({
      where: { id: tallerId },
      include: {
        sede: true,
        horarios: true,
        profesores: {
          include: { usuario: { select: { nombre: true, email: true } } }
        }
      }
    });

    if (!taller) return null;

    // 2. Calcular calendario real desde la fecha de inicio
    const fechasHabilitadas = this.generarFechasHabilitadas(taller.horarios);
    const sesionesEsperadas = fechasHabilitadas.length;

    // 3. Obtener alumnos inscritos con sus asistencias en ESTE taller
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { tallerId },
      include: {
        alumno: {
          select: {
            id: true,
            rut: true,
            nombres: true,
            apellidos: true,
            fechaNacimiento: true,
            curso: true,
            establecimiento: { select: { nombre: true } },
            apoderado: {
              select: { rut: true, nombre: true, telefono: true, email: true }
            },
            asistencias: {
              where: { tallerId },
              select: { fecha: true, estado: true },
              orderBy: { fecha: 'desc' }
            }
          }
        }
      },
      orderBy: { alumno: { apellidos: 'asc' } }
    });

    // 4. Enriquecer cada alumno con su % de asistencia real
    const alumnos = inscripciones.map(ins => {
      const presentes = ins.alumno.asistencias.filter(a => a.estado === 'P').length;
      const ausentes  = ins.alumno.asistencias.filter(a => a.estado === 'A').length;
      const porcentaje = sesionesEsperadas > 0
        ? Math.round((presentes / sesionesEsperadas) * 100)
        : null;

      return {
        ...ins.alumno,
        presentes,
        ausentes,
        sesionesRegistradas: ins.alumno.asistencias.length,
        sesionesEsperadas,
        porcentaje,
        alerta: ins.alumno.asistencias.length < sesionesEsperadas, // hubo clases sin registro
      };
    });

    return {
      taller: {
        id: taller.id,
        nombre: taller.nombre,
        sede: taller.sede?.nombre,
        horarioTexto: taller.horarios.map(h => h.diaSemana).join(', '),
        profesores: taller.profesores.map(p => p.usuario.nombre),
      },
      fechaInicioPrograma: FECHA_INICIO_PROGRAMA.toISOString().split('T')[0],
      fechasHabilitadas,     // Array de "YYYY-MM-DD" → para el DatePicker del frontend
      sesionesEsperadas,
      alumnos
    };
  }


  async findOne(id: number) {
    return this.prisma.taller.findUnique({ 
      where: { id },
      include: {
        sede: true,
        _count: {
          select: {
            inscripciones: true
          }
        }
      }
    });
  }

  // ─── Motor de Calendario Escolar ────────────────────────────────────────────

  /**
   * Mapea el nombre del día en español al número JS (0=Dom, 1=Lun, ..., 6=Sáb)
   */
  private diaNombreANumero(dia: string): number | null {
    const mapa: Record<string, number> = {
      'domingo': 0,
      'lunes': 1,
      'martes': 2,
      'miércoles': 3, 'miercoles': 3,
      'jueves': 4,
      'viernes': 5,
      'sábado': 6, 'sabado': 6,
    };
    return mapa[dia?.toLowerCase().trim()] ?? null;
  }

  /**
   * Genera todas las fechas habilitadas para un taller desde FECHA_INICIO_PROGRAMA
   * hasta hoy (o fecha fin si se provee), según los días del horario del taller.
   * Solo incluye días lectivos (Lunes-Viernes).
   */
  generarFechasHabilitadas(horarios: { diaSemana: string }[], fechaFin?: Date): string[] {
    const hoy = fechaFin ?? new Date();
    hoy.setHours(23, 59, 59, 999);

    // Si el programa aún no ha comenzado, retornar vacío
    if (hoy < FECHA_INICIO_PROGRAMA) return [];

    // Obtenemos los números de día únicos del horario del taller
    const diasClase = [...new Set(
      horarios
        .map(h => this.diaNombreANumero(h.diaSemana))
        .filter(d => d !== null && DIAS_LECTIVOS.includes(d))
    )] as number[];

    if (diasClase.length === 0) return [];

    const fechas: string[] = [];
    const cursor = new Date(FECHA_INICIO_PROGRAMA);

    while (cursor <= hoy) {
      if (diasClase.includes(cursor.getDay())) {
        // Formato YYYY-MM-DD en hora local de Chile
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getDate()).padStart(2, '0');
        fechas.push(`${yyyy}-${mm}-${dd}`);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return fechas;
  }

  /**
   * Calcula cuántas sesiones DEBIERON haber ocurrido hasta hoy
   * para un taller con el horario dado.
   */
  calcularSesionesEsperadas(horarios: { diaSemana: string }[]): number {
    return this.generarFechasHabilitadas(horarios).length;
  }

  private getEstadoTexto(estado: string): string {
    const estados = {
      'P': 'Presente',
      'A': 'Ausente',
    };
    return estados[estado] || estado;
  }
}