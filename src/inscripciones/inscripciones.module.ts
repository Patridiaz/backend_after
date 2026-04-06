import { Module } from '@nestjs/common';
import { InscripcionesController } from './inscripciones.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [InscripcionesController]
})
export class InscripcionesModule {}
