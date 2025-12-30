import { PartialType } from '@nestjs/mapped-types';
import { CreateInscripcioneDto } from './create-inscripcione.dto';

export class UpdateInscripcioneDto extends PartialType(CreateInscripcioneDto) {}
