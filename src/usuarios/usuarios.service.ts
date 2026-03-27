import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene usuarios desde la base de datos externa 'ticket-service'
   * Muestra solo aquellos que NO han sido asignados localmente todavía (opcional)
   */
  async getUsuariosExternos(search?: string) {
    try {
      // 1. Obtener IDs locales ya asignados
      const asignados = await this.prisma.usuarioLocal.findMany({ select: { externalId: true } });
      const idsIgnorar = asignados.map(a => a.externalId).filter(id => id !== null);

      // 2. Consulta a ticket-service
      let query = `
        SELECT id, email, name 
        FROM [ticket-service].[dbo].[user]
        WHERE isActive = 1
      `;
      
      if (search) {
        query += ` AND (email LIKE '%${search}%' OR name LIKE '%${search}%')`;
      }
      
      // Filtramos en JS o en SQL. Por simplicidad de este prompt, traeremos los últimos 50.
      const rawUsers: any[] = await this.prisma.$queryRawUnsafe(`${query} ORDER BY id DESC`);
      
      return rawUsers.filter(u => !idsIgnorar.includes(u.id));
    } catch (e) {
      console.error('Error cargando usuarios de ticket-service:', e);
      return [];
    }
  }

  /**
   * Asigna un usuario de ticket-service a un Rol Local en este sistema
   */
  async asignarUsuario(dto: { externalId: number, rol: string, sedeId?: number }) {
    // 1. Obtener datos básicos de ticket-service
    const result: any[] = await this.prisma.$queryRaw`
      SELECT email, name FROM [ticket-service].[dbo].[user] WHERE id = ${dto.externalId}
    `;

    if (!result || result.length === 0) {
      throw new BadRequestException('El usuario no existe en la base corporativa (ticket-service).');
    }

    const { email, name } = result[0];

    // 2. Crear localmente
    return this.prisma.usuarioLocal.upsert({
      where: { email: email.toLowerCase() },
      update: {
        externalId: dto.externalId,
        nombre: name,
        rol: dto.rol,
        sedeId: dto.sedeId || null,
        isActive: true
      },
      create: {
        email: email.toLowerCase(),
        externalId: dto.externalId,
        nombre: name,
        rol: dto.rol,
        sedeId: dto.sedeId || null
      }
    });
  }

  /**
   * Lista usuarios locales del sistema de talleres
   */
  async getUsuariosLocales() {
    return this.prisma.usuarioLocal.findMany({
      include: { sede: true },
      orderBy: { nombre: 'asc' }
    });
  }

  /**
   * Actualiza el rol o sede de un usuario local
   */
  async actualizarUsuario(id: number, data: { rol?: string, sedeId?: number, isActive?: boolean }) {
    return this.prisma.usuarioLocal.update({
      where: { id },
      data
    });
  }

  /**
   * Elimina (o desactiva) un usuario local
   */
  async eliminarUsuario(id: number) {
    return this.prisma.usuarioLocal.update({
      where: { id },
      data: { isActive: false }
    });
  }
}
