import { Controller, Get } from '@nestjs/common';

@Controller('config')
export class ConfigController {
  
  @Get('time')
  async getServerTime() {
    // Entregamos la hora exacta en ISO 8601 (UTC)
    // El frontend hará: let offset = new Date(resp.serverTime).getTime() - Date.now();
    return {
      serverTime: new Date().toISOString(),
      timezone: 'America/Santiago'
    };
  }
}
