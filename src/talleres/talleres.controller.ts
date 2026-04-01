import { Controller, Get, Param, Query, Req, UseGuards, Post, Body, UnauthorizedException, Patch, Delete } from '@nestjs/common';
import { TalleresService } from './talleres.service';
import { FilterTallerDto } from './dto/filter-taller.dto';
import { CreateSedeDto } from './dto/create-sede.dto';
import { UpdateSedeDto } from './dto/update-sede.dto';
import { CreateTallerDto } from './dto/create-taller.dto';
import { UpdateTallerDto } from './dto/update-taller.dto';
import { AssignProfesorDto } from './dto/assign-profesor.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('talleres')
export class TalleresController {
  constructor(private readonly talleresService: TalleresService) {}

  // --- ENDPOINTS ADMINISTRADOR ---

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateTaller(@Param('id') id: string, @Body() dto: UpdateTallerDto, @Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.updateTaller(+id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteTaller(@Param('id') id: string, @Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.deleteTaller(+id);
  }

  @Post('sede')
  @UseGuards(AuthGuard('jwt'))
  async createSede(@Body() dto: CreateSedeDto, @Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.createSede(dto);
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
    return this.talleresService.createTaller(dto);
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


  // RUTA PARA ENCARGADO_ESCUELA: Talleres de su sede
  @UseGuards(AuthGuard('jwt'))
  @Get('mis-talleres-encargado')
  async getMisTalleresEncargado(@Req() req: any) {
    const user = req.user;
    const esEncargado = user.roles?.some((r: string) => r.toUpperCase() === 'ENCARGADO_ESCUELA');
    const esAdmin = user.roles?.some((r: string) => r.toUpperCase() === 'ADMIN');

    if (!esEncargado && !esAdmin) {
      throw new UnauthorizedException('Acceso denegado. Solo para Encargados de Escuela.');
    }

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
}