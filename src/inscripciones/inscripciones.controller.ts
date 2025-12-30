import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcioneDto } from './dto/create-inscripcione.dto';
import * as bcrypt from 'bcrypt';

@Controller('inscripciones')
export class InscripcionesController {
  constructor(private readonly prisma: PrismaService) {}

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
      
      // A. Buscar o Crear Apoderado
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
            telefono: dto.telefonoApoderado,
            email: dto.emailApoderado,
            password: hashedPassword
          }
        });
      }

      // B. Buscar o Crear Alumno
      let alumno = await tx.alumno.findUnique({ where: { rut: dto.rut } });

      if (!alumno) {
        alumno = await tx.alumno.create({
          data: {
            rut: dto.rut,
            nombres: dto.nombres,
            apellidos: dto.apellidos,
            fechaNacimiento: new Date(dto.fechaNacimiento),
            curso: 'N/A',
            apoderadoId: apoderado.id // Vinculamos con el apoderado
          }
        });
      } else {
        // Si el alumno ya existe pero con otro apoderado, actualizamos la relación
        if (alumno.apoderadoId !== apoderado.id) {
          alumno = await tx.alumno.update({
            where: { id: alumno.id },
            data: { apoderadoId: apoderado.id }
          });
        }
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