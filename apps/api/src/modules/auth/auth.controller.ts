import { Controller, Post, Get, Body, UseGuards, Res, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Configuración de la cookie de sesión.
// httpOnly:  bloquea acceso desde JS → mitiga XSS robando el token.
// secure:    solo HTTPS en production (cookie no viaja por http).
// sameSite:  'lax' acepta navegación top-level pero bloquea POST cross-origin (CSRF basic mitigation).
// maxAge:    8h, alineado con la expiración del JWT.
const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = (isProd: boolean) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 8 * 60 * 60 * 1000, // 8h
});

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsString() @MinLength(10) token: string;
  @IsString() @MinLength(8) newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { ttl: 300000, limit: process.env.NODE_ENV === 'production' ? 5 : 60 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto.email, dto.password);
    // Setea cookie httpOnly. El access_token sigue en el body como back-compat
    // para clientes legacy/scripts (curl), pero el frontend nuevo no lo lee del body.
    res.cookie(COOKIE_NAME, result.data.access_token, COOKIE_OPTIONS(process.env.NODE_ENV === 'production'));
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { data: { message: 'Sesión cerrada' } };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return { data: { id: user.id, email: user.email, role: user.role } };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: any) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  // 1 req/hora por IP. Más estricto que login porque el response es genérico
  // (no podemos distinguir email válido por respuesta) — pero un atacante con
  // muchas IPs igual podría enumerar lentamente. Bajar el límite hace que
  // enumerar 1000 emails con 10 proxies tome 100h en lugar de 9h.
  // El UX real (usuario humano) tolera 1/h sin problema: si pediste un reset
  // y no llegó, mejor revisás spam que pedir 5 más.
  @Throttle({ default: { ttl: 3_600_000, limit: 1 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }
}
