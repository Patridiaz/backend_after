import { Module } from '@nestjs/common';
import { InscripcionesController } from './inscripciones.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InscripcionesController]
})
export class InscripcionesModule {}
