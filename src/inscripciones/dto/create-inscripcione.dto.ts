import { IsEmail, IsInt, IsNotEmpty, IsString, IsDateString } from 'class-validator';

export class CreateInscripcioneDto {
  @IsString() @IsNotEmpty() rut: string;
  @IsString() @IsNotEmpty() nombres: string;
  @IsString() @IsNotEmpty() apellidos: string;
  @IsDateString() fechaNacimiento: string;
  
  @IsString() @IsNotEmpty() nombreApoderado: string;
  @IsString() @IsNotEmpty() rutApoderado: string; // Nuevo campo obligatorio
  @IsString() @IsNotEmpty() telefonoApoderado: string;
  @IsEmail() emailApoderado: string;

  @IsInt() @IsNotEmpty() tallerId: number;
}