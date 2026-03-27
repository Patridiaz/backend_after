import { Controller, Post, Body, Get, Param, UseGuards, Query } from '@nestjs/common';
import { SigeService } from './sige.service';
import { CargaSigeDto } from './dto/carga-sige.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('sige')
export class SigeController {
  constructor(private readonly sigeService: SigeService) {}


  // VALIDACIÓN: Busca la información del alumno en SIGE por su RUT
  @Get('verificar-rut/:rut')
  verificarRut(@Param('rut') rut: string) {
    return this.sigeService.verificarRut(rut);
  }

  @Post('carga-masiva')
  @UseGuards(AuthGuard('jwt'))
  cargarMasivo(@Body() dto: CargaSigeDto) {
    return this.sigeService.cargarMasivo(dto);
  }

  @Get('sede/:sedeId')
  @UseGuards(AuthGuard('jwt'))
  getPorSede(@Param('sedeId') sedeId: string) {
    return this.sigeService.getPorSede(+sedeId);
  }

  // MÉTRICAS: Resumen estadístico de alumnos SIGE por sede
  @Get('metrics/:sedeId')
  @UseGuards(AuthGuard('jwt'))
  getMetrics(@Param('sedeId') sedeId: string) {
    return this.sigeService.getMetricsPorSede(+sedeId);
  }

  // MÉTRICAS DE COBERTURA: Compara SIGE vs Alumnos inscritos en la plataforma
  @Get('cobertura/:sedeId')
  @UseGuards(AuthGuard('jwt'))
  getInscritosMetrics(@Param('sedeId') sedeId: string) {
    return this.sigeService.getInscritosSigeMetrics(+sedeId);
  }

  @Get('comparativa-global')
  @UseGuards(AuthGuard('jwt'))
  getGlobalComparison() {
    return this.sigeService.getGlobalEnrollmentComparison();
  }


  // MANTENIMIENTO: Limpia y normaliza todos los RUTs de la base de datos (Ejecutar una vez)
  @Get('fix-database-ruts')
  @UseGuards(AuthGuard('jwt'))
  async fixDatabase() {
    return this.sigeService.fixAllRuts();
  }

  // PELIGRO: Elimina todos los registros de SIGE (Usar con precaución)
  @Get('vaciar-base-datos')
  @UseGuards(AuthGuard('jwt'))
  async vaciarBase() {
    return this.sigeService.vaciarSige();
  }
}
