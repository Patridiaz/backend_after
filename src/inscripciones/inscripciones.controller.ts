import { Controller, Post, Body, BadRequestException, Get } from '@nestjs/common';
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


  @Post('nueva')
  async inscribir(@Body() dto: CreateInscripcioneDto) {
    // 1. Validar duplicidad en el taller
    const existe = await this.prisma.inscripcion.findFirst({
      where: {
        tallerId: dto.tallerId,
        alumno: { rut: dto.rut }
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
        where: { rut: dto.rutApoderado } 
      });

      if (!apoderado) {
        // Crear nuevo apoderado con su RUT hasheado como contraseña
        const hashedPassword = await bcrypt.hash(dto.rutApoderado, 10);
        
        apoderado = await tx.apoderado.create({
          data: {
            rut: dto.rutApoderado,
            nombre: dto.nombreApoderado,
            telefono: dto.telefonoApoderado || dto.telefono || 'N/A',
            email: dto.emailApoderado,
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
      let alumno = await tx.alumno.findUnique({ where: { rut: dto.rut } });

      if (!alumno) {
        alumno = await tx.alumno.create({
          data: {
            rut: dto.rut,
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

      // D. Crear la Inscripción
      const nuevaInscripcion = await tx.inscripcion.create({
        data: {
          tallerId: dto.tallerId,
          alumnoId: alumno.id,
        }
      });

      return { 
        message: `Inscripción exitosa. El apoderado puede iniciar sesión con: Email: ${apoderado.email} y Contraseña: ${dto.rutApoderado}`,
        inscripcionId: nuevaInscripcion.id,
        apoderado: {
          email: apoderado.email,
          nombre: apoderado.nombre
        }
      };
    });
  }
}