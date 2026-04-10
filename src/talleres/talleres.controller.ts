import { Controller, Get, Param, Query, Req, UseGuards, Post, Body, UnauthorizedException, Patch, Delete } from '@nestjs/common';
import { TalleresService } from './talleres.service';
import { FilterTallerDto } from './dto/filter-taller.dto';
import { CreateSedeDto } from './dto/create-sede.dto';
import { UpdateSedeDto } from './dto/update-sede.dto';
import { CreateTallerDto } from './dto/create-taller.dto';
import { UpdateTallerDto } from './dto/update-taller.dto';
import { AssignProfesorDto } from './dto/assign-profesor.dto';
import { AuthGuard } from '@nestjs/passport';

import { AnalyticsService } from '../analytics/analytics.service';

import { AuditService } from '../audit/audit.service';

@Controller('talleres')
export class TalleresController {
  constructor(
    private readonly talleresService: TalleresService,
    private readonly analyticsService: AnalyticsService,
    private readonly auditService: AuditService
  ) {}

  // --- ENDPOINTS ADMINISTRADOR ---

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateTaller(@Param('id') id: string, @Body() dto: UpdateTallerDto, @Req() req: any) {
    this.checkAdmin(req.user);
    const res = await this.talleresService.updateTaller(+id, dto);
    await this.auditService.log('UPDATE', 'Taller', +id, JSON.stringify(dto), req.user.nombre);
    return res;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteTaller(@Param('id') id: string, @Req() req: any) {
    this.checkAdmin(req.user);
    const res = await this.talleresService.deleteTaller(+id);
    await this.auditService.log('DELETE', 'Taller', +id, `Eliminado taller ID ${id}`, req.user.nombre);
    return res;
  }

  @Post('sede')
  @UseGuards(AuthGuard('jwt'))
  async createSede(@Body() dto: CreateSedeDto, @Req() req: any) {
    this.checkAdmin(req.user);
    const res = await this.talleresService.createSede(dto);
    await this.auditService.log('CREATE', 'Sede', res.id, `Sede creada: ${dto.nombre}`, req.user.nombre);
    return res;
  }

  @Patch('sede/:id')
  @UseGuards(AuthGuard('jwt'))
  async updateSede(@Param('id') id: string, @Body() dto: UpdateSedeDto, @Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.updateSede(+id, dto);
  }

  @Delete('sede/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteSede(@Param('id') id: string, @Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.deleteSede(+id);
  }

  @Post('nuevo')
  @UseGuards(AuthGuard('jwt'))
  async createTaller(@Body() dto: CreateTallerDto, @Req() req: any) {
    this.checkAdmin(req.user);
    const res = await this.talleresService.createTaller(dto);
    await this.auditService.log('CREATE', 'Taller', res.id, `Taller creado: ${dto.nombre}`, req.user.nombre);
    return res;
  }

  @Post('asignar-profesor')
  @UseGuards(AuthGuard('jwt'))
  async assignProfesor(@Body() dto: AssignProfesorDto, @Req() req: any) {
     this.checkAdmin(req.user);
     return this.talleresService.assignProfesor(dto);
  }

  @Post('desasignar-profesor')
  @UseGuards(AuthGuard('jwt'))
  async unassignProfesor(@Body() dto: AssignProfesorDto, @Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.unassignProfesor(dto);
  }

  @Get('admin/todos')
  @UseGuards(AuthGuard('jwt'))
  async getAllTalleres(@Req() req: any) {
    this.checkAdminOrCoordinador(req.user);
    return this.talleresService.getAllTalleres();
  }

  @Get('admin/profesores')
  @UseGuards(AuthGuard('jwt'))
  async getListaProfesores(@Req() req: any) {
    this.checkAdminOrCoordinador(req.user);
    return this.talleresService.getAllProfesores();
  }

  private checkAdmin(user: any) {
    const isAdmin = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'ADMIN');
    if (!isAdmin) {
      throw new UnauthorizedException('Acceso denegado. Se requiere rol de Administrador.');
    }
  }

