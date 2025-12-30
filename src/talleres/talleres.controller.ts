import { Controller, Get, Param, Query, Req, UseGuards, Post, Body, UnauthorizedException } from '@nestjs/common';
import { TalleresService } from './talleres.service';
import { FilterTallerDto } from './dto/filter-taller.dto';
import { CreateSedeDto } from './dto/create-sede.dto';
import { CreateTallerDto } from './dto/create-taller.dto';
import { AssignProfesorDto } from './dto/assign-profesor.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('talleres')
export class TalleresController {
  constructor(private readonly talleresService: TalleresService) {}

  // --- ENDPOINTS ADMINISTRADOR ---

  @Post('sede')
  @UseGuards(AuthGuard('jwt'))
  async createSede(@Body() dto: CreateSedeDto, @Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.createSede(dto);
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

  @Get('admin/todos')
  @UseGuards(AuthGuard('jwt'))
  async getAllTalleres(@Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.getAllTalleres();
  }

  @Get('admin/profesores')
  @UseGuards(AuthGuard('jwt'))
  async getListaProfesores(@Req() req: any) {
    this.checkAdmin(req.user);
    return this.talleresService.getAllProfesores();
  }

  private checkAdmin(user: any) {
    // Verificación insensible a mayúsculas/minúsculas para robustez
    const isAdmin = user.roles && user.roles.some((r: string) => r.toLowerCase() === 'admin');
    if (!isAdmin) {
      throw new UnauthorizedException('Acceso denegado. Se requiere rol de Administrador.');
    }
  }

  // --- ENDPOINTS PÚBLICOS ---

  @Get('sedes')
  getSedes() {
    return this.talleresService.findAllSedes();
  }

  @Get('disponibles')
  getTalleres(@Query() params: FilterTallerDto) {
    return this.talleresService.findAvailable(
      parseInt(params.sedeId), 
      params.fechaNacimiento
    );
  }

  // RUTA PARA PROFESORES: Mis talleres asignados
  @UseGuards(AuthGuard('jwt'))
  @Get('mis-talleres-profesor')
  async getMisTalleresProfesor(@Req() req: any) {
    const user = req.user;
    
    // Verificar que sea profesor
    if (user.tipo !== 'Profesor') {
      return { error: 'Acceso denegado. Solo para profesores.' };
    }

    const profesorId = user.userId;
    return this.talleresService.findByProfesor(profesorId);
  }

  // RUTA PARA ALUMNOS: Mis talleres inscritos
  @UseGuards(AuthGuard('jwt'))
  @Get('mis-talleres-alumno')
  async getMisTalleresAlumno(@Req() req: any) {
    const user = req.user;

    // Verificar que sea alumno
    if (user.tipo !== 'ALUMNO') {
      return { error: 'Acceso denegado. Solo para alumnos.' };
    }

    const alumnoId = user.userId;
    return this.talleresService.findByAlumno(alumnoId);
  }

  // RUTA PARA PROFESORES: Ver alumnos de un taller específico
  @UseGuards(AuthGuard('jwt'))
  @Get(':id/alumnos')
  async getAlumnosTaller(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    
    // Solo profesores pueden ver la lista de alumnos
    if (user.tipo !== 'Profesor') {
      return { error: 'Acceso denegado. Solo para profesores.' };
    }

    const tallerId = parseInt(id);
    return this.talleresService.getAlumnosPorTaller(tallerId);
  }
}