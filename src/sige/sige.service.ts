import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CargaSigeDto } from './dto/carga-sige.dto';

@Injectable()
export class SigeService {
  constructor(private prisma: PrismaService) {}

  async cargarMasivo(dto: CargaSigeDto) {
    const { sedeId, alumnos } = dto;

    if (!alumnos || alumnos.length === 0) {
      throw new BadRequestException('El array de alumnos está vacío.');
    }

    let insertados = 0;
    let actualizados = 0;

    for (const row of alumnos) {
      // Obtenemos el RUNC (ID único)
      const runcRaw = row['RUNC'] || row['RUNC(CONCATENADO EL RUT MAS DV)'];
      let runc = runcRaw ? runcRaw.toString().trim().toUpperCase().replace(/[^0-9K]/g, '') : null;
      if (runc && runc.length > 1) {
        // Insertar guión antes del último dígito: xxxxxxxx-x
        runc = runc.slice(0, -1) + '-' + runc.slice(-1);
      }
      
      let anioFromRow = row['Año'] || row['Anio'] || row['AÑO'] || new Date().getFullYear();
      let anio = parseInt(anioFromRow.toString(), 10);
      if (isNaN(anio)) anio = new Date().getFullYear();

      if (!runc) continue; 

      // Mapeo de datos
      const dataMapping = {
        descGrado: (row['DESC_GRADO'] || row['Desc Grado'])?.toString() || null,
        letraCurso: (row['LETRA_CURSO'] || row['Letra Curso'])?.toString() || null,
        run: (row['RUN'] || row['Run'])?.toString() || null,
        dv: (row['DV'] || row['Dígito Ver.'])?.toString() || null,
        genero: (row['GENERO'] || row['Genero'])?.toString() || null,
        nombres: (row['NOMBRES'] || row['Nombres'])?.toString() || null,
        apellidoPaterno: (row['APELLIDO_PATERNO'] || row['Apellido Paterno'])?.toString() || null,
        apellidoMaterno: (row['APELLIDO_MATERNO'] || row['Apellido Materno'])?.toString() || null,
        email: (row['EMAIL'] || row['Email'])?.toString() || null,
        fechaNacimiento: this.formatExcelDate(row['FECHA_NACIMIENTO'] || row['Fecha Nacimiento']),
        fechaIncorporacion: this.formatExcelDate(row['FECHA_MATRICULA'] || row['Fecha Incorporación Curso']),
        fechaRetiro: this.formatExcelDate(row['FECHA_RETIRO'] || row['Fecha Retiro']),
        nombrec: (row['NOMBREC'] || row['NOMBREC(CONCATENADO EL NOMBRE COMPLETO)'])?.toString() || null,
        
        rbd: row['RBD'] ? parseInt(row['RBD'].toString()) : null,
        codTipoEnsenanza: row['Cod Tipo Enseñanza'] ? parseInt(row['Cod Tipo Enseñanza'].toString()) : null,
        codGrado: row['Cod Grado'] ? parseInt(row['Cod Grado'].toString()) : null,
        direccion: row['Dirección']?.toString() || null,
        comunaResidencia: row['Comuna Residencia']?.toString() || null,
        codigoComuna: row['Código Comuna Residencia']?.toString() || null,
        telefono: row['Telefono']?.toString() || null,
        celular: row['Celular']?.toString() || null,
        codigoEtnia: row['Código Etnia']?.toString() || null,
        porcentajeAsistencia: row['%Asistenca'] ? parseFloat(row['%Asistenca'].toString().replace('%', '').replace(',', '.')) : null,
        promedioFinal: row['Promedio Final'] ? parseFloat(row['Promedio Final'].toString().replace(',', '.')) : null,
      };

      // Usar UPSERT para optimizar round-trips y estabilidad en MSSQL
      try {
        const result = await this.prisma.alumnoSige.upsert({
          where: {
            runc_anio_sedeId: {
              runc: runc,
              anio: anio,
              sedeId: sedeId
            }
          },
          update: { ...dataMapping, anio },
          create: { 
            runc, 
            anio, 
            sedeId, 
            ...dataMapping 
          }
        });
        
        // Determinar si fue insertado o actualizado (aproximado por timestamps)
        const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
        if (isNew) insertados++; else actualizados++;
        
      } catch (error) {
        console.error(`Error procesando alumno ${runc}:`, error.message);
      }
    }

    return {
      success: true,
      message: 'Carga masiva completada exitosamente',
      resumen: {
        totalProcesados: alumnos.length,
        insertados,
        actualizados,
        fallidos: alumnos.length - (insertados + actualizados)
      }
    };
  }

