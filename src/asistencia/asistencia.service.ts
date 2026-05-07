import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TomarAsistenciaDto, EstadoAsistencia } from './dto/tomar-asistencia.dto';
import { TomarAsistenciaMensualDto } from './dto/tomar-asistencia-mensual.dto';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AsistenciaService {
  constructor(private prisma: PrismaService, private mailService: MailService) {}



  async obtenerAsistenciaMensual(tallerId: number, mes: number, anio: number) {
    const fechaInicio = new Date(anio, mes - 1, 1);
    const fechaFin = new Date(anio, mes, 0, 23, 59, 59);

    return this.prisma.asistencia.findMany({
      where: {
        tallerId: tallerId,
        fecha: {
          gte: fechaInicio,
          lte: fechaFin
        }
      },
      select: {
        alumnoId: true,
        fecha: true,
        estado: true
      }
    });
  }

  async registrarAsistenciaMensual(dto: TomarAsistenciaMensualDto, usuarioId?: number) {
    return await this.prisma.$transaction(async (tx) => {
      const resultados: any[] = [];
      const autorId = usuarioId || dto.profesorId; // Prioridad al usuario logueado

      for (const item of dto.cambios) {
        // ✅ Forzar Mediodía UTC para evitar desfases de zona horaria (mismo criterio que TalleresController)
        const fechaDate = new Date(`${item.fecha.split('T')[0]}T12:00:00.000Z`);

        // Borrar cualquier registro previo para este alumno/taller/día (independiente de la hora exacta) para evitar duplicados
        const dStart = new Date(`${item.fecha.split('T')[0]}T00:00:00.000Z`);
        const dEnd = new Date(`${item.fecha.split('T')[0]}T23:59:59.999Z`);
        
        await tx.asistencia.deleteMany({
          where: {
            tallerId: dto.tallerId,
            alumnoId: item.alumnoId,
            fecha: { gte: dStart, lte: dEnd }
          }
        });

        const registro = await tx.asistencia.create({
          data: {
            tallerId: dto.tallerId,
            alumnoId: item.alumnoId,
            fecha: fechaDate,
            estado: item.estado,
            registradoPor: autorId
          }
        });
        resultados.push(registro);
      }
      return { totalProcesados: resultados.length, success: true, presentesParaCheck: dto.cambios.filter(c => c.estado === EstadoAsistencia.PRESENTE).map(c => c.alumnoId) };
    }).then(async res => {
       const distinctAlumnos = Array.from(new Set(res.presentesParaCheck));
       for(const id of distinctAlumnos) {
          await this.checkAndSendConsecutiveAttendanceEmail(dto.tallerId, id);
       }
       return { totalProcesados: res.totalProcesados, success: res.success };
    });
  }

  // Obtener la "Hoja de vida" del taller para el profesor
  async obtenerAlumnosDeTaller(tallerId: number) {
    return this.prisma.taller.findUnique({
      where: { id: tallerId },
      include: {
        inscripciones: {
          include: {
            alumno: true // Traemos los nombres de los alumnos
          }
        }
      }
    });
  }

  // Guardar o Actualizar Asistencia Masiva
  async registrarAsistencia(dto: TomarAsistenciaDto, usuarioId?: number) {
    const autorId = usuarioId || dto.profesorId;

    return await this.prisma.$transaction(async (tx) => {
      const resultados: any[] = [];
      
      // ✅ Forzar Mediodía UTC para evitar desfases (mismo criterio que TalleresController)
      const fechaDate = new Date(`${dto.fecha.split('T')[0]}T12:00:00.000Z`);
      const dStart = new Date(`${dto.fecha.split('T')[0]}T00:00:00.000Z`);
      const dEnd = new Date(`${dto.fecha.split('T')[0]}T23:59:59.999Z`);

      // 1. Limpieza preventiva del día para este taller (Evita duplicados por desfase horario en la PK)
      await tx.asistencia.deleteMany({
        where: {
          tallerId: dto.tallerId,
          fecha: { gte: dStart, lte: dEnd }
        }
      });

      // 2. Inserción masiva del nuevo estado
      for (const item of dto.lista) {
        const registro = await tx.asistencia.create({
          data: {
            tallerId: dto.tallerId,
            alumnoId: item.alumnoId,
            fecha: fechaDate,
            estado: item.estado,
            registradoPor: autorId
          }
        });
        resultados.push(registro);
      }
      return { resultados, presentesParaCheck: dto.lista.filter(c => c.estado === EstadoAsistencia.PRESENTE).map(c => c.alumnoId) };
    }).then(async res => {
       const distinctAlumnos = Array.from(new Set(res.presentesParaCheck));
       for(const id of distinctAlumnos) {
          await this.checkAndSendConsecutiveAttendanceEmail(dto.tallerId, id);
       }
       return res.resultados;
    });
  }

  private async checkAndSendConsecutiveAttendanceEmail(tallerId: number, alumnoId: number) {
    try {
      const asistencias = await this.prisma.asistencia.findMany({
        where: { tallerId, alumnoId },
        orderBy: { fecha: 'desc' }
      });

      let consecutives = 0;
      for (const a of asistencias) {
        if (a.estado === EstadoAsistencia.PRESENTE || a.estado === 'P') consecutives++;
        else break;
      }

      if (consecutives > 0 && consecutives % 5 === 0) {
        const info = await this.prisma.taller.findUnique({
          where: { id: tallerId },
          include: {
             inscripciones: {
                where: { alumnoId },
                include: { alumno: { include: { apoderado: true } } }
             }
          }
        });

        if (info && info.inscripciones.length > 0) {
           const inscripcion = info.inscripciones[0];
           const alumno = inscripcion.alumno;
           const apoderado = alumno.apoderado;
           if (apoderado && apoderado.email) {
              await this.mailService.sendConsecutiveAttendanceEmail(
                 apoderado.email,
                 alumno.nombres,
                 info.nombre,
                 consecutives
              );
           }
        }
      }
    } catch (e) {
      console.error('Error al procesar email de asistencia consecutiva:', e);
    }
  }
}
