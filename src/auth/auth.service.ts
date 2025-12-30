import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  /**
   * LOGIN PARA PROFESORES Y ADMINS (desde BD ticket-service)
   */
  async loginProfesor(email: string, password: string) {
    const query = `
      SELECT 
        u.id, 
        u.email, 
        u.password, 
        u.name,
        r.nombre as rolNombre
      FROM [ticket-service].[dbo].[user] u
      JOIN [ticket-service].[dbo].[user_roles] ur ON u.id = ur.userId
      JOIN [ticket-service].[dbo].[rolUser] r ON ur.rolUserId = r.id
      WHERE u.email = @p0 AND u.isActive = 1
    `;

    try {
      const resultados: any[] = await this.prisma.$queryRaw`
        SELECT 
          u.id, 
          u.email, 
          u.password, 
          u.name,
          r.nombre as rolNombre
        FROM [ticket-service].[dbo].[user] u
        JOIN [ticket-service].[dbo].[user_roles] ur ON u.id = ur.userId
        JOIN [ticket-service].[dbo].[rolUser] r ON ur.rolUserId = r.id
        WHERE u.email = ${email} AND u.isActive = 1
      `;

      if (!resultados || resultados.length === 0) {
        return null;
      }

      const usuario = resultados[0];
      const roles = [...new Set(resultados.map(r => r.rolNombre))];

      // Validar que tenga rol PROFESOR o ADMIN
      const esProfesorOAdmin = roles.some(rol => 
        rol === 'Profesor' || rol === 'Admin'
      );

      if (!esProfesorOAdmin) {
        return null;
      }

      // Validar contraseña (bcrypt o texto plano)
      let esValido = false;
      try {
        esValido = await bcrypt.compare(password, usuario.password);
      } catch {
        esValido = (password === usuario.password);
      }

      if (!esValido) {
        return null;
      }

      // Generar token
      const payload = { 
        email: usuario.email, 
        sub: usuario.id,
        roles: roles,
        nombre: usuario.name,
        tipo: 'Profesor' // Identificador del tipo de usuario
      };

      return {
        access_token: this.jwtService.sign(payload),
        usuario: {
          id: usuario.id,
          nombre: usuario.name,
          email: usuario.email,
          roles: roles,
          tipo: 'profesor'
        }
      };
    } catch (error) {
      console.error("Error consultando BD ticket-service:", error);
      return null;
    }
  }

  /**
   * LOGIN PARA APODERADOS (desde BD bd_after)
   * Login directo con Email y RUT del Apoderado
   */
  async loginApoderado(email: string, passwordRut: string) {
    try {
      // 1. Buscar apoderado por email
      const apoderado = await this.prisma.apoderado.findUnique({
        where: { email: email },
        include: {
          alumnos: {
            include: {
              inscripciones: {
                include: {
                  taller: {
                    include: { sede: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!apoderado) {
        return null;
      }

      // 2. Validar contraseña (RUT del apoderado)
      const esValido = await bcrypt.compare(passwordRut, apoderado.password);

      if (!esValido) {
        return null;
      }

      // 3. Generar token
      const payload = { 
        email: apoderado.email, 
        sub: apoderado.id,
        roles: ['APODERADO'],
        nombre: apoderado.nombre,
        tipo: 'APODERADO',
        pupilosIDs: apoderado.alumnos.map(a => a.id)
      };

      // Estructurar datos de los pupilos
      const pupilosData = apoderado.alumnos.map(alumno => ({
        id: alumno.id,
        nombre: `${alumno.nombres} ${alumno.apellidos}`,
        rut: alumno.rut,
        curso: alumno.curso,
        talleres: alumno.inscripciones.map(i => ({
          id: i.taller.id,
          nombre: i.taller.nombre,
          sede: i.taller.sede.nombre,
          horario: i.taller.horario
        }))
      }));

      return {
        access_token: this.jwtService.sign(payload),
        usuario: {
          id: apoderado.id,
          nombre: apoderado.nombre,
          email: apoderado.email,
          telefono: apoderado.telefono,
          rut: apoderado.rut,
          roles: ['APODERADO'],
          tipo: 'APODERADO',
          pupilos: pupilosData
        }
      };
    } catch (error) {
      console.error("Error consultando BD bd_after:", error);
      return null;
    }
  }

  /**
   * LOGIN UNIFICADO - Intenta ambos tipos de autenticación
   */
  async login(email: string, password: string) {
    // Primero intentar como profesor/admin
    let resultado = await this.loginProfesor(email, password);
    
    if (resultado) {
      return resultado;
    }

    // Si no es profesor, intentar como APODERADO
    resultado = await this.loginApoderado(email, password);
    
    if (resultado) {
      return resultado;
    }

    throw new UnauthorizedException('Credenciales inválidas');
  }
}