  // Opcional: Obtener lista de alumnos cargados por sede
  async getPorSede(sedeId: number) {
    return this.prisma.alumnoSige.findMany({
      where: { sedeId },
      orderBy: { apellidoPaterno: 'asc' }
    });
  }

  // Obtener MÉTRICAS orientadas a Dashboard para alumnos SIGE
  async getMetricsPorSede(sedeId: number) {
    const total = await this.prisma.alumnoSige.count({ where: { sedeId } });

    const porGenero = await this.prisma.alumnoSige.groupBy({
      by: ['genero'],
      where: { sedeId },
      _count: { id: true }
    });

    const porGrado = await this.prisma.alumnoSige.groupBy({
      by: ['descGrado'],
      where: { sedeId },
      _count: { id: true },
      orderBy: { descGrado: 'asc' }
    });

    const promedioAsistencia = await this.prisma.alumnoSige.aggregate({
      where: { sedeId },
      _avg: { porcentajeAsistencia: true }
    });

    return {
      totalAlumnos: total,
      generoDistribution: porGenero.map(g => ({
        label: g.genero || 'No especificado',
        value: g._count.id
      })),
      gradoDistribution: porGrado.map(g => ({
        label: g.descGrado || 'Sin Grado',
        value: g._count.id
      })),
      asistenciaPromedioGeneral: promedioAsistencia._avg.porcentajeAsistencia || 0,
      timestamp: new Date()
    };
  }

  // MÉTRICAS CRUZADAS: Sige vs Plataforma (Para ver quién falta inscribirse)
  async getInscritosSigeMetrics(sedeId: number) {
    // 1. Obtener todos los alumnos del SIGE para esta sede
    const alumnosSige = await this.prisma.alumnoSige.findMany({
      where: { sedeId },
      select: { runc: true, nombres: true, apellidoPaterno: true, descGrado: true }
    });

    // 2. Obtener todos los alumnos registrados en el sistema (Plataforma)
    const alumnosPlataforma = await this.prisma.alumno.findMany({
      select: { rut: true }
    });

    // 3. Cruzar datos (Mapeamos RUTs registrados para búsqueda rápida)
    const rutsRegistrados = new Set(alumnosPlataforma.map(a => a.rut.toUpperCase().replace(/\./g, '').replace(/-/g, '')));
    
    const alumnosNoRegistrados = alumnosSige.filter(sige => {
      const runcClean = sige.runc.toUpperCase().replace(/\./g, '').replace(/-/g, '');
      return !rutsRegistrados.has(runcClean);
    });

    const totalSige = alumnosSige.length;
    const totalRegistrados = totalSige - alumnosNoRegistrados.length;
    const porcentajeCobertura = totalSige > 0 ? (totalRegistrados / totalSige) * 100 : 0;

    return {
      resumen: {
        totalSige,
        totalEnPlataforma: totalRegistrados,
        porcentajeCobertura: Math.round(porcentajeCobertura * 100) / 100,
        alumnosPendientes: alumnosNoRegistrados.length
      },
      // Top 10 alumnos sugeridos para invitar (los que no están en plataforma)
      sugerenciasInvitado: alumnosNoRegistrados.slice(0, 50).map(a => ({
        nombreCompleto: `${a.nombres} ${a.apellidoPaterno}`,
        grado: a.descGrado,
        runc: a.runc
      })),
      timestamp: new Date()
    };
  }

