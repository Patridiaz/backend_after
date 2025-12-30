import { IsNotEmpty, IsString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateTallerDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsInt()
  @Min(0)
  edadMinima: number;

  @IsInt()
  @Min(0)
  edadMaxima: number;

  @IsString()
  @IsNotEmpty()
  horario: string;

  @IsInt()
  @Min(1)
  cuposTotales: number;

  @IsInt()
  @IsNotEmpty()
  sedeId: number;
}