  private checkAdminOrCoordinador(user: any) {
    const hasRole = user.roles && user.roles.some((r: string) => 
      ['ADMIN', 'COORDINADOR'].includes(r.toUpperCase())
    );
    if (!hasRole) {
      throw new UnauthorizedException('Acceso denegado. Se requiere rol de Administrador o Coordinador.');
    }
  }


  // RUTA PARA ENCARGADO_ESCUELA / ADMIN: Talleres de su sede (o TODOS si es Admin)
  @UseGuards(AuthGuard('jwt'))
  @Get('mis-talleres-encargado')
  async getMisTalleresEncargado(@Req() req: any) {
    const user = req.user;
    const esEncargado = user.roles?.some((r: string) => r.toUpperCase() === 'ENCARGADO_ESCUELA');
    const esAdmin     = user.roles?.some((r: string) => r.toUpperCase() === 'ADMIN');
    const esCoord     = user.roles?.some((r: string) => r.toUpperCase() === 'COORDINADOR');

    if (!esEncargado && !esAdmin && !esCoord) {
      throw new UnauthorizedException('Acceso denegado. Solo para Encargados o Administradores.');
    }

    // ADMIN / COORDINADOR sin sede asignada → devuelve TODOS los talleres
    if ((esAdmin || esCoord) && !user.sedeId) {
      return this.talleresService.getAllTalleresConAsistencia();
    }

    // Encargado con sede asignada → solo sus talleres
    if (!user.sedeId) {
      throw new UnauthorizedException('No tienes una sede asignada. Contacta al Administrador.');
    }

    return this.talleresService.findBySede(user.sedeId);
  }

  // RUTA PARA COORDINADOR: Métricas de solo lectura
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/metricas')
  async getMetricas(@Req() req: any) {
    this.checkAdminOrCoordinador(req.user);
    return this.talleresService.getMetricas();
  }

  // RUTA PARA COORDINADOR: Ranking de asistencia
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/ranking-asistencia')
  async getRankingAsistencia(@Req() req: any) {
    this.checkAdminOrCoordinador(req.user);
    return this.talleresService.getRankingAsistencia();
  }

  // 🥉🥈🥇 DASHBOARD DE OCUPACIÓN MAESTRO (Real-Time)
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/reporte-ocupacion')
  async getReporteOcupacion(@Req() req: any) {
    this.checkAdminOrCoordinador(req.user);

    const talleres = await this.talleresService['prisma'].taller.findMany({
      include: {
        sede: true,
        _count: {
          select: {
            inscripciones: true,
            listaEspera: true
          }
        }
      },
      orderBy: { sedeId: 'asc' }
    });

    return talleres.map(t => {
      const porcentaje = t.cuposTotales > 0 
        ? Math.round((t._count.inscripciones / t.cuposTotales) * 100) 
        : 0;

      return {
        id: t.id,
        nombre: t.nombre,
        sede: t.sede.nombre,
        cuposTotales: t.cuposTotales,
        inscritos: t._count.inscripciones,
        enEspera: t._count.listaEspera,
        ocupacion: porcentaje,
        estado: t.cuposDisponibles <= 0 ? 'LLENO' : 'DISPONIBLE'
      };
    });
  }

  // 🥉🥈🥇 RESUMEN GLOBAL DE CAPACIDAD (KPI Maestro)
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/resumen-cupos')
  async getResumenCupos(@Req() req: any) {
    this.checkAdminOrCoordinador(req.user);

    const agregados = await this.talleresService['prisma'].taller.aggregate({
      _sum: {
        cuposTotales: true,
        cuposDisponibles: true
      }
    });

    // Contamos inscripciones reales (Matrícula efectuada)
    const totalInscritos = await this.talleresService['prisma'].inscripcion.count();
    const cuposTotales = agregados._sum.cuposTotales || 0;

    return {
      capacidadSistemas: cuposTotales,
      matriculaEfectuada: totalInscritos,
      vacantesRestantes: agregados._sum.cuposDisponibles || 0,
      ocupacionGlobal: cuposTotales > 0 
        ? Math.round((totalInscritos / cuposTotales) * 100) 
        : 0
    };
  }