  // COMPARATIVA GLOBAL: Todas las sedes (Sige vs Plataforma) para Gráfico de Barras Doble
  // COMPARATIVA GLOBAL: Todas las sedes (Sige vs Inscritos en talleres)
  async getGlobalEnrollmentComparison() {
    // 1. Obtener todas las sedes
    const sedes = await this.prisma.sede.findMany({
      include: {
        _count: { select: { alumnosSige: true } }
      }
    });

    const comparison = await Promise.all(sedes.map(async (sede) => {
      // 2. Obtener todos los alumnos del SIGE para esta sede
      const sigeAlumnos = await this.prisma.alumnoSige.findMany({
        where: { sedeId: sede.id },
        select: { runc: true }
      });
      const sigeRutsSet = new Set(sigeAlumnos.map(s => s.runc.toUpperCase().trim().replace(/\./g, '').replace(/-/g, '')));

      // 3. Obtener RUTs únicos de alumnos con Inscripción ACTIVA en esta sede 
      // (Buscamos inscripciones en talleres que pertenecen a esta sede)
      const inscritosSede = await this.prisma.inscripcion.findMany({
        where: {
          taller: { sedeId: sede.id }
        },
        select: {
          alumno: { select: { rut: true } }
        }
      });

      // Aseguramos unicidad de RUTs inscritos en la sede
      const rutsEnSede = new Set(inscritosSede.map(i => i.alumno.rut.toUpperCase().trim().replace(/\./g, '').replace(/-/g, '')));

      // 4. Contamos cuántos de los inscritos reales ESTÁN en la lista oficial del SIGE para esta sede
      let matchedCount = 0;
      rutsEnSede.forEach(rut => {
        if (sigeRutsSet.has(rut)) {
          matchedCount++;
        }
      });

      return {
        sedeId: sede.id,
        nombreSede: sede.nombre,
        totalSigeOficial: sigeAlumnos.length,
        totalInscritosReales: rutsEnSede.size,
        totalMatchSige: matchedCount,
        brecha: sigeAlumnos.length - matchedCount
      };
    }));

    // Ordenamos por relevancia (más alumnos SIGE primero)
    return comparison.sort((a, b) => b.totalSigeOficial - a.totalSigeOficial);
  }

  // VERIFICAR ALUMNO: Solo por RUT (Incluye información del alumno)
  async verificarRut(rut: string) {
    if (!rut || rut.trim() === '') return { found: false };

    // Limpiamos los símbolos del input para tener el "esqueleto" numérico
    const cleanInput = rut.trim().toUpperCase().replace(/[^0-9K]/g, '');
    if (cleanInput.length < 2) return { found: false };

    // Creamos la versión con guión (estándar Lirmi)
    const hyphenated = cleanInput.slice(0, -1) + '-' + cleanInput.slice(-1);
    
    // Buscamos de forma muy permisiva (Exacta, con guion, sin guion, o parcial)
    const sigeData = await this.prisma.alumnoSige.findFirst({
      where: {
        OR: [
          { runc: cleanInput },     // Ej: 12345678K
          { runc: hyphenated },     // Ej: 12345678-K
          { runc: { contains: cleanInput } },      // Captura formatos con puntos
          { runc: { contains: hyphenated } }       // Captura cualquier variante
        ]
      },
      include: {
        sede: true
      },
      orderBy: { anio: 'desc' }
    });

    if (!sigeData) {
      // Intento final quitando ceros a la izquierda (común en importaciones)
      const cleanNoZeros = cleanInput.replace(/^0+/, '');
      if (cleanNoZeros !== cleanInput) {
        const hyphenatedNoZeros = cleanNoZeros.slice(0, -1) + '-' + cleanNoZeros.slice(-1);
        const retry = await this.prisma.alumnoSige.findFirst({
          where: {
            OR: [
              { runc: cleanNoZeros },
              { runc: hyphenatedNoZeros },
              { runc: { contains: cleanNoZeros } }
            ]
          },
          include: { sede: true },
          orderBy: { anio: 'desc' }
        });
        if (retry) return this.formatSigeResponse(retry);
      }
      return { found: false };
    }

    return this.formatSigeResponse(sigeData);
  }

