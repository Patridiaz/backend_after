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
                  include: { sede: true }
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
        horario: i.taller.horario,
        sede: i.taller.sede.nombre
      }))
    }));
  }

  @Get('asistencia')
  @UseGuards(AuthGuard('jwt'))
  async getAsistenciaPupilos(@Req() req: any) {
    const user = req.user;
    if (user.tipo !== 'APODERADO') throw new UnauthorizedException();

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: user.userId },
      include: {
        alumnos: {
          include: {
            inscripciones: {
              include: { taller: true }
            },
            asistencias: {
              include: { taller: true },
              orderBy: { fecha: 'desc' }
            }
          }
        }
      }
    });

    if (!apoderado) {
      return [];
    }

    return apoderado.alumnos.map(alumno => {
      const totalAsistencias = alumno.asistencias.length;
      const presentes = alumno.asistencias.filter(a => a.estado === 'P').length;
      
      return {
        alumno: {
          id: alumno.id,
          nombre: `${alumno.nombres} ${alumno.apellidos}`,
          rut: alumno.rut
        },
        resumen: {
          totalClases: totalAsistencias,
          presentes: presentes,
          porcentaje: totalAsistencias > 0 ? ((presentes/totalAsistencias)*100).toFixed(1) : '0'
        },
        detalle: alumno.asistencias.map(a => ({
          fecha: a.fecha,
          estado: a.estado,
          taller: a.taller.nombre
        }))
      };
    });
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
