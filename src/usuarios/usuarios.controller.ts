import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('usuarios')
@UseGuards(AuthGuard('jwt'))
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  /**
   * Obtiene usuarios desde ticket-service que aún no han sido asignados
   */
  @Get('externos')
  getUsuariosExternos(@Query('search') search?: string) {
    return this.usuariosService.getUsuariosExternos(search);
  }

  /**
   * Asocia una identidad de ticket-service a un rol local en Talleres
   */
  @Post('asignar')
  asignarUsuario(@Body() dto: { externalId: number, rol: string, sedeId?: number }) {
    return this.usuariosService.asignarUsuario(dto);
  }

  /**
   * Obtiene todos los usuarios locales (Asignados)
   */
  @Get('locales')
  getUsuariosLocales() {
    return this.usuariosService.getUsuariosLocales();
  }

  /**
   * Actualiza el rol o sede de un usuario local
   */
  @Patch('local/:id')
  actualizarUsuario(@Param('id') id: string, @Body() data: { rol?: string, sedeId?: number, isActive?: boolean }) {
    return this.usuariosService.actualizarUsuario(+id, data);
  }

  /**
   * Desactiva un usuario local (No lo borra para mantener historial)
   */
  @Delete('local/:id')
  eliminarUsuario(@Param('id') id: string) {
    return this.usuariosService.eliminarUsuario(+id);
  }
}