  // Formateador interno
  private formatSigeResponse(sige: any) {
    return {
      found: true,
      data: {
        nombres: sige.nombres,
        apellidoPaterno: sige.apellidoPaterno,
        apellidoMaterno: sige.apellidoMaterno,
        fechaNacimiento: sige.fechaNacimiento, // Regresamos la fecha oficial
        sedeId: sige.sedeId,
        sedeNombre: sige.sede.nombre,
        email: sige.email,
        runcOficial: sige.runc // RUT tal cual está en la BD
      }
    };
  }

  // FUNCIÓN DE MANTENIMIENTO: Normaliza RUTs y FECHAS existentes en la base de datos
  async fixAllRuts() {
    const todos = await this.prisma.alumnoSige.findMany();
    let rutsCorregidos = 0;
    let fechasCorregidas = 0;

    for (const alumno of todos) {
      // 1. Corregir RUT (con guión)
      let cleanRunc = alumno.runc.toUpperCase().trim().replace(/[^0-9K]/g, '');
      if (cleanRunc.length > 1) {
        cleanRunc = cleanRunc.slice(0, -1) + '-' + cleanRunc.slice(-1);
      }

      // 2. Corregir Fechas
      const nuevaFechaNac = this.formatExcelDate(alumno.fechaNacimiento);
      const nuevaFechaInc = this.formatExcelDate(alumno.fechaIncorporacion);
      const nuevaFechaRet = this.formatExcelDate(alumno.fechaRetiro);

      const dataToUpdate: any = {};
      let needsUpdate = false;

      if (cleanRunc !== alumno.runc) {
        dataToUpdate.runc = cleanRunc;
        rutsCorregidos++;
        needsUpdate = true;
      }

      if (nuevaFechaNac !== alumno.fechaNacimiento) {
        dataToUpdate.fechaNacimiento = nuevaFechaNac;
        fechasCorregidas++;
        needsUpdate = true;
      }

      if (nuevaFechaInc !== alumno.fechaIncorporacion) {
        dataToUpdate.fechaIncorporacion = nuevaFechaInc;
        if (cleanRunc === alumno.runc) fechasCorregidas++; // Solo sumar una si no se sumó en RUT
        needsUpdate = true;
      }

      if (nuevaFechaRet !== alumno.fechaRetiro) {
        dataToUpdate.fechaRetiro = nuevaFechaRet;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await this.prisma.alumnoSige.update({
          where: { id: alumno.id },
          data: dataToUpdate
        });
      }
    }

    return {
      message: 'Mantenimiento de RUTs y FECHAS completado',
      totalProcesados: todos.length,
      rutsCorregidos,
      fechasCorregidas
    };
  }

  // Helper para formatear fechas de Excel (pueden venir como números o strings)
  private formatExcelDate(value: any): string | null {
    if (!value) return null;

    // Si es un número (formato serial de Excel)
    if (typeof value === 'number') {
      const date = new Date(Math.round((value - 25569) * 864e5));
      return date.toISOString().split('T')[0]; // Devuelve YYYY-MM-DD
    }

    // Si ya es un string, intentamos normalizarlo
    const dateStr = value.toString().trim();
    if (dateStr === '' || dateStr.toLowerCase() === 'null') return null;

    // Intentar parsear si parece una fecha válida
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split('T')[0];
    }

    return dateStr;
  }

  // ELIMINAR TODOS LOS REGISTROS: Para empezar desde cero con datos limpios
  async vaciarSige() {
    const { count } = await this.prisma.alumnoSige.deleteMany();
    return {
      message: 'Base de datos SIGE vaciada exitosamente',
      registrosEliminados: count
    };
  }
}
