import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateSedeDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  direccion?: string;
}
