import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { TomarAsistenciaDto } from './dto/tomar-asistencia.dto';
import { TomarAsistenciaMensualDto } from './dto/tomar-asistencia-mensual.dto';

@Controller('asistencia')
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

  // Para guardar la lista (Botón "Guardar Asistencia")
  @Post()
  tomarLista(@Body() dto: TomarAsistenciaDto) {
    return this.asistenciaService.registrarAsistencia(dto);
  }

  // Nueva ruta para guardado masivo de todo el mes
  @Post('mensual')
  registrarMensual(@Body() dto: TomarAsistenciaMensualDto) {
    return this.asistenciaService.registrarAsistenciaMensual(dto);
  }
}