import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { UsersService } from '../modules/users/users.service';

function makeContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => function StubClass() { /* stub */ },
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: jest.Mocked<Reflector>;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    usersService = {
      findById: jest.fn(),
      resolvePermissions: jest.fn(),
    } as any;
    guard = new PermissionsGuard(reflector, usersService);
  });

  it('pasa cuando el endpoint NO declara @RequirePermission', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined as any);

    const ctx = makeContext({ id: 'u1', role: 'receptionist' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('lanza UnauthorizedException cuando no hay user en el request', async () => {
    reflector.getAllAndOverride.mockReturnValue({ module: 'capacity', action: 'edit' });

    const ctx = makeContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('admin pasa siempre, sin consultar la DB', async () => {
    reflector.getAllAndOverride.mockReturnValue({ module: 'settings', action: 'edit' });

    const ctx = makeContext({ id: 'u1', role: 'admin' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
    expect(usersService.resolvePermissions).not.toHaveBeenCalled();
  });

  it('permite usando los permisos del JWT (sin tocar DB)', async () => {
    reflector.getAllAndOverride.mockReturnValue({ module: 'capacity', action: 'edit' });

    const ctx = makeContext({
      id: 'u1', role: 'receptionist',
      permissions: { capacity: { view: true, edit: true } },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // No debería tocar DB cuando los permisos vienen en el JWT
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('rechaza con 403 cuando los permisos del JWT no permiten la acción', async () => {
    reflector.getAllAndOverride.mockReturnValue({ module: 'capacity', action: 'edit' });

    const ctx = makeContext({
      id: 'u1', role: 'receptionist',
      permissions: { capacity: { view: true, edit: false } },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('FALLBACK: si el JWT no trae permissions (token viejo), va a DB', async () => {
    reflector.getAllAndOverride.mockReturnValue({ module: 'capacity', action: 'edit' });
    usersService.findById.mockResolvedValue({ id: 'u1', role: 'receptionist' } as any);
    usersService.resolvePermissions.mockReturnValue({
      capacity: { view: true, edit: true },
    } as any);

    // user sin permissions (JWT viejo)
    const ctx = makeContext({ id: 'u1', role: 'receptionist' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(usersService.findById).toHaveBeenCalledWith('u1');
  });

  it('FALLBACK: rechaza con 403 si el user del DB no existe', async () => {
    reflector.getAllAndOverride.mockReturnValue({ module: 'capacity', action: 'edit' });
    usersService.findById.mockResolvedValue(null);

    const ctx = makeContext({ id: 'u404', role: 'receptionist' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rechaza con 403 cuando el módulo solicitado no existe en los permisos', async () => {
    reflector.getAllAndOverride.mockReturnValue({ module: 'reports', action: 'edit' });

    const ctx = makeContext({
      id: 'u1', role: 'receptionist',
      permissions: { capacity: { view: true, edit: true } /* reports no presente */ },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('distingue acciones: tiene "view" pero no "edit"', async () => {
    reflector.getAllAndOverride.mockReturnValue({ module: 'capacity', action: 'edit' });

    const ctx = makeContext({
      id: 'u1', role: 'receptionist',
      permissions: { capacity: { view: true, edit: false } },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
