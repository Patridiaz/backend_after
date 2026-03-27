import { IsEmail, IsInt, IsNotEmpty, IsString, IsDateString, IsOptional } from 'class-validator';

export class CreateInscripcioneDto {
  @IsString() @IsNotEmpty() rut: string;
  @IsString() @IsNotEmpty() nombres: string;
  @IsString() @IsNotEmpty() apellidos: string;
  @IsDateString() fechaNacimiento: string;
  @IsString() @IsOptional() establecimientoNombre?: string; 
  @IsString() @IsOptional() telefono?: string;

  @IsString() @IsNotEmpty() nombreApoderado: string;
  @IsString() @IsNotEmpty() rutApoderado: string; 
  @IsString() @IsNotEmpty() telefonoApoderado: string;
  @IsEmail() emailApoderado: string;

  @IsInt() @IsNotEmpty() tallerId: number;
}