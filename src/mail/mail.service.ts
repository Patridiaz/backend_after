import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      pool: true, // Habilitar pool de conexiones
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  async sendWaitListConfirmation(
    to: string,
    alumnoNombre: string,
    tallerNombre: string,
    sedeNombre: string,
    horariosRaw: any[],
    datos: {
      enfermedadCronica?: boolean;
      enfermedadCronicaDetalle?: string;
      alergias?: string;
      necesidadesEspeciales?: boolean;
      necesidadesEspecialesDetalle?: string;
      apoyoEscolar?: string;
      usoImagen?: boolean;
    }
  ) {
    // Mapeo de días para calcular la fecha de inicio estimada
    const diasMap = {
      'Lunes': { offset: 0, fecha: '13 de Abril' },
      'Martes': { offset: 1, fecha: '14 de Abril' },
      'Miércoles': { offset: 2, fecha: '15 de Abril' },
      'Jueves': { offset: 3, fecha: '16 de Abril' },
      'Viernes': { offset: 4, fecha: '17 de Abril' },
      'Sábado': { offset: 5, fecha: '18 de Abril' },
    };

    const diasTaller = horariosRaw.map(h => h.diaSemana);
    const primerDia = Object.keys(diasMap).find(d => diasTaller.includes(d)) || 'Lunes';
    const fechaInicioOficial = diasMap[primerDia].fecha;

    const horarioStr = horariosRaw.map(h => 
      `${h.diaSemana} de ${h.horaInicio}:${h.minutoInicio.toString().padStart(2, '0')} a ${h.horaFin}:${h.minutoFin.toString().padStart(2, '0')}`
    ).join(', ');

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px;">Lista de Espera</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Tu registro ha sido recibido correctamente</p>
        </div>
        
        <div style="padding: 30px; background-color: white; line-height: 1.6; color: #374151;">
          <h2 style="color: #111827; margin-top: 0; font-size: 20px;">Hola,</h2>
          <p>Te informamos que <strong>${alumnoNombre}</strong> ha quedado registrado en la <strong>Lista de Espera</strong> del taller:</p>
          
          <div style="background-color: #FFFBEB; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; font-size: 16px; color: #92400E; font-weight: bold;">${tallerNombre}</p>
            <p style="margin: 5px 0 0 0; font-size: 13px; color: #B45309;">Sede: ${sedeNombre}</p>
            <p style="margin: 3px 0 0 0; font-size: 13px; color: #B45309;">Horarios: ${horarioStr}</p>
          </div>

          <div style="background-color: #FEF3C7; border: 1px dashed #F59E0B; border-radius: 8px; padding: 12px; text-align: center; margin: 20px 0;">
            <p style="margin: 0; color: #92400E; font-weight: bold; font-size: 14px;">🚀 Fecha Estimada de Inicio:</p>
            <p style="margin: 5px 0 0 0; color: #78350F; font-size: 18px; font-weight: 900;">${primerDia}, ${fechaInicioOficial} de 2026</p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #92400E;">*Sujeto a la liberación de un cupo oficial</p>
          </div>

          <h3 style="color: #111827; font-size: 16px; border-bottom: 2px solid #FEF3C7; padding-bottom: 8px; margin-top: 30px;">📋 Resumen de lo Registrado</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
            <tr>
              <td style="padding: 8px 0; color: #6B7280; width: 50%;"><strong>Autorización de Imagen:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.usoImagen ? '✅ Autorizado' : '❌ No Autorizado'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;"><strong>Enfermedades Crónicas:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.enfermedadCronica ? `Sí (${datos.enfermedadCronicaDetalle || 'Sin detalle'})` : 'No'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;"><strong>Alergias:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.alergias || 'Ninguna'}</td>
            </tr>
             <tr>
              <td style="padding: 8px 0; color: #6B7280;"><strong>Necesidades Especiales:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.necesidadesEspeciales ? `Sí (${datos.necesidadesEspecialesDetalle || 'Sin detalle'})` : 'No'}</td>
            </tr>
             <tr>
              <td style="padding: 8px 0; color: #6B7280;"><strong>Apoyo Escolar:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.apoyoEscolar || 'No requiere'}</td>
            </tr>
          </table>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://after.eduhuechuraba.cl/login" style="background-color: #D97706; color: white; padding: 10px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver mi Estado</a>
          </div>
        </div>
        
        <div style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 11px; color: #9CA3AF;">Departamento de Educación - I. Municipalidad de Huechuraba</p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: '"After School Huechuraba" <afterschool@eduhuechuraba.cl>',
        to,
        subject: `Lista de Espera: ${alumnoNombre} - Taller: ${tallerNombre}`,
        html: htmlContent,
      });
      return true;
    } catch (error) {
      console.error('Error enviando correo de lista de espera:', error);
      return false;
    }
  }

  async sendEnrollmentConfirmation(
    to: string,
    alumnoNombre: string,
    tallerNombre: string,
    sedeNombre: string,
    horariosRaw: any[],
    datos: {
      enfermedadCronica?: boolean;
      enfermedadCronicaDetalle?: string;
      alergias?: string;
      necesidadesEspeciales?: boolean;
      necesidadesEspecialesDetalle?: string;
      apoyoEscolar?: string;
      usoImagen?: boolean;
    }
  ) {
    // Mapeo de días para calcular la fecha de inicio (Semana del 13 de Abril 2026)
    const diasMap = {
      'Lunes': { offset: 0, fecha: '13 de Abril' },
      'Martes': { offset: 1, fecha: '14 de Abril' },
      'Miércoles': { offset: 2, fecha: '15 de Abril' },
      'Jueves': { offset: 3, fecha: '16 de Abril' },
      'Viernes': { offset: 4, fecha: '17 de Abril' },
      'Sábado': { offset: 5, fecha: '18 de Abril' },
    };

    const diasTaller = horariosRaw.map(h => h.diaSemana);
    const primerDia = Object.keys(diasMap).find(d => diasTaller.includes(d)) || 'Lunes';
    const fechaInicioOficial = diasMap[primerDia].fecha;

    const horarioStr = horariosRaw.map(h => 
      `${h.diaSemana} de ${h.horaInicio}:${h.minutoInicio.toString().padStart(2, '0')} a ${h.horaFin}:${h.minutoFin.toString().padStart(2, '0')}`
    ).join(', ');

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px;">¡Inscripción Exitosa!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">After School Huechuraba 2026</p>
        </div>
        
        <div style="padding: 30px; background-color: white; line-height: 1.6; color: #374151;">
          <h2 style="color: #111827; margin-top: 0; font-size: 20px;">Hola,</h2>
          <p>Te confirmamos que <strong>${alumnoNombre}</strong> ha sido inscrito correctamente en el taller:</p>
          
          <div style="background-color: #F3F4F6; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #4F46E5;">
            <p style="margin: 0; font-size: 16px; color: #111827; font-weight: bold;">${tallerNombre}</p>
            <p style="margin: 5px 0 0 0; font-size: 13px; color: #6B7280;">Sede: ${sedeNombre}</p>
            <p style="margin: 3px 0 0 0; font-size: 13px; color: #6B7280;">Horarios: ${horarioStr}</p>
          </div>

          <div style="background-color: #EEF2FF; border: 1px dashed #4F46E5; border-radius: 8px; padding: 12px; text-align: center; margin: 20px 0;">
            <p style="margin: 0; color: #4338CA; font-weight: bold; font-size: 14px;">🚀 Comienza el:</p>
            <p style="margin: 5px 0 0 0; color: #1E1B4B; font-size: 18px; font-weight: 900;">${primerDia}, ${fechaInicioOficial} de 2026</p>
          </div>

          <h3 style="color: #111827; font-size: 16px; border-bottom: 2px solid #F3F4F6; padding-bottom: 8px; margin-top: 30px;">📋 Resumen de lo Registrado</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
            <tr>
              <td style="padding: 8px 0; color: #6B7280; width: 50%;"><strong>Autorización de Imagen:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.usoImagen ? '✅ Autorizado' : '❌ No Autorizado'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;"><strong>Enfermedades Crónicas:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.enfermedadCronica ? `Sí (${datos.enfermedadCronicaDetalle || 'Sin detalle'})` : 'No'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;"><strong>Alergias:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.alergias || 'Ninguna'}</td>
            </tr>
             <tr>
              <td style="padding: 8px 0; color: #6B7280;"><strong>Necesidades Especiales:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.necesidadesEspeciales ? `Sí (${datos.necesidadesEspecialesDetalle || 'Sin detalle'})` : 'No'}</td>
            </tr>
             <tr>
              <td style="padding: 8px 0; color: #6B7280;"><strong>Apoyo Escolar:</strong></td>
              <td style="padding: 8px 0; color: #111827;">${datos.apoyoEscolar || 'No requiere'}</td>
            </tr>
          </table>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://after.eduhuechuraba.cl/login" style="background-color: #4F46E5; color: white; padding: 10px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ir al Portal</a>
          </div>
        </div>
        
        <div style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 11px; color: #9CA3AF;">Departamento de Educación - I. Municipalidad de Huechuraba</p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: '"After School Huechuraba" <afterschool@eduhuechuraba.cl>',
        to,
        subject: `Confirmación: ${alumnoNombre} empieza el ${fechaInicioOficial}`,
        html: htmlContent,
      });
      return true;
    } catch (error) {
      console.error('Error enviando correo:', error);
      return false;
    }
  }

  async sendPreEnrollmentNotice(
    to: string,
    alumnoNombre: string,
    tallerNombre: string,
    sedeNombre: string
  ) {
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">Pre-inscripción Recibida</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">After School Huechuraba</p>
        </div>
        <div style="padding: 30px; background-color: white; line-height: 1.6; color: #374151;">
          <p>Hola,</p>
          <p>Te informamos que <strong>${alumnoNombre}</strong> ha sido pre-inscrito exitosamente en el taller <strong>${tallerNombre}</strong> (Sede: ${sedeNombre}).</p>
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #92400e;">⚠️ Importante:</p>
            <p style="margin: 5px 0 0 0;">Un coordinador del programa se contactará telefónicamente contigo a la brevedad para completar la ficha de salud y confirmar la matrícula definitiva.</p>
          </div>
          <p>Por favor, mantente atento a tu teléfono registrado.</p>
        </div>
        <div style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 11px; color: #9CA3AF;">Departamento de Educación - I. Municipalidad de Huechuraba</p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: '"After School Huechuraba" <afterschool@eduhuechuraba.cl>',
        to,
        subject: `Pre-inscripción recibida: ${alumnoNombre} - ${tallerNombre}`,
        html: htmlContent,
      });
      return true;
    } catch (error) {
      console.error('Error enviando pre-inscripción:', error);
      return false;
    }
  }

  async sendFinalEnrollmentConfirmation(
    to: string,
    alumnoNombre: string,
    tallerNombre: string,
    sedeNombre: string
  ) {
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">¡Matrícula Confirmada!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Tu proceso de inscripción ha finalizado</p>
        </div>
        <div style="padding: 30px; background-color: white; line-height: 1.6; color: #374151;">
          <p>Hola,</p>
          <p>¡Excelentes noticias! Tras el contacto telefónico, la matrícula de <strong>${alumnoNombre}</strong> en el taller <strong>${tallerNombre}</strong> ha sido validada correctamente.</p>
          <p>Ya puedes acceder al portal para ver los horarios y detalles del taller.</p>
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://after.eduhuechuraba.cl/login" style="background-color: #10b981; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ingresar al Portal</a>
          </div>
        </div>
        <div style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 11px; color: #9CA3AF;">Departamento de Educación - I. Municipalidad de Huechuraba</p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: '"After School Huechuraba" <afterschool@eduhuechuraba.cl>',
        to,
        subject: `¡Matrícula Confirmada!: ${alumnoNombre} - ${tallerNombre}`,
        html: htmlContent,
      });
      return true;
    } catch (error) {
      console.error('Error enviando confirmación final:', error);
      return false;
    }
  }

  async sendStartReminder(
    to: string,
    alumnoNombre: string,
    tallerNombre: string,
    sedeNombre: string,
    diaSemana: string,
    horarioStr: string
  ) {
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #059669 0%, #10B981 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px;">¡Tu Taller Comienza Hoy!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Recordatorio de Inicio - After School 2026</p>
        </div>
        
        <div style="padding: 30px; background-color: white; line-height: 1.6; color: #374151;">
          <h2 style="color: #111827; margin-top: 0; font-size: 20px;">Hola,</h2>
          <p>Te recordamos que hoy <strong>${diaSemana}</strong> es el primer día de <strong>${alumnoNombre}</strong> en su taller:</p>
          
          <div style="background-color: #ECFDF5; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #10B981;">
            <p style="margin: 0; font-size: 16px; color: #065F46; font-weight: bold;">${tallerNombre}</p>
            <p style="margin: 5px 0 0 0; font-size: 13px; color: #047857;">Sede: ${sedeNombre}</p>
            <p style="margin: 3px 0 0 0; font-size: 13px; color: #047857;">Horario: ${horarioStr}</p>
          </div>

          <div style="background-color: #F9FAFB; border-radius: 8px; padding: 15px; margin: 25px 0;">
            <h3 style="margin-top: 0; font-size: 15px; color: #111827;">💡 Recomendaciones para hoy:</h3>
            <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 14px; color: #4B5563;">
              <li>Llegar 5-10 minutos antes del inicio.</li>
              <li>Traer ropa cómoda si el taller lo requiere.</li>
              <li>Presentarse con el monitor/profesor encargado en la sede.</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://after.eduhuechuraba.cl/login" style="background-color: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver detalles en el Portal</a>
          </div>
        </div>
        
        <div style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 11px; color: #9CA3AF;">Departamento de Educación - I. Municipalidad de Huechuraba</p>
          <p style="margin: 5px 0 0 0; font-size: 10px; color: #D1D5DB;">Has recibido este correo porque estás inscrito en el programa After School.</p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: '"After School Huechuraba" <afterschool@eduhuechuraba.cl>',
        to,
        subject: `¡Hoy comienza su taller!: ${alumnoNombre} - ${tallerNombre}`,
        html: htmlContent,
      });
      return true;
    } catch (error) {
      console.error('Error enviando recordatorio de inicio:', error);
      return false;
    }
  }

  async sendConsecutiveAttendanceEmail(
    to: string,
    alumnoNombre: string,
    tallerNombre: string,
    consecutivas: number
  ) {
    const isTenth = consecutivas % 10 === 0;
    const highlightColor = isTenth ? '#8b5cf6' : '#10b981';
    const gradient = isTenth 
      ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' 
      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    const title = isTenth ? '¡Logro Extraordinario! 🌟' : '¡Excelente Compromiso! ⭐';
    const message = isTenth 
      ? `¡Felicidades! Queremos celebrar que <strong>${alumnoNombre}</strong> ha alcanzado <strong>${consecutivas} clases consecutivas</strong> en el taller de <strong>${tallerNombre}</strong>. Su constancia y dedicación son realmente inspiradoras.`
      : `Queremos felicitar a <strong>${alumnoNombre}</strong> por completar <strong>${consecutivas} clases consecutivas</strong> en el taller de <strong>${tallerNombre}</strong>. Agradecemos su compromiso y puntualidad.`;

    const htmlContent = `
      <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
        <div style="background: ${gradient}; padding: 40px 30px; text-align: center; color: white;">
          <div style="font-size: 48px; margin-bottom: 15px;">${isTenth ? '🏆' : '🏅'}</div>
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${title}</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.95; font-weight: 500;">Reconocimiento de Asistencia Perfecta</p>
        </div>
        
        <div style="padding: 40px 30px; background-color: white; line-height: 1.7; color: #334155;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Estimado Apoderado,</h2>
          <p style="font-size: 16px;">${message}</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; margin: 30px 0; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Racha Actual</p>
            <p style="margin: 10px 0 0 0; font-size: 42px; font-weight: 900; color: ${highlightColor}; line-height: 1;">${consecutivas} <span style="font-size: 20px; font-weight: 600; color: #475569;">clases</span></p>
          </div>

          <p style="font-size: 15px; color: #475569;">Agradecemos profundamente su apoyo desde casa para hacer esto posible. La asistencia constante es clave para el desarrollo y aprendizaje.</p>

          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #f1f5f9; text-align: center;">
             <p style="margin: 0; color: #64748b; font-weight: 600; font-size: 14px;">Coordinación de Talleres Extraescolares</p>
             <p style="margin: 5px 0 0 0; color: #94a3b8; font-size: 12px;">Este es un mensaje automático generado por nuestro sistema de gestión académica.</p>
          </div>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: '"Sistema de Asistencia" <' + process.env.MAIL_USER + '>',
        to,
        subject: \`⭐ Racha de Asistencia: \${alumnoNombre} (\${consecutivas} clases)\`,
        html: htmlContent,
      });
      console.log(\`✅ Email de asistencia (\${consecutivas}) enviado a: \${to}\`);
      return true;
    } catch (error) {
      console.error('Error enviando correo de asistencia consecutiva:', error);
      return false;
    }
  }
}
