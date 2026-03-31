import { Body, Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { TomarAsistenciaDto } from './dto/tomar-asistencia.dto';
import { TomarAsistenciaMensualDto } from './dto/tomar-asistencia-mensual.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('asistencia')
@UseGuards(AuthGuard('jwt'))
export class AsistenciaController {
  constructor(private readonly asistenciaService: AsistenciaService) {}

  // Para cargar la lista de alumnos en el frontend
  @Get('taller/:id')
  getAlumnos(@Param('id') id: string) {
    return this.asistenciaService.obtenerAlumnosDeTaller(+id);
  }

  // Nueva ruta para obtener la matriz mensual (Lirmi Style)
  @Get('taller/:tallerId/mensual')
  getMensual(
    @Param('tallerId') tallerId: string,
    @Query('mes') mes: string,
    @Query('anio') anio: string
  ) {
    return this.asistenciaService.obtenerAsistenciaMensual(+tallerId, +mes, +anio);
  }

  // Para guardar la lista con huella de auditoría
  @Post()
  tomarLista(@Body() dto: TomarAsistenciaDto, @Req() req: any) {
    const usuarioId = req.user.sub; // ID del usuario que graba (ej: id 8 Compras)
    return this.asistenciaService.registrarAsistencia(dto, usuarioId);
  }

  // Guardado masivo mensual con huella de auditoría
  @Post('mensual')
  registrarMensual(@Body() dto: TomarAsistenciaMensualDto, @Req() req: any) {
    const usuarioId = req.user.sub;
    return this.asistenciaService.registrarAsistenciaMensual(dto, usuarioId);
  }
}