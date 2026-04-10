import { Controller, Post, Body, BadRequestException, Get, Param, Res, HttpStatus, Inject, UseGuards, Req, UnauthorizedException, Query, Patch } from '@nestjs/common';
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
        apoyoEscolar: item.apoyoEscolar
      },
      apoderado: {
        nombre: (item.apoderado || item.alumno.apoderado)?.nombre,
        rut: (item.apoderado || item.alumno.apoderado)?.rut,
        email: (item.apoderado || item.alumno.apoderado)?.email,
        telefono: (item.apoderado || item.alumno.apoderado)?.telefono,
        parentesco: item.parentesco
      }
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
      }

      if (Object.keys(fichaUpdateData).length > 0) {
        if (!isEspera) {
          await tx.inscripcion.update({ where: { id: searchId }, data: fichaUpdateData });
        } else {
          await tx.listaEspera.update({ where: { id: searchId }, data: fichaUpdateData });
        }
      }

      return { status: 'SUCCESS', message: 'Ficha Clínica y Académica actualizada exitosamente.' };
    }).then(result => {
      // Disparamos log fuera del scope transaccional explícito
      const detalleCompleto = `Ficha editada. Datos: ${JSON.stringify(payload)}`;
      this.auditService.log('UPDATE', !isEspera ? 'Inscripcion' : 'ListaEspera', searchId, detalleCompleto, req.user.nombre);
      return result;
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

  @Get('auditoria-sige')
  async getAuditoriaSige() {
    const idsMunicipales = [2, 3, 4, 5, 6, 7, 10];
    
    // 1. Obtenemos solo a los alumnos que REALMENTE tienen inscripciones activas
    const inscripciones = await this.prisma.inscripcion.findMany({
      include: {
        alumno: true,
        taller: { include: { sede: true } }
      }
    });

    if (inscripciones.length === 0) return [];

    // 2. Extraemos los RUTs únicos de los inscritos para el cruce (RUT limpio)
    const runsInscritos = Array.from(new Set(
      inscripciones.map(i => i.alumno.rut.replace(/[^0-9K]/g, ''))
    ));

    // 3. Consultamos en SIGE por los alumnos inscritos QUE PERTENECEN a los 7 colegios
    const nominaSigeMatch = await this.prisma.alumnoSige.findMany({
      where: {
        sedeId: { in: idsMunicipales },
        OR: [
          { runc: { in: runsInscritos } },
          { runc: { in: runsInscritos.map((r: string) => r.length > 1 ? r.slice(0, -1) + '-' + r.slice(-1) : r) } }
        ]
      },
      include: { sede: true }
    });

    // 4. Obtenemos los nombres de los 7 establecimientos para asegurar que todos aparezcan en el reporte
    const sedesMunicipales = await this.prisma.sede.findMany({
      where: { id: { in: idsMunicipales } }
    });

    // 5. Construimos el reporte agrupado en memoria (Eficiencia 100%)
    return sedesMunicipales.map(sede => {
      const alumnosEnEsteColegio = nominaSigeMatch
        .filter(s => s.sedeId === sede.id)
        .map(sige => {
          // Buscamos la inscripción correspondiente normalizando ambos RUTs para el match final
          const sigeRutLimpio = sige.runc.replace(/[^0-9K]/g, '');
          const ins = inscripciones.find(i => i.alumno.rut.replace(/[^0-9K]/g, '') === sigeRutLimpio);
          if (!ins) return null;
          
          return {
            id: ins.id, // <--- LA LLAVE MAESTRA REQUERIDA ✨🛡️🏎️
            rut: ins.alumno.rut,
            nombres: ins.alumno.nombres,
            apellidos: ins.alumno.apellidos,
            taller: ins.taller.nombre,
            sedeTaller: ins.taller.sede.nombre,
            fechaInscripcion: ins.fecha
          };
        })
        .filter(a => a !== null); // Solo incluimos si hay match real

      return {
        id: sede.id,
        nombre: sede.nombre,
        totalInscritos: alumnosEnEsteColegio.length,
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
}