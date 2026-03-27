import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    // El servicio maneja automáticamente si es profesor, administrativo o apoderado
    return this.authService.login(loginDto.email, loginDto.password);
  }
}