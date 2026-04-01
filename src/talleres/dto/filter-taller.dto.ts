import { IsDateString, IsOptional, IsString, IsNumberString } from 'class-validator';

export class FilterTallerDto {
  @IsNumberString()
  @IsOptional()
  sedeId?: string;

  @IsDateString()
  @IsOptional()
  fechaNacimiento?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsNumberString()
  @IsOptional()
  minAge?: string;

  @IsNumberString()
  @IsOptional()
  maxAge?: string;

  @IsString()
  @IsOptional()
  includeFull?: string;
}