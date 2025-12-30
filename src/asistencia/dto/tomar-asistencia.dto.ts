import { IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum EstadoAsistencia {
  PRESENTE = 'P',
  AUSENTE = 'A',
  JUSTIFICADO = 'J',
  RETRASO = 'R',
}

class DetalleAsistencia {
  @IsInt() alumnoId: number;
  @IsEnum(EstadoAsistencia) estado: EstadoAsistencia;
}

export class TomarAsistenciaDto {
  @IsInt() tallerId: number;
  
  @IsDateString() fecha: string; // YYYY-MM-DD
  
  @IsInt() profesorId: number; // Esto luego lo sacaremos del Token automáticamente

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleAsistencia)
  lista: DetalleAsistencia[];
}