import { Controller, Post, Body, BadRequestException, Get, Param, Res, HttpStatus, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcioneDto } from './dto/create-inscripcione.dto';
import * as bcrypt from 'bcrypt';
import { differenceInYears } from 'date-fns';

@Controller('inscripciones')
export class InscripcionesController {
  constructor(
    private readonly prisma: PrismaService,
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
          // Si ya tiene apoderado, también lo devolvemos para autocompletar
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
      orderBy: { anio: 'desc' } // El más reciente
    });

    if (alumnoSige) {
      return {
        encontrado: true,
        origen: 'SIGE',
        datos: {
          nombres: alumnoSige.nombres,
          apellidos: `${alumnoSige.apellidoPaterno} ${alumnoSige.apellidoMaterno}`.trim(),
          fechaNacimiento: alumnoSige.fechaNacimiento, // Nota: En SIGE es String
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
    // Normalizar RUTs (sin puntos ni guion)
    const rutAlumno = dto.rut.trim().toUpperCase().replace(/[^0-9K]/g, '');
    const rutApoderado = dto.rutApoderado.trim().toUpperCase().replace(/[^0-9K]/g, '');

    // 1. Validar duplicidad en el taller
    const existe = await this.prisma.inscripcion.findFirst({
      where: {
        tallerId: dto.tallerId,
        alumno: { rut: rutAlumno }
      }
    });

    if (existe) throw new BadRequestException('El alumno ya está inscrito en este taller.');

    // 2. Transacción
    return await this.prisma.$transaction(async (tx) => {
      
      // A. Validar taller y EDAD
      const taller = await tx.taller.findUnique({ where: { id: dto.tallerId } });
      if (!taller) throw new BadRequestException('El taller no existe.');

      const fechaNac = new Date(dto.fechaNacimiento);
      const edadAlumno = differenceInYears(new Date(), fechaNac);

      if (edadAlumno < taller.edadMinima || edadAlumno > taller.edadMaxima) {
        throw new BadRequestException(
          `El alumno tiene ${edadAlumno} años y el taller es para edades entre ${taller.edadMinima} y ${taller.edadMaxima} años.`
        );
      }

      // B. Buscar o Crear Apoderado
      let apoderado = await tx.apoderado.findUnique({ 
        where: { rut: rutApoderado } 
      });

      if (!apoderado) {
        // Primero verificamos si el email ya está en uso por otro apoderado (para dar un error claro)
        const emailEnUso = await tx.apoderado.findUnique({
          where: { email: dto.emailApoderado.toLowerCase() }
        });

        if (emailEnUso) {
          throw new BadRequestException(
            `El correo ${dto.emailApoderado} ya está registrado con otro RUT. Por favor, use el mismo RUT asociado a ese correo o un email diferente.`
          );
        }

        const hashedPassword = await bcrypt.hash(rutApoderado, 5);
        
        try {
          apoderado = await tx.apoderado.create({
            data: {
              rut: rutApoderado,
              nombre: dto.nombreApoderado,
              telefono: dto.telefonoApoderado || dto.telefono || 'N/A',
              email: dto.emailApoderado.toLowerCase(),
              password: hashedPassword
            }
          });
        } catch (error) {
          if (error.code === 'P2002') {
            throw new BadRequestException('El RUT o el correo del apoderado ya están registrados en el sistema.');
          }
          throw error;
        }
      }

      // B.1 Buscar o Crear Establecimiento (con normalización para evitar duplicados)
      let establecimientoId: number | null = null;
      if (dto.establecimientoNombre) {
        const estNombre = dto.establecimientoNombre.trim();
        if (estNombre !== '') {
          // Buscamos primero por nombre normalizado (insensible a mayúsculas)
          const estExistente = await tx.establecimiento.findFirst({
            where: {
              nombre: { contains: estNombre }
            }
          });

          if (estExistente) {
            establecimientoId = estExistente.id;
          } else {
            const nuevo = await tx.establecimiento.create({
              data: { nombre: estNombre }
            });
            establecimientoId = nuevo.id;
          }
        }
      }

      // B.2 Buscar o Crear Alumno
      let alumno = await tx.alumno.findUnique({ where: { rut: rutAlumno } });

      if (!alumno) {
        alumno = await tx.alumno.create({
          data: {
            rut: rutAlumno,
            nombres: dto.nombres,
            apellidos: dto.apellidos,
            fechaNacimiento: new Date(dto.fechaNacimiento),
            apoderadoId: apoderado.id, // Vinculamos con el apoderado
            establecimientoId: establecimientoId, // Vinculamos establecimiento
          }
        });
      } else {
        // Si el alumno ya existe, actualizamos su curso, apoderado y establecimiento si es necesario
        alumno = await tx.alumno.update({
          where: { id: alumno.id },
          data: { 
            apoderadoId: apoderado.id,
            establecimientoId: establecimientoId || alumno.establecimientoId, // Mantenemos el anterior si no viene uno nuevo
          }
        });
      }

      // C. Descontar Cupos o Lista de Espera
      try {
        await tx.taller.update({
          where: { 
            id: dto.tallerId,
            cuposDisponibles: { gt: 0 }
          },
          data: {
            cuposDisponibles: { decrement: 1 }
          }
        });

        // D. Crear la Inscripción con Ficha Médica y Consentimiento
        const nuevaInscripcion = await tx.inscripcion.create({
          data: {
            tallerId: dto.tallerId,
            alumnoId: alumno.id,
            parentesco: (dto.parentesco?.toLowerCase() === 'otro' && dto.parentescoOtro) 
              ? dto.parentescoOtro 
              : dto.parentesco,
            enfermedadCronica: dto.enfermedadCronica ?? false,
            enfermedadCronicaDetalle: dto.enfermedadCronicaDetalle || null,
            tratamientoMedico: dto.tratamientoMedico || null,
            alergias: dto.alergias || null,
            necesidadesEspeciales: dto.necesidadesEspeciales ?? false,
            necesidadesEspecialesDetalle: dto.necesidadesEspecialesDetalle || null,
            apoyoEscolar: dto.apoyoEscolar || null,
            usoImagen: dto.usoImagen ?? false,
          }
        });

        // Invalida Caché de Talleres (puesto que han cambiado los cupos)
        try {
          const store: any = (this.cacheManager as any).store;
          if (store.keys) {
            const keys = await store.keys('talleres_disponibles_*');
            for (const key of keys) {
              await this.cacheManager.del(key);
            }
          }
        } catch (e) {
          console.error("Error invalidando caché tras inscripción:", e);
        }

        return { 
          status: 'SUCCESS',
          message: `Inscripción exitosa. El apoderado puede iniciar sesión con: Email: ${apoderado.email} y Contraseña: ${rutApoderado}`,
          inscripcionId: nuevaInscripcion.id,
          apoderado: { email: apoderado.email, nombre: apoderado.nombre }
        };

      } catch (error) {
        // --- LÓGICA DE LISTA DE ESPERA ---
        // Si falló el update por cuposDisponibles: { gt: 0 }, venimos aquí.
        // Pero primero verificamos si no fue un error real de DB.
        const tallerCheck = await tx.taller.findUnique({ where: { id: dto.tallerId } });
        if (tallerCheck && tallerCheck.cuposDisponibles > 0) {
          // Si hay cupos pero falló, fue otro error (ej: el taller desapareció en milisegundos)
          throw error; 
        }

        // 1. Verificamos si ya está inscrito (para no duplicar en espera)
        const yaInscrito = await tx.inscripcion.findFirst({
          where: { alumnoId: alumno.id, tallerId: dto.tallerId }
        });
        if (yaInscrito) throw new BadRequestException('El alumno ya se encuentra inscrito en este taller.');

        // 2. Verificamos si ya está en lista de espera
        const yaEnEspera = await tx.listaEspera.findFirst({
          where: { alumnoId: alumno.id, tallerId: dto.tallerId }
        });
        if (yaEnEspera) throw new BadRequestException('El alumno ya se encuentra en la lista de espera de este taller.');

        // 3. Crear registro en Lista de Espera
        await tx.listaEspera.create({
          data: {
            alumnoId: alumno.id,
            tallerId: dto.tallerId
          }
        });

        // 4. Calcular posición (contar cuántos hay antes o en total en ese taller)
        const posicion = await tx.listaEspera.count({
          where: { tallerId: dto.tallerId }
        });

        response.status(HttpStatus.ACCEPTED); // Status 202
        return {
          status: 'WAIT_LIST',
          posicion,
          message: `Taller lleno. El alumno ha quedado en la posición ${posicion} de la lista de espera.`,
          apoderado: { email: apoderado.email, nombre: apoderado.nombre }
        };
      }
    });
  }
}