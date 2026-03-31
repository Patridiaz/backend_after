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
   * LOGIN UNIFICADO (PROFESORES, ENCARGADOS, COORDINADORES, ADMINS)
   * Valida contra ticket-service pero otorga roles LOCALES
   */
  async login(email: string, password: string) {
    // 1. Intentar validar identidad contra ticket-service
    const identity = await this.validateExternalIdentity(email, password);
    
    if (identity) {
      // 2. Buscar si este usuario tiene un perfil local específico para Talleres
      let localUser = await this.prisma.usuarioLocal.findFirst({
        where: { 
          OR: [
            { externalId: identity.id },
            { email: email.toLowerCase() }
          ],
          isActive: true
        },
        include: { sede: true }
      });

      // AUTO-PROVISIONAMIENTO PARA ADMINS CORPORATIVOS
      // Si eres Admin en ticket-service pero no estás en la base local, te creamos automáticamente
      if (!localUser && identity.rolesExternos.includes('ADMIN')) {
        localUser = await this.prisma.usuarioLocal.create({
          data: {
            email: identity.email.toLowerCase(),
            externalId: identity.id,
            nombre: identity.name,
            rol: 'ADMIN',
            isActive: true
          },
          include: { sede: true }
        });
      }

      if (!localUser) {
        // En este sistema, solo entran los que han sido asignados explícitamente por el Admin
        throw new UnauthorizedException('No tienes permisos asignados en este sistema de talleres. Contacta al Administrador.');
      }

      // 3. Vincular externalId si no lo tenía (Auto-healing)
      if (localUser.externalId !== identity.id) {
        localUser = await this.prisma.usuarioLocal.update({
          where: { id: localUser.id },
          data: { externalId: identity.id },
          include: { sede: true }
        });
      }

      // 4. Generar token con ROL LOCAL
      const payload = { 
        email: localUser.email, 
        sub: localUser.id,
        roles: [localUser.rol],
        nombre: localUser.nombre,
        sedeId: localUser.sedeId,
        nombreSede: localUser.sede?.nombre || null,
        tipo: 'USUARIO_INTERNO' 
      };

      return {
        access_token: this.jwtService.sign(payload),
        usuario: {
          id: localUser.id,
          nombre: localUser.nombre,
          email: localUser.email,
          rol: localUser.rol,
          sedeId: localUser.sedeId,
          nombreSede: localUser.sede?.nombre || null,
          tipo: 'USUARIO_INTERNO'
        }
      };
    }

    // 5. Si no es usuario interno, intentar como APODERADO (Local en bd_after)
    const apoderadoResult = await this.loginApoderado(email, password);
    if (apoderadoResult) return apoderadoResult;

    throw new UnauthorizedException('Credenciales inválidas');
  }

  /**
   * Valida que el usuario exista en ticket-service y la contraseña coincida
   */
  /**
   * Valida que el usuario exista en ticket-service y la contraseña coincida
   * Además devuelve los roles que tiene en esa base de datos
   */
  private async validateExternalIdentity(email: string, password: string) {
    try {
      // Obtenemos el usuario y sus roles en ticket-service
      const resultados: any[] = await this.prisma.$queryRaw`
        SELECT 
          u.id, u.email, u.password, u.name,
          COALESCE(r.nombre, 'SIN_ROL') as rolExterno
        FROM [ticket-service].[dbo].[user] u
        LEFT JOIN [ticket-service].[dbo].[user_roles] ur ON u.id = ur.userId
        LEFT JOIN [ticket-service].[dbo].[rolUser] r ON ur.rolUserId = r.id
        WHERE u.email = ${email} AND u.isActive = 1
      `;

      if (!resultados || resultados.length === 0) return null;

      const user = resultados[0];
      const rolesExternos = [...new Set(resultados.map(r => (r.rolExterno || '').toUpperCase()))];

      // Validar contraseña
      let esValido = false;
      try {
        esValido = await bcrypt.compare(password, user.password);
      } catch {
        esValido = (password === user.password);
      }

      if (!esValido) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        rolesExternos: rolesExternos
      };
    } catch (e) {
      console.error("Error validando identidad externa:", e);
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
        where: { email: email.toLowerCase() },
        include: {
          alumnos: {
            include: {
              inscripciones: {
                include: {
                  taller: {
                    include: { sede: true, horarios: true }
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

      // 2. Validar contraseña (RUT del apoderado normalizado: sin puntos ni guion)
      const pwdNormalizado = passwordRut.trim().toUpperCase().replace(/[^0-9K]/g, '');
      const esValido = await bcrypt.compare(pwdNormalizado, apoderado.password);

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
          horario: i.taller.horarios?.map(h => `${h.diaSemana} ${h.horaInicio.toString().padStart(2, '0')}:${h.minutoInicio.toString().padStart(2, '0')}${h.horaFin !== null ? ` a ${h.horaFin.toString().padStart(2, '0')}:${(h.minutoFin || 0).toString().padStart(2, '0')}` : ''}`).join(' | ') || ''
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

}