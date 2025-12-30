import { IsNotEmpty, IsInt } from 'class-validator';

export class AssignProfesorDto {
  @IsInt()
  @IsNotEmpty()
  usuarioId: number; // ID del profesor en ticket-service

  @IsInt()
  @IsNotEmpty()
  tallerId: number;
}
