import { Controller, Post, Body, BadRequestException, Get, Param, Res, HttpStatus, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcioneDto } from './dto/create-inscripcione.dto';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { differenceInYears } from 'date-fns';

@Controller('inscripciones')
export class InscripcionesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

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

                    return { status: 'SUCCESS', message: 'Inscripción exitosa.', taller, apoderado, dto };
                } else {
                    const totalEspera = await tx.listaEspera.count({ where: { tallerId: dto.tallerId } });
                    const posicion = totalEspera + 1;
                    await tx.listaEspera.create({
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