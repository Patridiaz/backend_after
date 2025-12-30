import { PartialType } from '@nestjs/mapped-types';
import { CreateTallereDto } from './create-tallere.dto';

export class UpdateTallereDto extends PartialType(CreateTallereDto) {}
