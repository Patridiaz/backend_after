import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'DKJJDAJDAJWDJKAJDKAJKDJAWWD',
    });
  }

  async validate(payload: any) {
    if (!payload) {
      throw new UnauthorizedException();
    }

    // Retornamos el usuario con toda la información del token
    return { 
      sub: payload.sub,       // ID numérico del usuario local
      userId: payload.sub,    // Alias para compatibilidad
      email: payload.email, 
      roles: payload.roles,
      nombre: payload.nombre,
      tipo: payload.tipo,
      rut: payload.rut,
      sedeId: payload.sedeId ? Number(payload.sedeId) : null,       // ← Sede del Encargado
      nombreSede: payload.nombreSede ?? null,
    };
  }
}