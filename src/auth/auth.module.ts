import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtStrategy } from './jwt.strategy'; // <--- 1. IMPORTAR

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }), // <--- 2. DEFINIR DEFAULT
    JwtModule.register({
      secret: 'DKJJDAJDAJWDJKAJDKAJKDJAWWD', // Debe coincidir con la estrategia
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy], // <--- 3. AGREGAR A PROVIDERS
  exports: [JwtStrategy, PassportModule], // <--- 4. EXPORTAR
})
export class AuthModule {}