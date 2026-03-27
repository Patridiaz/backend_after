import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { TalleresModule } from './talleres/talleres.module';
import { InscripcionesModule } from './inscripciones/inscripciones.module';
import { AsistenciaModule } from './asistencia/asistencia.module';
import { AuthModule } from './auth/auth.module';
import { ApoderadoModule } from './apoderado/apoderado.module';
import { SigeModule } from './sige/sige.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    TalleresModule, 
    InscripcionesModule, 
    AsistenciaModule, 
    AuthModule, 
    ApoderadoModule,
    SigeModule,
    UsuariosModule
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
