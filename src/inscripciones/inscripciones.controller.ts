import { Controller, Post, Body, BadRequestException, Get, Param, Res, HttpStatus, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
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
          { runc: { in: runsInscritos.map(r => r.length > 1 ? r.slice(0, -1) + '-' + r.slice(-1) : r) } }
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

                // 3. Apoderado y Alumno...
                let apoderado = await tx.apoderado.findUnique({ where: { rut: rutApoderado } });
                if (!apoderado) {
                    const hashedPassword = await bcrypt.hash(rutApoderado, 5);
                    apoderado = await tx.apoderado.create({
                        data: {
                            rut: rutApoderado,
                            nombre: dto.nombreApoderado,
                            email: dto.emailApoderado.toLowerCase(),
                            telefono: dto.telefonoApoderado,
                            password: hashedPassword
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