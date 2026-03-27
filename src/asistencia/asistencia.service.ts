import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TomarAsistenciaDto } from './dto/tomar-asistencia.dto';
import { TomarAsistenciaMensualDto } from './dto/tomar-asistencia-mensual.dto';

@Injectable()
export class AsistenciaService {
  constructor(private prisma: PrismaService) {}


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

  async registrarAsistenciaMensual(dto: TomarAsistenciaMensualDto) {
    return await this.prisma.$transaction(async (tx) => {
      const resultados: any[] = [];
      for (const item of dto.cambios) {
        const fechaDate = new Date(item.fecha);
        // Ajustamos la fecha para que sea a medianoche (Date Only)
        fechaDate.setHours(0, 0, 0, 0);

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
            registradoPor: dto.profesorId
          },
          create: {
            tallerId: dto.tallerId,
            alumnoId: item.alumnoId,
            fecha: fechaDate,
            estado: item.estado,
            registradoPor: dto.profesorId
          }
        });
        resultados.push(registro);
      }
      return { totalProcesados: resultados.length, success: true };
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
  async registrarAsistencia(dto: TomarAsistenciaDto) {
    const fechaDate = new Date(dto.fecha);
    fechaDate.setHours(0, 0, 0, 0);

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
            registradoPor: dto.profesorId
          },
          create: {
            tallerId: dto.tallerId,
            alumnoId: item.alumnoId,
            fecha: fechaDate,
            estado: item.estado,
            registradoPor: dto.profesorId
          }
        });
        resultados.push(registro);
      }
      return resultados;
    });
  }
}