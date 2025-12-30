import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { TomarAsistenciaDto } from './dto/tomar-asistencia.dto';

@Controller('asistencia')
export class AsistenciaController {
  constructor(private readonly asistenciaService: AsistenciaService) {}

  // Para cargar la lista de alumnos en el frontend
  @Get('taller/:id')
  getAlumnos(@Param('id') id: string) {
    return this.asistenciaService.obtenerAlumnosDeTaller(+id);
  }

  // Para guardar la lista (Botón "Guardar Asistencia")
  @Post()
  tomarLista(@Body() dto: TomarAsistenciaDto) {
    return this.asistenciaService.registrarAsistencia(dto);
  }
}