import { IsNotEmpty, IsString, IsInt, IsOptional, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class HorarioTallerDto {
  @IsString()
  @IsNotEmpty()
  diaSemana: string;

  @IsInt()
  @Min(0)
  horaInicio: number;

  @IsInt()
  @Min(0)
  minutoInicio: number;

  @IsInt()
  @Min(0)
  horaFin: number;

  @IsInt()
  @Min(0)
  minutoFin: number;
}

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorarioTallerDto)
  horarios: HorarioTallerDto[];
  @IsInt()
  @Min(1)
  cuposTotales: number;

  @IsInt()
  @IsNotEmpty()
  sedeId: number;
}
