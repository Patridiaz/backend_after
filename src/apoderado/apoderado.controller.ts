import { Controller, Get, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('apoderado')
export class ApoderadoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('mis-pupilos')
  @UseGuards(AuthGuard('jwt'))
  async getMisPupilos(@Req() req: any) {
    const user = req.user;

    if (user.tipo !== 'APODERADO') {
       throw new UnauthorizedException('Acceso solo para apoderados.');
    }

    // Traemos el apoderado con sus alumnos
    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: user.userId },
      include: {
        alumnos: {
          select: {
            id: true,
            rut: true,
            nombres: true,
            apellidos: true,
            curso: true,
            fechaNacimiento: true
          }
        }
      }
    });

    return apoderado?.alumnos || [];
  }

  @Get('talleres')
  @UseGuards(AuthGuard('jwt'))
  async getTalleresPupilos(@Req() req: any) {
    const user = req.user;
    if (user.tipo !== 'APODERADO') throw new UnauthorizedException();

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: user.userId },
      include: {
        alumnos: {
          include: {
            inscripciones: {
              include: {
                taller: {
                  include: { sede: true, horarios: true }
                }
              }
            }
          }
        }
      }
    });

    if (!apoderado) {
      return [];
    }

    return apoderado.alumnos.map(alumno => ({
      alumno: {
        id: alumno.id,
        nombre: `${alumno.nombres} ${alumno.apellidos}`,
        rut: alumno.rut
      },
      talleres: alumno.inscripciones.map(i => ({
        id: i.taller.id,
        nombre: i.taller.nombre,
        horario: i.taller.horarios?.map(h => `${h.diaSemana} ${h.horaInicio.toString().padStart(2, '0')}:${h.minutoInicio.toString().padStart(2, '0')}${h.horaFin !== null ? ` a ${h.horaFin.toString().padStart(2, '0')}:${(h.minutoFin || 0).toString().padStart(2, '0')}` : ''}`).join(' | ') || '',
        sede: i.taller.sede.nombre
      }))
    }));
  }

  @Get('dashboard')
  @UseGuards(AuthGuard('jwt'))
  async getDashboard(@Req() req: any) {
    const user = req.user;
    if (user.tipo !== 'APODERADO') throw new UnauthorizedException('Acceso solo para apoderados.');

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: user.userId },
      include: {
        alumnos: {
          include: {
            inscripciones: {
              include: { 
                taller: {
                  include: { sede: true, horarios: true }
                } 
              }
            },
            asistencias: {
              include: { taller: true },
              orderBy: { fecha: 'desc' },
              take: 5 // Solo las últimas 5 para el dashboard
            },
            _count: {
              select: { asistencias: true }
            }
          }
        }
      }
    });

    if (!apoderado) throw new UnauthorizedException('Apoderado no encontrado.');

    // Calcular estadísticas adicionales para cada alumno
    const alumnosConEstadisticas = await Promise.all(apoderado.alumnos.map(async (alumno) => {
      // Obtener conteo de presentes
      const presentes = await this.prisma.asistencia.count({
        where: {
          alumnoId: alumno.id,
          estado: 'P'
        }
      });

      const totalClases = alumno._count.asistencias;
      const porcentajeAsistencia = totalClases > 0 
        ? Math.round((presentes / totalClases) * 100) 
        : 0;

      return {
        id: alumno.id,
        nombres: alumno.nombres,
        apellidos: alumno.apellidos,
        rut: alumno.rut,
        curso: alumno.curso,
        porcentajeAsistencia,
        talleres: alumno.inscripciones.map(i => ({
          id: i.taller.id,
          nombre: i.taller.nombre,
          sede: i.taller.sede.nombre,
          horario: i.taller.horarios?.map(h => `${h.diaSemana} ${h.horaInicio.toString().padStart(2, '0')}:${h.minutoInicio.toString().padStart(2, '0')}${h.horaFin !== null ? ` a ${h.horaFin.toString().padStart(2, '0')}:${(h.minutoFin || 0).toString().padStart(2, '0')}` : ''}`).join(' | ') || '',
          cuposDisponibles: i.taller.cuposDisponibles
        })),
        asistenciasRecientes: alumno.asistencias.map(a => ({
          fecha: a.fecha,
          estado: a.estado,
          taller: a.taller.nombre
        }))
      };
    }));

    return {
      perfil: {
        nombre: apoderado.nombre,
        email: apoderado.email,
        rut: apoderado.rut,
        telefono: apoderado.telefono
      },
      resumen: {
        totalPupilos: apoderado.alumnos.length,
        totalTalleres: apoderado.alumnos.reduce((acc, current) => acc + current.inscripciones.length, 0)
      },
      pupilos: alumnosConEstadisticas
    };
  }

  @Get('asistencia')
  @UseGuards(AuthGuard('jwt'))
  async getAsistenciaPupilos(@Req() req: any) {
    const user = req.user;
    if (user.tipo !== 'APODERADO') throw new UnauthorizedException('Solo apoderados.');

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: user.userId },
      include: {
        alumnos: {
          include: {
            asistencias: {
              include: { taller: true },
              orderBy: { fecha: 'desc' }
            }
          }
        }
      }
    });

    return apoderado?.alumnos.map(al => ({
      alumno: `${al.nombres} ${al.apellidos}`,
      asistencias: al.asistencias
    })) || [];
  }

  @Get('perfil')
  @UseGuards(AuthGuard('jwt'))
  async getPerfil(@Req() req: any) {
    const user = req.user;
    if (user.tipo !== 'APODERADO') throw new UnauthorizedException();

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        rut: true,
        nombre: true,
        email: true,
        telefono: true,
        createdAt: true,
        _count: {
          select: { alumnos: true }
        }
      }
    });

    return apoderado;
  }
}
