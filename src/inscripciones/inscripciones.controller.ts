import { Controller, Post, Body, BadRequestException, Get, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcioneDto } from './dto/create-inscripcione.dto';
import * as bcrypt from 'bcrypt';
import { differenceInYears } from 'date-fns';

@Controller('inscripciones')
export class InscripcionesController {
  constructor(private readonly prisma: PrismaService) {}

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
  async inscribir(@Body() dto: CreateInscripcioneDto) {
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
        // Crear nuevo apoderado con su RUT hasheado como contraseña
        const hashedPassword = await bcrypt.hash(rutApoderado, 10);
        
        apoderado = await tx.apoderado.create({
          data: {
            rut: rutApoderado,
            nombre: dto.nombreApoderado,
            telefono: dto.telefonoApoderado || dto.telefono || 'N/A',
            email: dto.emailApoderado.toLowerCase(),
            password: hashedPassword
          }
        });
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

      // C. Descontar Cupos
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
      } catch (error) {
        throw new BadRequestException('No quedan cupos disponibles en este taller.');
      }

      // D. Crear la Inscripción con Ficha Médica y Consentimiento
      const nuevaInscripcion = await tx.inscripcion.create({
        data: {
          tallerId: dto.tallerId,
          alumnoId: alumno.id,
          parentesco: (dto.parentesco?.toLowerCase() === 'otro' && dto.parentescoOtro) 
            ? dto.parentescoOtro 
            : dto.parentesco,
          // Nuevos campos de salud
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

      return { 
        message: `Inscripción exitosa. El apoderado puede iniciar sesión con: Email: ${apoderado.email} y Contraseña: ${rutApoderado}`,
        inscripcionId: nuevaInscripcion.id,
        apoderado: {
          email: apoderado.email,
          nombre: apoderado.nombre
        }
      };
    });
  }
}