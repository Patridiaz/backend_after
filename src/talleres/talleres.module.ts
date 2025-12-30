import { Module } from '@nestjs/common';
import { TalleresService } from './talleres.service';
import { TalleresController } from './talleres.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule,AuthModule],
  controllers: [TalleresController],
  providers: [TalleresService, PrismaService],
})
export class TalleresModule {}
