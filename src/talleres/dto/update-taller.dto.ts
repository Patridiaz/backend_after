import { PartialType } from '@nestjs/mapped-types';
import { CreateTallerDto } from './create-taller.dto';

export class UpdateTallerDto extends PartialType(CreateTallerDto) {}
