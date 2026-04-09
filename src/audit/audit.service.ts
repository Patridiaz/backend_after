import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Registra un cambio en el sistema
   * @param accion 'CREATE', 'UPDATE', 'DELETE'
   * @param tabla Nombre de la tabla afectada
   * @param registroId ID del registro afectado
   * @param detalle Descripción o JSON con los cambios
   * @param usuario Nombre o ID del administrador (opcional)
   */
  async log(accion: string, tabla: string, registroId?: number, detalle?: string, usuario?: string) {
    try {
      // Ajuste explícito de Zona Horaria (UTC-4 Chile Continental)
      const chileTime = new Date();
      chileTime.setHours(chileTime.getHours() - 4);

      await this.prisma.logCambio.create({
        data: {
          fecha: chileTime,
          accion,
          tabla,
          registroId,
          detalle: detalle?.substring(0, 1000), // Protegemos el límite del DB
          usuario: usuario || 'Sistema/Publico',
        },
      });
    } catch (e) {
      console.error('CRITICAL: Error recording audit log:', e.message);
    }
  }
}
