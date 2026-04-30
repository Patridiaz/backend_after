import { Controller, Post, Body, BadRequestException, Get, Param, Res, HttpStatus, Inject, UseGuards, Req, UnauthorizedException, Query, Patch, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AuthGuard } from '@nestjs/passport';
import type { Cache } from 'cache-manager';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcioneDto } from './dto/create-inscripcione.dto';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { differenceInYears } from 'date-fns';
import { AuditService } from '../audit/audit.service';

@Controller('inscripciones')
export class InscripcionesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  // --- 🥉🥈🥇 ENDPOINTS DE ALTA RESOLUCIÓN Y AUDITORÍA ---

  @Get('admin/control-total')
  @UseGuards(AuthGuard('jwt'))
  async getControlTotal(
    @Query('sedeId') sedeId?: string,
    @Query('tallerId') tallerId?: string,
    @Query('search') search?: string,
    @Req() req?: any
  ) {
    this.checkAdminOrCoordinador(req.user);

    // 🛡️ Filtros Inteligentes (Prisma-style)
    const filters: any = {};
    if (sedeId) filters.taller = { sedeId: +sedeId };
    if (tallerId) filters.tallerId = +tallerId;
    if (search) {
      filters.alumno = {
        OR: [
          { rut: { contains: search } },
          { nombres: { contains: search } },
          { apellidos: { contains: search } }
        ]
      };
    }

    // 1. Obtenemos Inscritos con Ficha Completa
    const inscritos = await this.prisma.inscripcion.findMany({
      where: filters,
      include: {
        alumno: { include: { establecimiento: true, apoderado: true } },
        taller: { include: { sede: true } }
      },
      orderBy: { id: 'desc' }
    });

    // 2. Obtenemos Lista de Espera con Ficha Completa
    const espera = await this.prisma.listaEspera.findMany({
      where: filters,
      include: {
        alumno: { include: { establecimiento: true, apoderado: true } },
        taller: { include: { sede: true } },
        apoderado: true
      },
      orderBy: [
        { tallerId: 'asc' },
        { posicion: 'asc' }
      ]
    });

    // 3. ✨ INTELIGENCIA DE DESERCIÓN: Obtenemos todos los alumnos que tienen al menos una inscripción INACTIVA
    const desertoresRaw = await this.prisma.inscripcion.findMany({
      where: { activo: false },
      select: { alumnoId: true },
      distinct: ['alumnoId']
    });
    const setDesertores = new Set(desertoresRaw.map(d => d.alumnoId));

    const mapItem = (item: any, tipo: string) => ({
      id: item.id,
      tipo,
      posicion: item.posicion || null,
      fecha: item.fecha,
      alumno: {
        id: item.alumnoId,
        rut: item.alumno.rut,
        nombres: item.alumno.nombres,
        apellidos: item.alumno.apellidos,
        establecimiento: item.alumno.establecimiento?.nombre || 'Particular'
      },
      taller: {
        id: item.tallerId,
        nombre: item.taller.nombre,
        sede: item.taller.sede.nombre
      },
      salud: {
        enfermedadCronica: item.enfermedadCronica,
        enfermedadCronicaDetalle: item.enfermedadCronicaDetalle,
        tratamientoMedico: item.tratamientoMedico,
        alergias: item.alergias,
        necesidadesEspeciales: item.necesidadesEspeciales,
        necesidadesEspecialesDetalle: item.necesidadesEspecialesDetalle,
        apoyoEscolar: item.apoyoEscolar,
        usoImagen: item.usoImagen
      },
      apoderado: {
        nombre: (item.apoderado || item.alumno.apoderado)?.nombre,
        rut: (item.apoderado || item.alumno.apoderado)?.rut,
        email: (item.apoderado || item.alumno.apoderado)?.email,
        telefono: (item.apoderado || item.alumno.apoderado)?.telefono,
        parentesco: item.parentesco
      },
      activo: item.activo,
      tieneDesercion: setDesertores.has(item.alumnoId)
    });

    return {
      inscritos: inscritos.map(i => mapItem(i, 'INSCRITO')),
      enEspera: espera.map(e => mapItem(e, 'ESPERA'))
    };
  }

  @Get('ficha/:id')
  @UseGuards(AuthGuard('jwt'))
  async getFichaInscripcion(@Param('id') id: string, @Req() req: any) {
    this.checkAdminOrCoordinador(req.user);
    const searchId = +id;

    // 1. Intentamos buscar en Inscripciones Confirmadas (Por ID de Inscripción)
    let ficha: any = await this.prisma.inscripcion.findUnique({
      where: { id: searchId },
      include: {
        alumno: { include: { establecimiento: true, apoderado: true } },
        taller: { include: { sede: true } }
      }
    });

    // 2. Si no es un ID de Inscripción, probamos con ID de Lista de Espera
    if (!ficha) {
      ficha = await this.prisma.listaEspera.findUnique({
        where: { id: searchId },
        include: {
          alumno: { include: { establecimiento: true, apoderado: true } },
          taller: { include: { sede: true } },
          apoderado: true
        }
      });
    }

    // 3. ✨ ÚLTIMA OPORTUNIDAD: Probamos si el ID es en realidad el de un ALUMNO
    if (!ficha) {
      // Buscamos la inscripción más reciente para ese ID de Alumno
      ficha = await this.prisma.inscripcion.findFirst({
        where: { alumnoId: searchId },
        include: {
          alumno: { include: { establecimiento: true, apoderado: true } },
          taller: { include: { sede: true } }
        },
        orderBy: { id: 'desc' }
      });

      if (!ficha) {
        // Buscamos la espera más reciente para ese ID de Alumno
        ficha = await this.prisma.listaEspera.findFirst({
          where: { alumnoId: searchId },
          include: {
            alumno: { include: { establecimiento: true, apoderado: true } },
            taller: { include: { sede: true } },
            apoderado: true
          },
          orderBy: { id: 'desc' }
        });
      }
    }

    if (!ficha) throw new BadRequestException('Ficha no encontrada después de buscar en todos los registros vinculados.');

    // 🛡️ Log del Administrador con trazabilidad de RUT
    await this.auditService.log('VIEW', 'FichaAlumno', searchId, `Consulta de expediente para alumno: ${ficha.alumno.rut}`, req.user.nombre);

    return ficha;
  }

  // 📝 Edición Profunda Administrativa (Ficha Clínica y Datos Personales)
  @Patch('admin/ficha/:tipo/:id')
  @UseGuards(AuthGuard('jwt'))
  async updateFichaInscripcion(
    @Param('tipo') tipo: string, 
    @Param('id') id: string, 
    @Body() payload: any,
    @Req() req: any
  ) {
    this.checkAdminOrCoordinador(req.user);
    const searchId = +id;
    const isEspera = tipo.toUpperCase() === 'ESPERA';

    return this.prisma.$transaction(async (tx) => {
      // 1. Obtener la entidad base real
      let ficha: any;
      if (!isEspera) {
        ficha = await tx.inscripcion.findUnique({ where: { id: searchId }, include: { alumno: true } });
      } else {
        ficha = await tx.listaEspera.findUnique({ where: { id: searchId }, include: { alumno: true } });
      }

      if (!ficha) throw new BadRequestException('Ficha original no encontrada para edición.');

      // 2. 🛡️ Actualizar Información del Alumno
      if (payload.alumno) {
        let establecimientoId = ficha.alumno.establecimientoId;
        if (payload.alumno.establecimientoNombre) {
            const estMatch = await tx.establecimiento.findFirst({
                where: { nombre: { contains: payload.alumno.establecimientoNombre.trim() } }
            });
            if (estMatch) {
                establecimientoId = estMatch.id;
            } else {
                const nuevoEst = await tx.establecimiento.create({ data: { nombre: payload.alumno.establecimientoNombre.trim() } });
                establecimientoId = nuevoEst.id;
            }
        }
        await tx.alumno.update({
          where: { id: ficha.alumnoId },
          data: {
            rut: payload.alumno.rut ? payload.alumno.rut.trim().toUpperCase().replace(/[^0-9K]/g, '') : undefined,
            nombres: payload.alumno.nombres,
            apellidos: payload.alumno.apellidos,
            establecimientoId,
          }
        });
      }

      // 3. 🛡️ Actualizar Información Sensible del Apoderado
      const apoderadoIdTarget = ficha.alumno.apoderadoId || ficha.apoderadoId;
      if (payload.apoderado && apoderadoIdTarget) {
        const apoUpdate: any = {
           nombre: payload.apoderado.nombre ? payload.apoderado.nombre.trim().toUpperCase() : undefined,
           email: payload.apoderado.email ? payload.apoderado.email.toLowerCase().trim() : undefined,
           telefono: payload.apoderado.telefono
        };
        
        // AUTO-HEALING SYNC: Si el admin corrige el RUT del apoderado, regeneramos la contraseña
        if (payload.apoderado.rut) {
           const cleanRut = payload.apoderado.rut.trim().toUpperCase().replace(/[^0-9K]/g, '');
           apoUpdate.rut = cleanRut;
           apoUpdate.password = await bcrypt.hash(cleanRut, 5); 
        }

        await tx.apoderado.update({
          where: { id: apoderadoIdTarget },
          data: apoUpdate
        });
      }

      // 4. 🛡️ Actualizar Perfil de Salud y Criterios Directos en la Ficha
      const fichaUpdateData: any = {};
      
      if (payload.parentesco !== undefined) fichaUpdateData.parentesco = payload.parentesco;
      if (payload.salud) {
        if (payload.salud.enfermedadCronica !== undefined) fichaUpdateData.enfermedadCronica = payload.salud.enfermedadCronica;
        if (payload.salud.enfermedadCronicaDetalle !== undefined) fichaUpdateData.enfermedadCronicaDetalle = payload.salud.enfermedadCronicaDetalle;
        if (payload.salud.tratamientoMedico !== undefined) fichaUpdateData.tratamientoMedico = payload.salud.tratamientoMedico;
        if (payload.salud.alergias !== undefined) fichaUpdateData.alergias = payload.salud.alergias;
        if (payload.salud.necesidadesEspeciales !== undefined) fichaUpdateData.necesidadesEspeciales = payload.salud.necesidadesEspeciales;
        if (payload.salud.necesidadesEspecialesDetalle !== undefined) fichaUpdateData.necesidadesEspecialesDetalle = payload.salud.necesidadesEspecialesDetalle;
        if (payload.salud.apoyoEscolar !== undefined) fichaUpdateData.apoyoEscolar = payload.salud.apoyoEscolar;
        if (payload.salud.activo !== undefined) fichaUpdateData.activo = payload.salud.activo;
      }

      if (Object.keys(fichaUpdateData).length > 0) {
        if (!isEspera) {
          // LÓGICA DE CUPOS SI CAMBIA EL ESTADO ACTIVO
          if (fichaUpdateData.activo !== undefined && fichaUpdateData.activo !== ficha.activo) {
             const tallerId = ficha.tallerId;
             if (fichaUpdateData.activo === false) {
                 // Desertar: Liberar cupo
                 await tx.taller.update({
                     where: { id: tallerId },
                     data: { cuposDisponibles: { increment: 1 } }
                 });
             } else {
                 // Re-activar: Ocupar cupo (si hay)
                 const taller = await tx.taller.findUnique({ where: { id: tallerId } });
                 if (!taller) throw new BadRequestException('El taller de la inscripción no existe.');
                 
                 if (taller.cuposDisponibles <= 0) {
                     throw new BadRequestException('No se puede re-activar al alumno: El taller ya no tiene cupos disponibles.');
                 }
                 await tx.taller.update({
                     where: { id: tallerId },
                     data: { cuposDisponibles: { decrement: 1 } }
                 });
             }
          }
          await tx.inscripcion.update({ where: { id: searchId }, data: fichaUpdateData });
        } else {
          await tx.listaEspera.update({ where: { id: searchId }, data: fichaUpdateData });
        }
      }

      return { 
        status: 'SUCCESS', 
        message: 'Ficha Clínica y Académica actualizada exitosamente.',
        fichaOriginalStatus: ficha.activo 
      };
    }).then(result => {
      // Disparamos log fuera del scope transaccional explícito
      let detalleCompleto = `Ficha editada. Datos: ${JSON.stringify(payload)}`;
      if (payload.salud?.activo === false) detalleCompleto = `DESERCIÓN: El alumno fue dado de baja del taller. ${detalleCompleto}`;
      if (payload.salud?.activo === true && result.fichaOriginalStatus === false) detalleCompleto = `RE-ACTIVACIÓN: El alumno fue re-incorporado al taller. ${detalleCompleto}`;

      this.auditService.log('UPDATE', !isEspera ? 'Inscripcion' : 'ListaEspera', searchId, detalleCompleto, req.user.nombre);
      return { status: result.status, message: result.message };
    });
  }

  // 🚀 PROMOCIÓN DE CUPOS: De Espera a Inscrito Oficial
  @Post('admin/promover/:idEspera')
  @UseGuards(AuthGuard('jwt'))
  async promoverAlumno(@Param('idEspera') idEspera: string, @Req() req: any, @Res({ passthrough: true }) response: Response) {
    this.checkAdminOrCoordinador(req.user);
    const searchId = +idEspera;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Obtener la Ficha de Espera completa
        const espera = await tx.listaEspera.findUnique({
          where: { id: searchId },
          include: {
            taller: { include: { sede: true, horarios: true } },
            alumno: true,
            apoderado: true
          }
        });

        if (!espera) throw new BadRequestException('El registro en lista de espera ya no existe.');

        // 2. Verificar que no haya sido promovido ya
        const yaInscrito = await tx.inscripcion.findFirst({
          where: { tallerId: espera.tallerId, alumnoId: espera.alumnoId }
        });
        if (yaInscrito) throw new BadRequestException('Este alumno ya posee una inscripción activa en este taller.');

        // 3. Crear Ficha de Inscripción (Sin pérdida de datos ✨)
        const nuevaInscripcion = await tx.inscripcion.create({
          data: {
            fecha: new Date(),
            tallerId: espera.tallerId,
            alumnoId: espera.alumnoId,
            parentesco: espera.parentesco,
            parentescoOtro: espera.parentescoOtro,
            enfermedadCronica: espera.enfermedadCronica,
            enfermedadCronicaDetalle: espera.enfermedadCronicaDetalle,
            tratamientoMedico: espera.tratamientoMedico,
            alergias: espera.alergias,
            necesidadesEspeciales: espera.necesidadesEspeciales,
            necesidadesEspecialesDetalle: espera.necesidadesEspecialesDetalle,
            apoyoEscolar: espera.apoyoEscolar,
            usoImagen: espera.usoImagen
          }
        });

        // 4. Actualizar estado del Taller (-1 cupo disponible si aplica)
        if (espera.taller.cuposDisponibles > 0) {
          await tx.taller.update({
            where: { id: espera.tallerId },
            data: { cuposDisponibles: { decrement: 1 } }
          });
        }

        // 5. Eliminar el registro original de la Lista de Espera
        await tx.listaEspera.delete({ where: { id: searchId } });

        // 6. Recalcular las posiciones restantes (Shift Up)
        const restantes = await tx.listaEspera.findMany({
          where: { tallerId: espera.tallerId, posicion: { gt: espera.posicion } },
          orderBy: { posicion: 'asc' }
        });

        for (const [index, r] of restantes.entries()) {
          const nuevaPos = espera.posicion + index;
          await tx.listaEspera.update({
            where: { id: r.id },
            data: { posicion: nuevaPos }
          });
        }

        return { 
          status: 'SUCCESS', 
          message: 'Alumno promovido exitosamente.', 
          inscripcionId: nuevaInscripcion.id,
          taller: espera.taller,
          alumno: espera.alumno,
          apoderado: espera.apoderado
        };
      });

      // 7. Auditoría
      await this.auditService.log('CREATE', 'Inscripcion', result.inscripcionId, `Alumno ${result.alumno.rut} PROMOVIDO de Lista de Espera a Taller ${result.taller.id}`, req.user.nombre);

      // 8. 🚀 Disparo del Correo de Confirmación (HQ Mailer)
      // Como el DTO de creación no existe, construimos uno virtual para el MailService
      const dtoVirtual: any = {
        rut: result.alumno.rut,
        nombres: result.alumno.nombres,
        apellidos: result.alumno.apellidos,
        emailApoderado: result.apoderado.email
      };
      
      this.mailService.sendEnrollmentConfirmation(
        result.apoderado.email.toLowerCase(),
        result.alumno.nombres,
        result.taller.nombre,
        result.taller.sede?.nombre || 'Sede Central',
        result.taller.horarios || [],
        dtoVirtual
      ).catch(e => console.error('Error enviando correo de promoción:', e));

      return { status: 'SUCCESS', message: result.message };

    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      console.error(e);
      throw new BadRequestException('Error interno al intentar promover al alumno. La base de datos mantiene su integridad.');
    }
  }

  // 📧 REENVÍO MANUAL DE CORREO OFICIAL (Seguro contra fallos técnicos o errores de digitación de los padres)
  @Post('admin/reenviar-correo/:tipo/:id')
  @UseGuards(AuthGuard('jwt'))
  async reenviarCorreoManual(
    @Param('tipo') tipo: string, 
    @Param('id') id: string, 
    @Req() req: any
  ) {
    this.checkAdminOrCoordinador(req.user);
    const searchId = +id;
    const isEspera = tipo.toUpperCase() === 'ESPERA';

    let ficha: any;
    if (!isEspera) {
      ficha = await this.prisma.inscripcion.findUnique({
        where: { id: searchId },
        include: {
          alumno: { include: { apoderado: true } },
          taller: { include: { sede: true, horarios: true } }
        }
      });
    } else {
      ficha = await this.prisma.listaEspera.findUnique({
        where: { id: searchId },
        include: {
          alumno: { include: { apoderado: true } },
          taller: { include: { sede: true, horarios: true } },
          apoderado: true
        }
      });
    }

    if (!ficha) throw new BadRequestException('Ficha no encontrada. No se puede enviar el correo.');

    // En ListaEspera, el apoderado puede venir directo de la ficha o heredado del alumno
    const apoderadoTarget = isEspera ? (ficha.apoderado || ficha.alumno.apoderado) : ficha.alumno.apoderado;
    if (!apoderadoTarget || !apoderadoTarget.email) {
      throw new BadRequestException('El alumno no tiene un apoderado asociado con un correo electrónico válido.');
    }

    const emailTo = apoderadoTarget.email.toLowerCase().trim();

    // Reconstruimos el objeto de salud y autorizaciones para la plantilla del correo
    const datosSalud = {
      enfermedadCronica: ficha.enfermedadCronica,
      enfermedadCronicaDetalle: ficha.enfermedadCronicaDetalle,
      alergias: ficha.alergias,
      necesidadesEspeciales: ficha.necesidadesEspeciales,
      necesidadesEspecialesDetalle: ficha.necesidadesEspecialesDetalle,
      apoyoEscolar: ficha.apoyoEscolar,
      usoImagen: ficha.usoImagen
    };

    try {
      let enviadoOk = false;
      if (!isEspera) {
        enviadoOk = await this.mailService.sendEnrollmentConfirmation(
          emailTo,
          ficha.alumno.nombres,
          ficha.taller.nombre,
          ficha.taller.sede?.nombre || 'Sede Central',
          ficha.taller.horarios || [],
          datosSalud
        );
      } else {
        enviadoOk = await this.mailService.sendWaitListConfirmation(
          emailTo,
          ficha.alumno.nombres,
          ficha.taller.nombre,
          ficha.taller.sede?.nombre || 'Sede Central',
          ficha.taller.horarios || [],
          datosSalud
        );
      }

      if (!enviadoOk) throw new Error('Mail provider rejected the dispatch.');

      await this.auditService.log('UPDATE', !isEspera ? 'Inscripcion' : 'ListaEspera', searchId, `Reenvío manual de correo a ${emailTo}`, req.user.nombre);
      
      return { status: 'SUCCESS', message: `Correo oficial reenviado exitosamente a ${emailTo}` };
    } catch (e) {
      console.error('Fallo en el reenvío manual de correo:', e);
      throw new BadRequestException('El servidor de correos no pudo procesar la solicitud en este momento.');
    }
  }

  private checkAdminOrCoordinador(user: any) {
    const roles: string[] = user.roles || [];
    const hasRole = roles.some((r: string) => 
      ['ADMIN', 'COORDINADOR'].includes(r.toUpperCase())
    );
    if (!hasRole) {
      throw new UnauthorizedException('Acceso denegado. Se requiere rol de Administrador o Coordinador.');
    }
  }

  @Get('auditoria-sige-v2')
  async getAuditoriaSige() {
    const idsMunicipales = [2, 3, 4, 5, 6, 7, 10];
    
    // 1. Obtenemos todas las inscripciones activas
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { activo: true },
      include: {
        alumno: true,
        taller: { include: { sede: true } }
      }
    });

    if (inscripciones.length === 0) return [];

    // 2. Agrupamos inscripciones por RUT (normalizado: sin ceros, sin guiones, uppercase)
    const inscripcionesPorRut = new Map<string, any[]>();
    inscripciones.forEach(ins => {
      const rut = ins.alumno.rut.replace(/[^0-9Kk]/g, '').toUpperCase().replace(/^0+/, '');
      const list = inscripcionesPorRut.get(rut) || [];
      list.push(ins);
      inscripcionesPorRut.set(rut, list);
    });

    const runsInscritos = Array.from(inscripcionesPorRut.keys());

    // 3. Consultamos en SIGE por los alumnos de las sedes municipales (últimos 2 años para asegurar vigencia)
    const currentYear = new Date().getFullYear();
    const nominaSige = await this.prisma.alumnoSige.findMany({
      where: {
        sedeId: { in: idsMunicipales },
        anio: { gte: 2024 }
      },
      orderBy: { anio: 'desc' }
    });

    // 4. Aseguramos unicidad de alumnos SIGE (el registro más reciente por cada RUT)
    const sigeUnicoPorRut = new Map<string, any>();
    nominaSige.forEach(s => {
      const rut = s.runc.replace(/[^0-9Kk]/g, '').toUpperCase().replace(/^0+/, '');
      if (!sigeUnicoPorRut.has(rut)) {
        sigeUnicoPorRut.set(rut, s);
      }
    });

    const sedesMunicipales = await this.prisma.sede.findMany({
      where: { id: { in: idsMunicipales } }
    });

    // 5. Construimos el reporte agrupado por Sede -> Alumno (con lista de talleres)
    return sedesMunicipales.map(sede => {
      const alumnosEnEsteColegio = Array.from(sigeUnicoPorRut.values())
        .filter(s => s.sedeId === sede.id)
        .map(sige => {
          const rutLimpio = sige.runc.replace(/[^0-9Kk]/g, '').toUpperCase().replace(/^0+/, '');
          const misInscripciones = inscripcionesPorRut.get(rutLimpio) || [];
          
          if (misInscripciones.length === 0) return null;

          // Datos base del alumno desde su ficha en nuestra plataforma (prioritaria para nombres/apellidos)
          const infoAlumno = misInscripciones[0].alumno;
          
          return {
            id: infoAlumno.id,
            rut: infoAlumno.rut,
            nombres: infoAlumno.nombres,
            apellidos: infoAlumno.apellidos,
            // Agrupamos todos sus talleres, ordenados por fecha
            talleres: misInscripciones
              .map(i => ({
                nombre: i.taller.nombre,
                sede: i.taller.sede.nombre,
                fecha: i.fecha
              }))
              .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
          };
        })
        .filter(a => a !== null);

      return {
        id: sede.id,
        nombre: sede.nombre,
        totalInscritos: alumnosEnEsteColegio.length, // Conteo de alumnos únicos
        alumnos: alumnosEnEsteColegio
      };
    });
  }

  @Get('lista-espera')
  async getListaEspera() {
    const espera = await this.prisma.listaEspera.findMany({
      include: {
        alumno: {
          include: {
            establecimiento: true
          }
        },
        taller: {
          include: {
            sede: true
          }
        },
        apoderado: true
      },
      orderBy: [
        { tallerId: 'asc' },
        { posicion: 'asc' }
      ]
    });

    // Mapeamos para una respuesta premium y estructurada
    return espera.map(item => ({
      id: item.id,
      posicion: item.posicion,
      fechaSolicitud: item.fecha,
      alumno: {
        rut: item.alumno.rut,
        nombres: item.alumno.nombres,
        apellidos: item.alumno.apellidos,
        establecimiento: item.alumno.establecimiento?.nombre || 'Particular'
      },
      taller: {
        id: item.tallerId,
        nombre: item.taller.nombre,
        sede: item.taller.sede.nombre
      },
      apoderado: {
        nombre: item.apoderado.nombre,
        rut: item.apoderado.rut,
        email: item.apoderado.email,
        telefono: item.apoderado.telefono,
        parentesco: item.parentesco || 'Apoderado'
      },
      salud: {
        enfermedadCronica: item.enfermedadCronica,
        enfermedadCronicaDetalle: item.enfermedadCronicaDetalle,
        tratamientoMedico: item.tratamientoMedico,
        alergias: item.alergias,
        necesidadesEspeciales: item.necesidadesEspeciales,
        necesidadesEspecialesDetalle: item.necesidadesEspecialesDetalle,
        apoyoEscolar: item.apoyoEscolar,
        usoImagen: item.usoImagen
      }
    }));
  }

  @Get('establecimientos')
  async getEstablecimientos() {
    return this.prisma.establecimiento.findMany({
      orderBy: { nombre: 'asc' }
    });
  }

  @Get('cursos')
  async getCursos() {
    return this.prisma.cursoAlumno.findMany({
      orderBy: [
        { descGrado: 'asc' },
        { letraCurso: 'asc' }
      ]
    });
  }

  @Get('verificar-alumno/:rut')
  async verificarAlumno(@Param('rut') rut: string) {
    const rutLimpio = rut.trim().toUpperCase().replace(/[^0-9K]/g, '');
    const rutConGuion = rutLimpio.length > 1 ? rutLimpio.slice(0, -1) + '-' + rutLimpio.slice(-1) : rutLimpio;

    // 1. Buscar en Alumnos ya inscritos
    const alumnoExistente = await this.prisma.alumno.findFirst({
      where: { 
        OR: [
          { rut: rutLimpio },
          { rut: rutConGuion }
        ]
      },
      include: {
        establecimiento: true,
        apoderado: true,
        inscripciones: {
          orderBy: { id: 'desc' },
          take: 1
        }
      }
    });

    if (alumnoExistente) {
      return {
        encontrado: true,
        origen: 'EXISTENTE',
        datos: {
          nombres: alumnoExistente.nombres,
          apellidos: alumnoExistente.apellidos,
          fechaNacimiento: alumnoExistente.fechaNacimiento,
          establecimientoNombre: alumnoExistente.establecimiento?.nombre,
          apoderado: {
            rut: alumnoExistente.apoderado.rut,
            nombre: alumnoExistente.apoderado.nombre,
            email: alumnoExistente.apoderado.email,
            telefono: alumnoExistente.apoderado.telefono,
            parentesco: alumnoExistente.inscripciones[0]?.parentesco || null
          }
        }
      };
    }

    // 2. Buscar en AlumnoSige (Pre-carga masiva)
    const alumnoSige = await this.prisma.alumnoSige.findFirst({
      where: { 
        OR: [
          { runc: rutLimpio },
          { runc: rutConGuion }
        ]
      },
      include: { sede: true },
      orderBy: { anio: 'desc' }
    });

    if (alumnoSige) {
      return {
        encontrado: true,
        origen: 'SIGE',
        datos: {
          nombres: alumnoSige.nombres,
          apellidos: `${alumnoSige.apellidoPaterno} ${alumnoSige.apellidoMaterno}`.trim(),
          fechaNacimiento: alumnoSige.fechaNacimiento, 
          establecimientoNombre: alumnoSige.sede?.nombre || null 
        }
      };
    }

    return { encontrado: false };
  }

  @Get('verificar-apoderado/:rut')
  async verificarApoderado(@Param('rut') rut: string) {
    const rutLimpio = rut.trim().toUpperCase().replace(/[^0-9K]/g, '');
    const rutConGuion = rutLimpio.length > 1 ? rutLimpio.slice(0, -1) + '-' + rutLimpio.slice(-1) : rutLimpio;

    const apoderado = await this.prisma.apoderado.findFirst({
      where: { 
        OR: [
          { rut: rutLimpio },
          { rut: rutConGuion }
        ]
      }
    });

    if (apoderado) {
      return {
        encontrado: true,
        datos: {
          nombre: apoderado.nombre,
          email: apoderado.email,
          telefono: apoderado.telefono
        }
      };
    }

    return { encontrado: false };
  }

  // 🔄 TRASLADAR ALUMNO DE INSCRIPCIÓN A LISTA DE ESPERA
  @Post('admin/trasladar-a-espera/:id')
  @UseGuards(AuthGuard('jwt'))
  async trasladarAEspera(@Param('id') id: string, @Req() req: any) {
    this.checkAdminOrCoordinador(req.user);
    const inscripcionId = parseInt(id);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Buscar la inscripción original
      const insc = await tx.inscripcion.findUnique({
        where: { id: inscripcionId },
        include: { alumno: true, taller: true }
      });

      if (!insc) throw new BadRequestException('Inscripción no encontrada.');

      // 2. Calcular la nueva posición en la lista de espera
      const totalEspera = await tx.listaEspera.count({
        where: { tallerId: insc.tallerId }
      });
      const posicion = totalEspera + 1;

      // 3. Crear el registro en lista de espera (clonando datos de la ficha)
      const waitlist = await tx.listaEspera.create({
        data: {
          alumnoId: insc.alumnoId,
          tallerId: insc.tallerId,
          apoderadoId: insc.alumno.apoderadoId,
          parentesco: insc.parentesco,
          parentescoOtro: insc.parentescoOtro,
          enfermedadCronica: insc.enfermedadCronica,
          enfermedadCronicaDetalle: insc.enfermedadCronicaDetalle,
          tratamientoMedico: insc.tratamientoMedico,
          alergias: insc.alergias,
          necesidadesEspeciales: insc.necesidadesEspeciales,
          necesidadesEspecialesDetalle: insc.necesidadesEspecialesDetalle,
          apoyoEscolar: insc.apoyoEscolar,
          usoImagen: insc.usoImagen,
          posicion
        }
      });

      // 4. Eliminar la inscripción original
      await tx.inscripcion.delete({ where: { id: inscripcionId } });

      // 5. Auditoría (Nota: Se eliminó el incremento de cupo por solicitud del usuario)
      await this.auditService.log(
        'UPDATE', 
        'Inscripcion', 
        inscripcionId, 
        `Alumno ${insc.alumno.rut} TRASLADADO a lista de espera (Puesto ${posicion}) taller ${insc.tallerId}`, 
        req.user.nombre
      );

      // Limpiar caché de talleres disponibles
      try {
        const store: any = (this.cacheManager as any).store;
        if (store.keys) {
          const keys = await store.keys('talleres_disponibles_*');
          for (const key of keys) await this.cacheManager.del(key);
        }
      } catch (e) {}

      return {
        message: 'Alumno trasladado a lista de espera exitosamente.',
        waitlistId: waitlist.id,
        posicion
      };
    });
  }

  @Post('nueva')
  async inscribir(@Body() dto: CreateInscripcioneDto, @Res({ passthrough: true }) response: Response) {
    const maxRetries = 5;
    let lastError: any = null;

    // Normalizar RUTs fuera del bucle para ahorrar CPU
    const rutAlumno = dto.rut.trim().toUpperCase().replace(/[^0-9K]/g, '');
    const rutApoderado = dto.rutApoderado.trim().toUpperCase().replace(/[^0-9K]/g, '');

    for (let i = 1; i <= maxRetries; i++) {
        try {
            const result = await this.prisma.$transaction(async (tx) => {
                // 1. Taller y Edad (Traemos Sede y Horarios para el correo)
                const taller = await tx.taller.findUnique({ 
                  where: { id: dto.tallerId },
                  include: { sede: true, horarios: true }
                });
                if (!taller) throw new BadRequestException('El taller no existe.');
                
                if (!taller.activo) {
                    throw new BadRequestException('Este taller no está aceptando nuevas inscripciones ni ingresos a lista de espera en este momento.');
                }

                const fechaNac = new Date(dto.fechaNacimiento);
                const edadAlumno = differenceInYears(new Date(), fechaNac);
                if (edadAlumno < taller.edadMinima || edadAlumno > taller.edadMaxima) {
                    throw new BadRequestException(`El alumno tiene ${edadAlumno} años y el taller es para edades entre ${taller.edadMinima} y ${taller.edadMaxima} años.`);
                }

                // ... (Verificaciones de duplicidad, etc.)
                const yaInscrito = await tx.inscripcion.findFirst({
                    where: { tallerId: dto.tallerId, alumno: { rut: rutAlumno } }
                });
                if (yaInscrito) throw new BadRequestException('El alumno ya está inscrito en este taller.');

                const yaEnEspera = await tx.listaEspera.findFirst({
                    where: { tallerId: dto.tallerId, alumno: { rut: rutAlumno } }
                });
                if (yaEnEspera) throw new BadRequestException('El alumno ya está en lista de espera.');

                // 3. APODERADO: Sincronización de Identidad Crítica
                let apoderado = await tx.apoderado.findUnique({ where: { rut: rutApoderado } });
                const hashedPassword = await bcrypt.hash(rutApoderado, 5); // El RUT siempre es la llave

                if (!apoderado) {
                    // Creación de nuevo apoderado
                    apoderado = await tx.apoderado.create({
                        data: {
                            rut: rutApoderado,
                            nombre: dto.nombreApoderado.trim().toUpperCase(),
                            email: dto.emailApoderado.toLowerCase().trim(),
                            telefono: dto.telefonoApoderado,
                            password: hashedPassword
                        }
                    });
                } else {
                    // AUTO-HEALING: Si los datos cambiaron (email, fono, etc), los actualizamos
                    // Esto asegura que si el admin cambió el RUT o el correo, el login siga funcionando
                    apoderado = await tx.apoderado.update({
                        where: { id: apoderado.id },
                        data: {
                            nombre: dto.nombreApoderado.trim().toUpperCase(),
                            email: dto.emailApoderado.toLowerCase().trim(),
                            telefono: dto.telefonoApoderado,
                            password: hashedPassword // Sincronizamos PASSWORD con el RUT actual
                        }
                    });
                }

                // ... (Establecimiento y Alumno)
                let establecimientoId: number | null = null;
                if (dto.establecimientoNombre) {
                    const estMatch = await tx.establecimiento.findFirst({
                        where: { nombre: { contains: dto.establecimientoNombre.trim() } }
                    });
                    if (estMatch) {
                        establecimientoId = estMatch.id;
                    } else {
                        const nuevoEst = await tx.establecimiento.create({ data: { nombre: dto.establecimientoNombre.trim() } });
                        establecimientoId = nuevoEst.id;
                    }
                }

                let alumno = await tx.alumno.findUnique({ where: { rut: rutAlumno } });
                if (!alumno) {
                    alumno = await tx.alumno.create({
                        data: {
                            rut: rutAlumno,
                            nombres: dto.nombres,
                            apellidos: dto.apellidos,
                            fechaNacimiento: new Date(dto.fechaNacimiento),
                            apoderadoId: apoderado.id,
                            establecimientoId: establecimientoId
                        }
                    });
                } else {
                    alumno = await tx.alumno.update({
                        where: { id: alumno.id },
                        data: { apoderadoId: apoderado.id, establecimientoId: establecimientoId || alumno.establecimientoId }
                    });
                }

                // 5. Lógica de Cupos vs Lista de Espera 
                if (taller.cuposDisponibles > 0) {
                    const nuevaInsc = await tx.inscripcion.create({
                        data: {
                            tallerId: dto.tallerId,
                            alumnoId: alumno.id,
                            parentesco: (dto.parentesco?.toLowerCase() === 'otro' && dto.parentescoOtro) ? dto.parentescoOtro : dto.parentesco,
                            enfermedadCronica: dto.enfermedadCronica ?? false,
                            enfermedadCronicaDetalle: dto.enfermedadCronicaDetalle,
                            tratamientoMedico: dto.tratamientoMedico,
                            alergias: dto.alergias,
                            necesidadesEspeciales: dto.necesidadesEspeciales ?? false,
                            necesidadesEspecialesDetalle: dto.necesidadesEspecialesDetalle,
                            apoyoEscolar: dto.apoyoEscolar,
                            usoImagen: dto.usoImagen ?? false,
                        }
                    });

                    await tx.taller.update({
                        where: { id: dto.tallerId },
                        data: { cuposDisponibles: { decrement: 1 } }
                    });

                    // Invalida Caché
                    try {
                        const store: any = (this.cacheManager as any).store;
                        if (store.keys) {
                            const keys = await store.keys('talleres_disponibles_*');
                            for (const key of keys) await this.cacheManager.del(key);
                        }
                    } catch (e) {}

                    await this.auditService.log('CREATE', 'Inscripcion', nuevaInsc.id, `Alumno ${alumno.rut} inscrito en taller ${dto.tallerId}`);

                    return { status: 'SUCCESS', message: 'Inscripción exitosa.', taller, apoderado, dto };
                } else {
                    const totalEspera = await tx.listaEspera.count({ where: { tallerId: dto.tallerId } });
                    const posicion = totalEspera + 1;
                    const nEspera = await tx.listaEspera.create({
                        data: {
                            alumnoId: alumno.id,
                            tallerId: dto.tallerId,
                            apoderadoId: apoderado.id, // Vinculación directa con el apoderado
                            posicion,
                            parentesco: (dto.parentesco?.toLowerCase() === 'otro' && dto.parentescoOtro) ? dto.parentescoOtro : dto.parentesco,
                            parentescoOtro: dto.parentescoOtro,
                            enfermedadCronica: dto.enfermedadCronica ?? false,
                            enfermedadCronicaDetalle: dto.enfermedadCronicaDetalle,
                            tratamientoMedico: dto.tratamientoMedico,
                            alergias: dto.alergias,
                            necesidadesEspeciales: dto.necesidadesEspeciales ?? false,
                            necesidadesEspecialesDetalle: dto.necesidadesEspecialesDetalle,
                            apoyoEscolar: dto.apoyoEscolar,
                            usoImagen: dto.usoImagen ?? false,
                        }
                    });

                    await this.auditService.log('CREATE', 'ListaEspera', nEspera.id, `Alumno ${alumno.rut} en lista de espera pos ${posicion} taller ${dto.tallerId}`);
                    
                    return { status: 'WAIT_LIST', posicion, message: `Taller lleno. Inscrito en posición ${posicion} de espera.`, taller, apoderado, dto };
                }
            });

            // --- 🚀 DISPARO DE CORREOS POST-TRANSACCIÓN (GARANTIZADO) ---
            if (result.status === 'SUCCESS') {
                this.mailService.sendEnrollmentConfirmation(
                    result.dto.emailApoderado.toLowerCase(),
                    result.dto.nombres,
                    result.taller.nombre,
                    result.taller.sede?.nombre || 'Sede Central',
                    result.taller.horarios || [],
                    result.dto
                ).catch(e => console.error('Error post-inscripción:', e));
                
                return { status: 'SUCCESS', message: result.message };
            } else if (result.status === 'WAIT_LIST') {
                console.log(`📧 Enviando Lista de Espera post-commit: ${result.dto.emailApoderado}`);
                
                this.mailService.sendWaitListConfirmation(
                    result.dto.emailApoderado.toLowerCase(),
                    result.dto.nombres,
                    result.taller.nombre,
                    result.taller.sede?.nombre || 'Sede Central',
                    result.taller.horarios || [],
                    result.dto
                ).catch(e => console.error('Error post-espera:', e));
                
                response.status(HttpStatus.ACCEPTED);
                return { status: 'WAIT_LIST', posicion: result.posicion, message: result.message };
            }
        } catch (error) {
            lastError = error;
            if (error.code === 'P2034' || error.message?.includes('Timeout') || error.message?.includes('conflict')) {
                await new Promise(resolve => setTimeout(resolve, i * 40));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
  }

  // --- 🥉🥈🥇 FLUJO ENCARGADO -> COORDINADOR ---

  @Get('coordinador/pendientes')
  @UseGuards(AuthGuard('jwt'))
  async getPendientesContacto(@Req() req: any) {
    this.checkAdminOrCoordinador(req.user);
    
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { estado: 'PENDIENTE_CONTACTO' },
      include: {
        alumno: { include: { apoderado: true, establecimiento: true } },
        taller: { include: { sede: true } }
      },
      orderBy: { id: 'asc' }
    });

    const esperas = await this.prisma.listaEspera.findMany({
      where: { estado: 'PENDIENTE_CONTACTO' },
      include: {
        alumno: { include: { apoderado: true, establecimiento: true } },
        taller: { include: { sede: true } },
        apoderado: true
      },
      orderBy: { id: 'asc' }
    });

    return {
      inscripciones: inscripciones.map(i => ({ ...i, tipo: 'INSCRIPCION' })),
      esperas: esperas.map(e => ({ ...e, tipo: 'ESPERA' }))
    };
  }

  @Post('encargado/pre-inscribir')
  @UseGuards(AuthGuard('jwt'))
  async preInscribirEncargado(@Body() dto: CreateInscripcioneDto, @Req() req: any) {
    const user = req.user;
    const esEncargado = user.roles?.some((r: string) => r.toUpperCase() === 'ENCARGADO_ESCUELA');
    const esAdmin = user.roles?.some((r: string) => r.toUpperCase() === 'ADMIN');

    if (!esEncargado && !esAdmin) {
      throw new UnauthorizedException('Acceso denegado. Solo Encargados o Admins.');
    }

    return this.prisma.$transaction(async (tx) => {
      const rutAlumno = dto.rut.trim().toUpperCase().replace(/[^0-9K]/g, '');
      const rutApoderado = dto.rutApoderado.trim().toUpperCase().replace(/[^0-9K]/g, '');

      // 0. Verificar si ya existe inscripción o espera
      const [existingIns, existingWait] = await Promise.all([
        tx.inscripcion.findFirst({ where: { alumno: { rut: rutAlumno }, tallerId: dto.tallerId } }),
        tx.listaEspera.findFirst({ where: { alumno: { rut: rutAlumno }, tallerId: dto.tallerId } })
      ]);

      if (existingIns || existingWait) {
        throw new BadRequestException('El estudiante ya se encuentra inscrito o en lista de espera para este taller.');
      }

      // 1. Taller
      const taller = await tx.taller.findUnique({ 
        where: { id: dto.tallerId },
        include: { sede: true } 
      });
      if (!taller) throw new BadRequestException('El taller no existe.');

      // 2. Apoderado
      let apoderado = await tx.apoderado.findUnique({ where: { rut: rutApoderado } });
      if (!apoderado) {
        apoderado = await tx.apoderado.create({
          data: {
            rut: rutApoderado,
            nombre: dto.nombreApoderado.trim().toUpperCase(),
            email: dto.emailApoderado.toLowerCase().trim(),
            telefono: dto.telefonoApoderado,
            password: await bcrypt.hash(rutApoderado, 5)
          }
        });
      }

      // 3. Alumno (Create or Update)
      let alumno = await tx.alumno.findUnique({ where: { rut: rutAlumno } });
      if (!alumno) {
        alumno = await tx.alumno.create({
          data: {
            rut: rutAlumno,
            nombres: dto.nombres.trim().toUpperCase(),
            apellidos: dto.apellidos.trim().toUpperCase(),
            fechaNacimiento: new Date(dto.fechaNacimiento),
            apoderadoId: apoderado.id
          }
        });
      } else {
        alumno = await tx.alumno.update({
          where: { id: alumno.id },
          data: {
            nombres: dto.nombres.trim().toUpperCase(),
            apellidos: dto.apellidos.trim().toUpperCase(),
            fechaNacimiento: new Date(dto.fechaNacimiento)
          }
        });
      }

      // 4. Inscripción / Espera con estado PENDIENTE_CONTACTO
      let res;
      if (taller.cuposDisponibles > 0) {
        res = await tx.inscripcion.create({
          data: {
            tallerId: dto.tallerId,
            alumnoId: alumno.id,
            parentesco: dto.parentesco,
            estado: 'PENDIENTE_CONTACTO'
          }
        });
        await tx.taller.update({ where: { id: dto.tallerId }, data: { cuposDisponibles: { decrement: 1 } } });
      } else {
        const totalEspera = await tx.listaEspera.count({ where: { tallerId: dto.tallerId } });
        res = await tx.listaEspera.create({
          data: {
            alumnoId: alumno.id,
            tallerId: dto.tallerId,
            apoderadoId: apoderado.id,
            posicion: totalEspera + 1,
            parentesco: dto.parentesco,
            estado: 'PENDIENTE_CONTACTO'
          }
        });
      }

      // 5. Correo de Pre-inscripción
      await this.mailService.sendPreEnrollmentNotice(
        dto.emailApoderado,
        dto.nombres,
        taller.nombre,
        taller.sede.nombre
      );

      await this.auditService.log('CREATE', 'PreInscripcion', res.id, `Pre-inscripción realizada por encargado: ${user.nombre}`, user.nombre);

      return { status: 'SUCCESS', message: 'Pre-inscripción realizada. Se ha enviado correo al apoderado.' };
    });
  }


  @Patch('coordinador/finalizar-registro/:id')
  @UseGuards(AuthGuard('jwt'))
  async finalizarRegistroCoordinador(
    @Param('id') id: string, 
    @Query('tipo') tipo: string,
    @Body() payload: any, 
    @Req() req: any
  ) {
    this.checkAdminOrCoordinador(req.user);
    const isEspera = tipo === 'ESPERA';

    return this.prisma.$transaction(async (tx) => {
      const updateData = {
        enfermedadCronica: payload.enfermedadCronica,
        enfermedadCronicaDetalle: payload.enfermedadCronicaDetalle,
        tratamientoMedico: payload.tratamientoMedico,
        alergias: payload.alergias,
        necesidadesEspeciales: payload.necesidadesEspeciales,
        necesidadesEspecialesDetalle: payload.necesidadesEspecialesDetalle,
        apoyoEscolar: payload.apoyoEscolar,
        usoImagen: payload.usoImagen,
        estado: 'ACTIVA'
      };

      let record;
      if (!isEspera) {
        record = await tx.inscripcion.update({
          where: { id: +id },
          data: updateData,
          include: { alumno: { include: { apoderado: true } }, taller: { include: { sede: true } } }
        });
      } else {
        record = await tx.listaEspera.update({
          where: { id: +id },
          data: updateData,
          include: { alumno: { include: { apoderado: true } }, taller: { include: { sede: true } } }
        });
      }

      // Correo de Confirmación Final
      await this.mailService.sendFinalEnrollmentConfirmation(
        record.alumno.apoderado.email,
        record.alumno.nombres,
        record.taller.nombre,
        record.taller.sede.nombre
      );

      await this.auditService.log('UPDATE', 'InscripcionFinalizada', +id, `Registro completado por coordinador: ${req.user.nombre}`, req.user.nombre);

      return { status: 'SUCCESS', message: 'Registro finalizado y correo de confirmación enviado.' };
    });
  }

  @Post('admin/trasladar-taller')
  @UseGuards(AuthGuard('jwt'))
  async trasladarTaller(@Body() body: { id: number, tipo: string, nuevoTallerId: number }, @Req() req: any) {
    this.checkAdminOrCoordinador(req.user);
    const { id, tipo, nuevoTallerId } = body;
    const isEspera = tipo === 'ESPERA';

    return this.prisma.$transaction(async (tx) => {
      // 1. Obtener registro actual
      let record;
      if (!isEspera) {
        record = await tx.inscripcion.findUnique({ 
          where: { id }, 
          include: { taller: true, alumno: { include: { apoderado: true } } } 
        });
      } else {
        record = await tx.listaEspera.findUnique({ 
          where: { id }, 
          include: { taller: true, alumno: { include: { apoderado: true } } } 
        });
      }
      
      if (!record) throw new NotFoundException('Registro no encontrado.');

      const tallerAntiguoId = record.tallerId;
      if (tallerAntiguoId === nuevoTallerId) throw new BadRequestException('El nuevo taller es el mismo que el actual.');

      // 2. Verificar nuevo taller
      const nuevoTaller = await tx.taller.findUnique({ where: { id: nuevoTallerId } });
      if (!nuevoTaller) throw new NotFoundException('El nuevo taller no existe.');

      // 3. Actualizar cupos del taller antiguo (solo si era una inscripción activa)
      if (!isEspera) {
        await tx.taller.update({
          where: { id: tallerAntiguoId },
          data: { cuposDisponibles: { increment: 1 } }
        });
      }

      // 4. Determinar si entra a Inscripción o Lista de Espera en el nuevo taller
      let target;
      if (nuevoTaller.cuposDisponibles > 0) {
        if (isEspera) {
          await tx.listaEspera.delete({ where: { id } });
          target = await tx.inscripcion.create({
            data: {
              alumnoId: record.alumnoId,
              tallerId: nuevoTallerId,
              parentesco: record.parentesco,
              estado: record.estado === 'PENDIENTE_CONTACTO' ? 'PENDIENTE_CONTACTO' : 'ACTIVA'
            }
          });
        } else {
          target = await tx.inscripcion.update({
            where: { id },
            data: { tallerId: nuevoTallerId }
          });
        }
        await tx.taller.update({
          where: { id: nuevoTallerId },
          data: { cuposDisponibles: { decrement: 1 } }
        });
      } else {
        const totalEspera = await tx.listaEspera.count({ where: { tallerId: nuevoTallerId } });
        if (!isEspera) {
          await tx.inscripcion.delete({ where: { id } });
          target = await tx.listaEspera.create({
            data: {
              alumnoId: record.alumnoId,
              tallerId: nuevoTallerId,
              apoderadoId: record.alumno.apoderadoId,
              posicion: totalEspera + 1,
              parentesco: record.parentesco,
              estado: record.estado
            }
          });
        } else {
          target = await tx.listaEspera.update({
            where: { id },
            data: { tallerId: nuevoTallerId, posicion: totalEspera + 1 }
          });
        }
      }

      await this.auditService.log('UPDATE', 'TrasladoTaller', id, `Alumno ${record.alumno.rut} trasladado de ${record.taller.nombre} a ${nuevoTaller.nombre}`, req.user.nombre);

      return { message: 'Traslado realizado exitosamente.', target };
    });
  }
}
