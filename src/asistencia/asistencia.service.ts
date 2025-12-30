import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TomarAsistenciaDto } from './dto/tomar-asistencia.dto';

@Injectable()
export class AsistenciaService {
  constructor(private prisma: PrismaService) {}

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

    // Usamos una transacción para que se guarden todos o ninguno
    return await this.prisma.$transaction(async (tx) => {
      const resultados: any[] = [];

      for (const item of dto.lista) {
        // Upsert: Si ya existe asistencia ese día, la actualiza (ej: cambiar Ausente a Presente)
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