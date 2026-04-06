import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsMiddleware implements NestMiddleware {
  constructor(private analyticsService: AnalyticsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const { path, headers } = req;
    const userAgent = headers['user-agent'] || 'Desconocido';

    // 🥉🥇 Registramos la visita de forma asíncrona para no bloquear la respuesta
    // Solo registramos rutas relevantes (Evitamos logs de archivos estáticos o internos)
    if (!path.includes('.') && !path.startsWith('/_')) {
      this.analyticsService.trackVisit(path, userAgent).catch(() => {});
    }

    next();
  }
}