  // RUTA MAESTRA: Configuración Escolar SIGE
  @Get('config/escolar')
  getEscolarConfig() {
    return {
      fechaInicio: '2026-03-27',
      diasLectivos: [1, 2, 3, 4, 5], // Lunes a Viernes
      periodoLectivo: 'Primer Semestre 2026',
      estado: 'Activo'
    };
  }

  // --- ENDPOINTS PÚBLICOS ---
  @Get('sedes')
  getSedes() {
    return this.talleresService.findAllSedes();
  }

  @Get('drop-constraints')
  async dropConstraints() {
    const res: any = await this.talleresService['prisma'].$queryRawUnsafe(`
      SELECT name 
      FROM sys.default_constraints 
      WHERE parent_object_id = OBJECT_ID('Taller')
    `);
    
    for (const c of res) {
        await this.talleresService['prisma'].$executeRawUnsafe(`ALTER TABLE Taller DROP CONSTRAINT ${c.name}`);
    }
    return { dropped: res };
  }

  @Get('disponibles')
  getTalleres(@Query() params: FilterTallerDto) {
    return this.talleresService.findAvailable(params);
  }

  // 🥈 Nivel 2: Registro de Interés Estratégico (Público)
  @Post(':id/interes')
  async trackInterestPost(@Param('id') id: string) {
    // Registramos el interés de forma asíncrona (fire-and-forget)
    this.analyticsService.trackInterest(+id).catch(() => {});
    return { success: true };
  }

