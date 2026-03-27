import { IsNotEmpty, IsInt, IsOptional } from 'class-validator';

export class AssignProfesorDto {
  @IsInt()
  @IsNotEmpty()
  usuarioId: number; // ID del UsuarioLocal (Independiente de si es externo o local)

  @IsInt()
  @IsNotEmpty()
  tallerId: number;
}
