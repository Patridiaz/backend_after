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
        // ✅ Parsear por partes para evitar desfase UTC (new Date("YYYY-MM-DD") = UTC midnight
        //    y setHours opera en hora local, retrocediendo el día en UTC-4)
        const [y, m, d] = item.fecha.split('T')[0].split('-').map(Number);
        const fechaDate = new Date(y, m - 1, d, 0, 0, 0, 0); // Medianoche HORA LOCAL

        const registro = await tx.asistencia.upsert({
          where: {
            tallerId_alumnoId_fecha: {
              tallerId: dto.tallerId,
              alumnoId: item.alumnoId,
              fecha: fechaDate
            }
          },
          update: {
            estado: item.estado,
            registradoPor: autorId
          },
          create: {
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
    // ✅ Parsear por partes para evitar desfase UTC (new Date("YYYY-MM-DD") = UTC midnight
    //    y setHours opera en hora local, retrocediendo el día en UTC-4 Chile)
    const [y, m, d] = dto.fecha.split('T')[0].split('-').map(Number);
    const fechaDate = new Date(y, m - 1, d, 0, 0, 0, 0); // Medianoche HORA LOCAL
    const autorId = usuarioId || dto.profesorId;

    return await this.prisma.$transaction(async (tx) => {
      const resultados: any[] = [];

      for (const item of dto.lista) {
        const registro = await tx.asistencia.upsert({
          where: {
            tallerId_alumnoId_fecha: {
              tallerId: dto.tallerId,
              alumnoId: item.alumnoId,
              fecha: fechaDate
            }
          },
          update: {
            estado: item.estado,
            registradoPor: autorId
          },
          create: {
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
