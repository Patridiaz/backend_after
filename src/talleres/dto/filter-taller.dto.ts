import { IsDateString, IsNotEmpty, IsNumberString } from 'class-validator';

export class FilterTallerDto {
  @IsNumberString()
  @IsNotEmpty()
  sedeId: string;

  @IsDateString() // Valida que envíen fecha formato YYYY-MM-DD
  @IsNotEmpty()
  fechaNacimiento: string;
}