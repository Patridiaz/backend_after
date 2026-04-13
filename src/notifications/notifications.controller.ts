import { Controller, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('trigger-reminders')
  async triggerReminders() {
    await this.notificationsService.triggerManualReminders();
    return { message: 'Proceso de recordatorios iniciado manualmente.' };
  }

  @Post('test-email')
  async testEmail() {
    const testEmail = 'pdiaz@eduhuechuraba.cl';
    // Buscamos una inscripción real para que el correo tenga datos reales
    const inscripcion = await (this.notificationsService as any).prisma.inscripcion.findFirst({
      where: {
        taller: {
          horarios: {
            some: { diaSemana: 'Lunes' }
          }
        }
      },
      include: {
        alumno: true,
        taller: {
          include: {
            sede: true,
            horarios: true
          }
        }
      }
    });

    if (!inscripcion) {
      return { message: 'No se encontraron inscripciones para el Lunes en la base de datos.' };
    }

    const { alumno, taller } = inscripcion;
    const horarioStr = taller.horarios
      .map(h => `${h.diaSemana} ${h.horaInicio}:${h.minutoInicio.toString().padStart(2, '0')}`)
      .join(', ');

    await (this.notificationsService as any).mailService.sendStartReminder(
      testEmail,
      `${alumno.nombres} ${alumno.apellidos}`,
      taller.nombre,
      taller.sede.nombre,
      'Lunes',
      horarioStr
    );

    return { 
      message: `Correo de prueba enviado a ${testEmail}`,
      datosUsados: {
        alumno: alumno.nombres,
        taller: taller.nombre
      }
    };
  }

  @Post('mark-first-79-as-sent')
  async mark79() {
    const records = await (this.notificationsService as any).prisma.inscripcion.findMany({
      where: {
        taller: {
          horarios: {
            some: { diaSemana: 'Lunes' }
          }
        }
      },
      take: 79,
      orderBy: { id: 'asc' }
    });

    for (const r of records) {
      await (this.notificationsService as any).prisma.inscripcion.update({
        where: { id: r.id },
        data: { notificacionInicioEnviada: true }
      });
    }

    return { message: `Marcados ${records.length} como ya enviados.` };
  }
}
