import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { differenceInYears } from 'date-fns';
import { CreateSedeDto } from './dto/create-sede.dto';
import { CreateTallerDto } from './dto/create-taller.dto';
import { AssignProfesorDto } from './dto/assign-profesor.dto';

@Injectable()
export class TalleresService {
  constructor(private prisma: PrismaService) {}

  // --- ADMINISTRACIÓN ---

  async createSede(dto: CreateSedeDto) {
    return this.prisma.sede.create({
      data: dto
    });
  }

  async createTaller(dto: CreateTallerDto) {
    const { sedeId, ...tallerData } = dto;
    return this.prisma.taller.create({
      data: {
        ...tallerData,
        cuposDisponibles: dto.cuposTotales, // Al inicio, disponibles = totales
        sedeId: sedeId
      }
    });
  }

  async assignProfesor(dto: AssignProfesorDto) {
    // Verificamos si ya existe la asignación
    const existing = await this.prisma.profesorTaller.findUnique({
      where: {
        usuarioId_tallerId: {
          usuarioId: dto.usuarioId,
          tallerId: dto.tallerId
        }
      }
    });

    if (existing) {
      throw new ConflictException('El profesor ya está asignado a este taller.');
    }

    return this.prisma.profesorTaller.create({
      data: {
        usuarioId: dto.usuarioId,
        tallerId: dto.tallerId
      }
    });
  }

  // Listar TODOS los talleres (Vista Admin)
  async getAllTalleres() {
    return this.prisma.taller.findMany({
      include: {
        sede: true,
        profesores: true, // Incluimos la relación intermedia
        _count: {
          select: { inscripciones: true }
        }
      },
      orderBy: { nombre: 'asc' }
    });
  }

  // Traer usuarios con rol PROFESOR desde ticket-service
  async getAllProfesores() {
    const query = `
      SELECT DISTINCT
        u.id, 
        u.email, 
        u.name,
        u.isActive
      FROM [ticket-service].[dbo].[user] u
      JOIN [ticket-service].[dbo].[user_roles] ur ON u.id = ur.userId
      JOIN [ticket-service].[dbo].[rolUser] r ON ur.rolUserId = r.id
      WHERE (r.nombre = 'PROFESOR' OR r.nombre = 'profesor') AND u.isActive = 1
      ORDER BY u.name ASC
    `;

    try {
      const profesores = await this.prisma.$queryRawUnsafe(query);
      return profesores;
    } catch (error) {
      console.error("Error obteniendo profesores:", error);
      return [];
    }
  }

  // --- CONSULTAS PÚBLICAS ---

  async findAllSedes() {
    return this.prisma.sede.findMany();
  }

  async findAvailable(sedeId: number, fechaNacimientoStr: string) {
    const fechaNacimiento = new Date(fechaNacimientoStr);
    const edad = differenceInYears(new Date(), fechaNacimiento);

    return this.prisma.taller.findMany({
      where: {
        sedeId: sedeId,
        cuposDisponibles: { gt: 0 },
        edadMinima: { lte: edad },
        edadMaxima: { gte: edad },
      },
      select: {
        id: true,
        nombre: true,
        horario: true,
        cuposDisponibles: true,
        descripcion: true
      }
    });
  }

  /**
   * Talleres asignados a un PROFESOR (desde ticket-service)
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
   * Talleres en los que está inscrito un ALUMNO
   */
  async findByAlumno(alumnoId: number) {
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { alumnoId: alumnoId },
      include: {
        taller: {
          include: {
            sede: true,
            asistencias: {
              where: {
                alumnoId: alumnoId
              },
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
      nombre: inscripcion.taller.nombre,
      horario: inscripcion.taller.horario,
      sede: inscripcion.taller.sede.nombre,
      fechaInscripcion: inscripcion.fecha,
      asistencias: inscripcion.taller.asistencias.map(a => ({
        fecha: a.fecha,
        estado: a.estado,
        estadoTexto: this.getEstadoTexto(a.estado)
      }))
    }));
  }

  /**
   * Lista de alumnos inscritos en un taller (para profesores)
   */
  async getAlumnosPorTaller(tallerId: number) {
    return this.prisma.inscripcion.findMany({
      where: { 
        tallerId: tallerId,
      },
      include: {
        alumno: {
          select: {
            id: true,
            rut: true,
            nombres: true,
            apellidos: true,
            curso: true,
            apoderado: {
              select: {
                nombre: true,
                telefono: true,
                email: true
              }
            },
            asistencias: {
              where: {
                tallerId: tallerId
              },
              orderBy: {
                fecha: 'desc'
              },
              take: 10 // Últimas 10 asistencias
            }
          }
        }
      },
      orderBy: {
        alumno: {
          apellidos: 'asc'
        }
      }
    });
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

  private getEstadoTexto(estado: string): string {
    const estados = {
      'P': 'Presente',
      'A': 'Ausente',
      'J': 'Justificado',
      'R': 'Retraso'
    };
    return estados[estado] || estado;
  }
}