import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // 🥉 Nivel 1 & 🥇 Nivel 3: Registro de Visitas y Dispositivos
  async trackVisit(path: string, userAgent: string) {
    try {
      await this.prisma.visita.create({
        data: {
          path,
          userAgent,
        },
      });
    } catch (e) {
      console.error('Error tracking visit:', e.message);
    }
  }

  // 🥈 Nivel 2: Registro de Interés Estratégico por Taller
  async trackInterest(tallerId: number) {
    try {
      await this.prisma.interesTaller.create({
        data: {
          tallerId,
        },
      });
    } catch (e) {
      console.error('Error tracking workshop interest:', e.message);
    }
  }
}
