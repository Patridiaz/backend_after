import { Module } from '@nestjs/common';
import { ApoderadoController } from './apoderado.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ApoderadoController]
})
export class ApoderadoModule {}
