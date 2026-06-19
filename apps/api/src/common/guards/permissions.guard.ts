import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../../modules/users/users.service';
import { ModuleKey, PERMISSION_KEY, PermissionAction } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<{ module: ModuleKey; action: PermissionAction }>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new UnauthorizedException('No autenticado');
    if (user.role === 'admin') return true;

    // Los permisos viajan en el JWT (poblados en login). Evita ir a DB en cada request.
    // Fallback: si el token es viejo y no tiene permissions, consultamos DB una vez.
    const permissions = user.permissions ?? await this.loadPermissions(user.id);
    const allowed = permissions?.[required.module]?.[required.action] === true;
    if (!allowed) throw new ForbiddenException('No tenés permisos para realizar esta acción');
    return true;
  }

  private async loadPermissions(userId: string) {
    const fullUser = await this.usersService.findById(userId);
    if (!fullUser) throw new ForbiddenException('Usuario no encontrado');
    return this.usersService.resolvePermissions(fullUser);
  }
}
