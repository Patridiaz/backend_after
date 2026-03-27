import { Module } from '@nestjs/common';
import { SigeController } from './sige.controller';
import { SigeService } from './sige.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [SigeController],
  providers: [SigeService, PrismaService],
})
export class SigeModule {}