  // RUTA PARA PROFESORES: Mis talleres asignados
  @UseGuards(AuthGuard('jwt'))
  @Get('mis-talleres-profesor')
  async getMisTalleresProfesor(@Req() req: any) {
    const user = req.user;
    
    // Verificar que sea profesor (Rol local PROFESOR)
    const esProfesor = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'PROFESOR');
    const esAdmin = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'ADMIN');

    if (!esProfesor && !esAdmin) {
      throw new UnauthorizedException('Acceso denegado. Solo para profesores.');
    }

    const usuarioId = user.sub; // ID del UsuarioLocal del JWT
    return this.talleresService.findByProfesor(usuarioId);
  }

  // RUTA PARA PROFESORES: Top 3 alumnos con mejor asistencia
  @UseGuards(AuthGuard('jwt'))
  @Get('profesor/ranking')
  async getRankingProfesor(@Req() req: any) {
    const user = req.user;
    const esProfesor = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'PROFESOR');
    const esAdmin = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'ADMIN');

    if (!esProfesor && !esAdmin) throw new UnauthorizedException('Acceso denegado.');
    
    const limit = 3;
    return this.talleresService.getRankingAsistenciaProfesor(user.sub, limit);
  }

  // RUTA PARA ALUMNOS: Mis talleres inscritos
  @UseGuards(AuthGuard('jwt'))
  @Get('mis-talleres-alumno')
  async getMisTalleresAlumno(@Req() req: any) {
    const user = req.user;

    // Los apoderados pueden ver los talleres de sus pupilos
    if (user.tipo !== 'APODERADO') {
      throw new UnauthorizedException('Acceso denegado. Solo para apoderados.');
    }

    // Nota: El apoderado puede tener múltiples alumnos. Aquí buscamos 
    // todos los talleres vinculados a sus pupilos (según el ID del apoderado)
    const apoderadoId = user.sub;
    return this.talleresService.findByAlumno(apoderadoId);
  }

  // RUTA PARA PROFESORES: Ver alumnos de un taller específico
  @UseGuards(AuthGuard('jwt'))
  @Get(':id/alumnos')
  async getAlumnosTaller(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    
    // Solo profesores o admins pueden ver la lista de alumnos
    const esProfesor = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'PROFESOR');
    const esAdmin = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'ADMIN');
    const esCoordinador = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'COORDINADOR');
    const esEncargado = user.roles && user.roles.some((r: string) => r.toUpperCase() === 'ENCARGADO_ESCUELA');

    if (!esProfesor && !esAdmin && !esCoordinador && !esEncargado) {
      throw new UnauthorizedException('Acceso denegado. Solo para profesores.');
    }

    const tallerId = parseInt(id);
    return this.talleresService.getAlumnosPorTaller(tallerId);
  }

  // --- 📅 ASISTENCIA DIARIA (NUEVO HUB) ---

  @UseGuards(AuthGuard('jwt'))
  @Get('admin/asistencia/:tallerId/:fecha')
  async getAsistenciaDia(
    @Param('tallerId') tallerId: string, 
    @Param('fecha') fecha: string, 
    @Req() req: any
  ) {
    this.checkAdminOrCoordinadorOrEncargado(req.user);

    // Parseamos la fecha (YYYY-MM-DD) y construimos los límites del día
    const dateStart = new Date(`${fecha}T00:00:00.000Z`);
    const dateEnd = new Date(`${fecha}T23:59:59.999Z`);

    // 1. Obtenemos a todos los alumnos inscritos Oficialmente en ese taller
    const inscripciones = await this.talleresService['prisma'].inscripcion.findMany({
      where: { tallerId: +tallerId },
      include: {
        alumno: { include: { establecimiento: true, apoderado: true } }
      },
      orderBy: { alumno: { apellidos: 'asc' } }
    });

    // 2. Buscamos si ya existe asistencia registrada para ese día
    const asistenciasGuardadas = await this.talleresService['prisma'].asistencia.findMany({
      where: {
        tallerId: +tallerId,
        fecha: {
          gte: dateStart,
          lte: dateEnd
        }
      }
    });

    // 3. Mezclamos ambas fuentes para entregar el listado maestro al Frontend
    return inscripciones.map(ins => {
      const registroPrevio = asistenciasGuardadas.find(a => a.alumnoId === ins.alumnoId);
      return {
        alumnoId: ins.alumnoId,
        rut: ins.alumno.rut,
        nombres: ins.alumno.nombres,
        apellidos: ins.alumno.apellidos,
        estado: registroPrevio ? registroPrevio.estado : null, // null = No ingresado aún
        enfermedadCronica: ins.enfermedadCronica,
        apoderadoTelefono: (ins.alumno.apoderado || (ins as any).apoderado)?.telefono || ''
      };
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('admin/asistencia/:tallerId/:fecha')
  async guardarAsistenciaDia(
    @Param('tallerId') tallerId: string, 
    @Param('fecha') fecha: string, 
    @Body() payload: { asistencias: { alumnoId: number, estado: string }[] },
    @Req() req: any
  ) {
    this.checkAdminOrCoordinadorOrEncargado(req.user);

    const dateTarget = new Date(`${fecha}T12:00:00.000Z`); // Mediodía para evitar fallos de UTC
    const adminId = parseInt(req.user.sub);

    return this.talleresService['prisma'].$transaction(async (tx) => {
      // Borramos la asistencia de ese día para ese taller (Upsert masivo por simplicidad)
      const dateStart = new Date(`${fecha}T00:00:00.000Z`);
      const dateEnd = new Date(`${fecha}T23:59:59.999Z`);
      
      await tx.asistencia.deleteMany({
        where: {
          tallerId: +tallerId,
          fecha: { gte: dateStart, lte: dateEnd }
        }
      });

      // Insertamos el nuevo set completo
      if (payload.asistencias && payload.asistencias.length > 0) {
        await tx.asistencia.createMany({
          data: payload.asistencias.map(a => ({
            tallerId: +tallerId,
            alumnoId: a.alumnoId,
            fecha: dateTarget,
            estado: a.estado,
            registradoPor: adminId
          }))
        });
      }

      const detalleAsistencia = `Registro de asistencia actualizado. Fecha: ${fecha}. Datos: ${JSON.stringify(payload.asistencias)}`;
      await this.auditService.log('CREATE', 'Asistencia', +tallerId, detalleAsistencia, req.user.nombre);

      return { status: 'SUCCESS', message: 'Registro de asistencia guardado exitosamente.' };
    });
  }

  private checkAdminOrCoordinadorOrEncargado(user: any) {
    const roles: string[] = user.roles || [];
    const hasRole = roles.some((r: string) => 
      ['ADMIN', 'COORDINADOR', 'ENCARGADO_ESCUELA', 'PROFESOR'].includes(r.toUpperCase())
    );
    if (!hasRole) {
      throw new UnauthorizedException('Acceso denegado. Rol insuficiente para registrar asistencia.');
    }
  }
}