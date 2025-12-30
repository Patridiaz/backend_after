import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string; // Usaremos el email para loguear

  @IsString()
  @MinLength(4)
  password: string;
}