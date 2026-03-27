import { IsArray, IsInt, IsNotEmpty, IsString, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EstadoAsistencia } from './tomar-asistencia.dto';

class CambioAsistencia {
  @IsInt()
  alumnoId: number;

  @IsString()
  fecha: string; // ISO string

  @IsEnum(EstadoAsistencia)
  estado: string;
}

export class TomarAsistenciaMensualDto {
  @IsInt()
  @IsNotEmpty()
  tallerId: number;

  @IsInt()
  @IsNotEmpty()
  profesorId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CambioAsistencia)
  cambios: CambioAsistencia[];
}
