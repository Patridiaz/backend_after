import { IsEmail, IsInt, IsNotEmpty, IsString, IsDateString, IsOptional, IsBoolean } from 'class-validator';

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
  @IsString() @IsNotEmpty() parentesco: string;
  @IsString() @IsOptional() parentescoOtro?: string;

  @IsInt() @IsNotEmpty() tallerId: number;

  // Ficha Médica y Consentimiento
  @IsOptional() @IsBoolean() enfermedadCronica?: boolean;
  @IsOptional() @IsString() enfermedadCronicaDetalle?: string;
  @IsOptional() @IsString() tratamientoMedico?: string;
  @IsOptional() @IsString() alergias?: string;
  @IsOptional() @IsBoolean() necesidadesEspeciales?: boolean;
  @IsOptional() @IsString() necesidadesEspecialesDetalle?: string;
  @IsOptional() @IsString() apoyoEscolar?: string;
  @IsOptional() @IsBoolean() usoImagen?: boolean;
}