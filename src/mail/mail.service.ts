import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', // Asumimos Gmail/Google Workspace por eduhuechuraba.cl
      port: 465,
      secure: true,
      auth: {
        user: 'afterschool@eduhuechuraba.cl',
        pass: 'odcp pqvx exbr zsmh',
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
        from: '"AfterSchool Huechuraba" <afterschool@eduhuechuraba.cl>',
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
          <p style="margin: 10px 0 0 0; opacity: 0.9;">AfterSchool Huechuraba 2026</p>
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
        from: '"AfterSchool Huechuraba" <afterschool@eduhuechuraba.cl>',
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
}
