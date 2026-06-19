import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  // Snapshot del hash que se incluye en el JWT de reset.
  // Si el user cambia la pass, el snapshot deja de coincidir y el token queda inválido.
  // No exponemos el hash completo: 10 chars finales son suficientes para detectar cambio
  // y bcrypt incluye salt+cost por adelante (no se puede reconstruir el hash).
  private hashSnapshot(passwordHash: string): string {
    return passwordHash.slice(-10);
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.active) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const permissions = this.usersService.resolvePermissions(user);
    // permissions van en el JWT para que el PermissionsGuard no tenga que tocar
    // DB en cada request. Las sesiones quedan invalidadas naturalmente al rotar
    // JWT_SECRET o al expirar el token (8h).
    const payload = { sub: user.id, email: user.email, role: user.role, permissions };

    return {
      data: {
        access_token: this.jwtService.sign(payload),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          mustChangePassword: user.mustChangePassword,
          roleId: user.roleId ?? null,
          customRole: user.customRole ?? null,
          allowedWorkshopIds: user.allowedWorkshopIds ?? null,
          permissions,
        },
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const userById = await this.usersService.findById(userId);
    if (!userById) throw new UnauthorizedException('Usuario no encontrado');

    const user = await this.usersService.findByEmail(userById.email);
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('La contraseña actual es incorrecta');

    if (currentPassword === newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la actual');
    }

    await this.usersService.update(user.id, { password: newPassword });
    await this.usersService.clearMustChangePassword(user.id);
    return { data: { message: 'Contraseña actualizada correctamente' } };
  }

  async forgotPassword(email: string) {
    // Procesamiento async: la respuesta sale igual de rápido exista o no el usuario,
    // cerrando el timing-leak que permitiría enumerar emails.
    void this.processForgotPasswordAsync(email);
    return {
      data: {
        message: 'Si el email existe en el sistema, vas a recibir un enlace para restablecer tu contraseña.',
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  private async processForgotPasswordAsync(email: string): Promise<void> {
    try {
      const user = await this.usersService.findByEmail(email);
      if (!user || !user.active) {
        this.logger.warn(`Password reset requested for unknown/inactive email`);
        return;
      }
      const token = this.jwtService.sign(
        { sub: user.id, type: 'pwd_reset', hash: this.hashSnapshot(user.passwordHash) },
        { expiresIn: '1h' },
      );
      const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3003';
      const link = `${frontend.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
      await this.mail.sendPasswordReset(user.name, user.email, link);
    } catch (err: any) {
      this.logger.error(`Failed to process password reset: ${err.message}`);
    }
  }

  async resetPassword(token: string, newPassword: string) {
    // 1. Verificar firma ANTES de tocar la DB. Cierra DoS por enumeración.
    let payload: { sub: string; type: string; hash: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException('El enlace expiró o ya fue utilizado.');
    }

    if (!payload || payload.type !== 'pwd_reset' || !payload.sub || !payload.hash) {
      throw new BadRequestException('El enlace no es válido.');
    }

    // 2. Cargar el user y validar que la pass no haya cambiado desde la emisión del token.
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.active) {
      throw new BadRequestException('El enlace no es válido o ya fue utilizado.');
    }

    if (this.hashSnapshot(user.passwordHash) !== payload.hash) {
      throw new BadRequestException('El enlace ya fue utilizado.');
    }

    // 3. Actualizar.
    await this.usersService.update(user.id, { password: newPassword });
    await this.usersService.clearMustChangePassword(user.id);

    return {
      data: { message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.' },
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
