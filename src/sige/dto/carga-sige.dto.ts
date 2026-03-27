import { IsArray, IsInt, IsNotEmpty } from 'class-validator';

export class CargaSigeDto {
  @IsInt()
  @IsNotEmpty()
  sedeId: number;

  @IsArray()
  @IsNotEmpty()
  alumnos: any[];
}
