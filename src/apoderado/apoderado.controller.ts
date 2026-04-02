import { Controller, Get, Req, UseGuards, UnauthorizedException, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('apoderado')
export class ApoderadoController {
  constructor(private readonly prisma: PrismaService) {}

  // Roles permitidos para ver información de apoderados (Gestión Interna)
  private readonly rolesGestion = ['APODERADO', 'ADMIN', 'PROFESOR', 'ENCARGADO_ESCUELA', 'COORDINADOR'];

  private checkAccess(user: any) {
    if (!this.rolesGestion.includes(user.tipo)) {
      throw new UnauthorizedException('Acceso restringido.');
    }
  }

  @Get('mis-pupilos')
  @UseGuards(AuthGuard('jwt'))
  async getMisPupilos(@Req() req: any, @Query('apoderadoId') apoderadoId?: string) {
    const user = req.user;
    this.checkAccess(user);

    const targetId = (user.tipo !== 'APODERADO' && apoderadoId) ? parseInt(apoderadoId) : user.userId;

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: targetId },
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
  async getTalleresPupilos(@Req() req: any, @Query('apoderadoId') apoderadoId?: string) {
    const user = req.user;
    this.checkAccess(user);

    const targetId = (user.tipo !== 'APODERADO' && apoderadoId) ? parseInt(apoderadoId) : user.userId;

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: targetId },
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

    if (!apoderado) return [];

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
  async getDashboard(@Req() req: any, @Query('apoderadoId') apoderadoId?: string, @Query('rut') rut?: string) {
    const user = req.user;
    this.checkAccess(user);

    let targetId = user.userId;

    if (user.tipo !== 'APODERADO') {
      if (apoderadoId) {
        targetId = parseInt(apoderadoId);
      } else if (rut) {
        const rutLimpio = rut.trim().toUpperCase().replace(/[^0-9K]/g, '');
        const apoderadoByRut = await this.prisma.apoderado.findUnique({ where: { rut: rutLimpio } });
        if (!apoderadoByRut) {
          const rutConGuion = rutLimpio.length > 1 ? rutLimpio.slice(0, -1) + '-' + rutLimpio.slice(-1) : rutLimpio;
          const apoderadoGuion = await this.prisma.apoderado.findUnique({ where: { rut: rutConGuion } });
          if (!apoderadoGuion) throw new UnauthorizedException('Apoderado no encontrado por RUT.');
          targetId = apoderadoGuion.id;
        } else {
          targetId = apoderadoByRut.id;
        }
      }
    }

    const apoderadoData = await this.prisma.apoderado.findUnique({
      where: { id: targetId },
      include: {
        alumnos: {
          include: {
            establecimiento: true,
            apoderado: true,
            inscripciones: {
              include: { 
                taller: {
                  include: { sede: true, horarios: true }
                } 
              },
              orderBy: { fecha: 'desc' }
            },
            asistencias: {
              include: { taller: true },
              orderBy: { fecha: 'desc' },
              take: 5
            },
            _count: {
              select: { asistencias: true }
            }
          }
        }
      }
    });

    if (!apoderadoData) throw new UnauthorizedException('Apoderado no encontrado.');

    const alumnosConTodo = await Promise.all(apoderadoData.alumnos.map(async (alumno) => {
      const presentes = await this.prisma.asistencia.count({
        where: { alumnoId: alumno.id, estado: 'P' }
      });

      const totalClases = alumno._count.asistencias;
      const porcentajeAsistencia = totalClases > 0 ? Math.round((presentes / totalClases) * 100) : 0;
      
      const insc = alumno.inscripciones[0] || {};

      return {
        id: alumno.id,
        nombres: alumno.nombres,
        apellidos: alumno.apellidos,
        rut: alumno.rut,
        fechaNacimiento: alumno.fechaNacimiento,
        curso: alumno.curso || "",
        establecimientoNombre: alumno.establecimiento?.nombre || "",
        enfermedadCronica: insc.enfermedadCronica || false,
        enfermedadCronicaDetalle: insc.enfermedadCronicaDetalle || "",
        tratamientoMedico: insc.tratamientoMedico || "",
        alergias: insc.alergias || "",
        necesidadesEspeciales: insc.necesidadesEspeciales || false,
        necesidadesEspecialesDetalle: insc.necesidadesEspecialesDetalle || "",
        apoyoEscolar: insc.apoyoEscolar || "",
        usoImagen: insc.usoImagen || false,
        apoderadoRelacionado: {
          nombre: alumno.apoderado.nombre,
          rut: alumno.apoderado.rut,
          email: alumno.apoderado.email,
          telefono: alumno.apoderado.telefono
        },
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
        nombre: apoderadoData.nombre,
        email: apoderadoData.email,
        rut: apoderadoData.rut,
        telefono: apoderadoData.telefono
      },
      resumen: {
        totalPupilos: apoderadoData.alumnos.length,
        totalTalleres: apoderadoData.alumnos.reduce((acc, current) => acc + current.inscripciones.length, 0)
      },
      pupilos: alumnosConTodo
    };
  }

  @Get('asistencia')
  @UseGuards(AuthGuard('jwt'))
  async getAsistenciaPupilos(@Req() req: any, @Query('apoderadoId') apoderadoId?: string) {
    const user = req.user;
    this.checkAccess(user);

    const targetId = (user.tipo !== 'APODERADO' && apoderadoId) ? parseInt(apoderadoId) : user.userId;

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: targetId },
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
  async getPerfil(@Req() req: any, @Query('apoderadoId') apoderadoId?: string) {
    const user = req.user;
    this.checkAccess(user);

    const targetId = (user.tipo !== 'APODERADO' && apoderadoId) ? parseInt(apoderadoId) : user.userId;

    const apoderado = await this.prisma.apoderado.findUnique({
      where: { id: targetId },
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

    if (!apoderado && user.tipo !== 'APODERADO') throw new UnauthorizedException('Perfil de apoderado no encontrado.');

    return apoderado;
  }
}
