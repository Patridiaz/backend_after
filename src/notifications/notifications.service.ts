import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // Se ejecuta todos los días a las 08:30 AM
  @Cron('30 8 * * *')
  async handleDailyReminders() {
    this.logger.log('Iniciando proceso de envío de recordatorios diarios...');
    
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const hoyIndex = new Date().getDay();
    const hoyNombre = diasSemana[hoyIndex];

    this.logger.log(`Detectado hoy como: ${hoyNombre}`);

    // 1. Obtener todas las inscripciones activas que NO han sido notificadas hoy
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: {
        notificacionInicioEnviada: false
      },
      include: {
        alumno: {
          include: {
            apoderado: true
          }
        },
        taller: {
          include: {
            horarios: true,
            sede: true
          }
        }
      },
      orderBy: { id: 'asc' }
    });

    let correosEnviados = 0;

    for (const inscripcion of inscripciones) {
      const { alumno, taller } = inscripcion;
      const horarios = taller.horarios;

      if (horarios.length === 0) continue;

      // Determinamos cuál es el "Día de Inicio" (el primer día de la semana que tiene clase)
      const ordenDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const diasClase = horarios.map(h => h.diaSemana);
      
      const primerDia = ordenDias.find(d => diasClase.includes(d));

      // Si el primer día de clase de este alumno en este taller es HOY, enviamos el correo
      if (primerDia === hoyNombre) {
        const horarioStr = horarios
          .map(h => `${h.diaSemana} ${h.horaInicio}:${h.minutoInicio.toString().padStart(2, '0')}`)
          .join(', ');

        this.logger.log(`Enviando recordatorio a ${alumno.apoderado.email} por alumno ${alumno.nombres} (Taller: ${taller.nombre})`);
        
        const éxito = await this.mailService.sendStartReminder(
          alumno.apoderado.email,
          `${alumno.nombres} ${alumno.apellidos}`,
          taller.nombre,
          taller.sede.nombre,
          hoyNombre,
          horarioStr
        );

        if (éxito) {
          // Marcamos como enviado en la base de datos
          await this.prisma.inscripcion.update({
            where: { id: inscripcion.id },
            data: { notificacionInicioEnviada: true }
          });
          correosEnviados++;
        }
        
        // Pequeña pausa para no saturar el servidor de correo
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    this.logger.log(`Proceso finalizado. Se enviaron ${correosEnviados} correos.`);
  }

  // Método para disparar manualmente (para pruebas)
  async triggerManualReminders() {
    return this.handleDailyReminders();
  }
}
