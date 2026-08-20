import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../modules/auth/jwt.strategy';
import { UsersService } from '../modules/users/users.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<UsersService>;

  const payload = {
    sub: 'u1',
    email: 'user@taller.com',
    role: 'receptionist',
    permissions: { capacity: { view: true, edit: false } },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: UsersService,
          useValue: { findAccessContext: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    usersService = module.get(UsersService);
  });

  it('lanza UnauthorizedException cuando el usuario ya no existe en la DB', async () => {
    usersService.findAccessContext.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException cuando el usuario está inactivo (active: false)', async () => {
    usersService.findAccessContext.mockResolvedValue({
      id: 'u1',
      role: 'receptionist',
      allowedWorkshopIds: null,
      active: false,
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('retorna el role de la DB, no el del payload del JWT', async () => {
    usersService.findAccessContext.mockResolvedValue({
      id: 'u1',
      role: 'admin_taller', // rol fue promovido desde el login
      allowedWorkshopIds: null,
      active: true,
    });

    const result = await strategy.validate(payload);

    expect(result.role).toBe('admin_taller');
    expect(result.permissions).toEqual(payload.permissions);
  });

  it('retorna allowedWorkshopIds de la DB y llama findAccessContext exactamente una vez', async () => {
    usersService.findAccessContext.mockResolvedValue({
      id: 'u1',
      role: 'receptionist',
      allowedWorkshopIds: ['ws-1', 'ws-2'],
      active: true,
    });

    const result = await strategy.validate(payload);

    expect(result.allowedWorkshopIds).toEqual(['ws-1', 'ws-2']);
    expect(usersService.findAccessContext).toHaveBeenCalledTimes(1);
    expect(usersService.findAccessContext).toHaveBeenCalledWith('u1');
  });

  it('propaga un fallo de DB distinto del fail-closed de usuario inexistente/inactivo', async () => {
    // Un timeout/error de conexión real NO debe convertirse en el mismo
    // UnauthorizedException que un usuario legítimamente inexistente/inactivo
    // — si no, un incidente de DB se vería igual que sesiones inválidas en
    // los logs, en vez de como un 500 diagnosticable.
    const dbError = new Error('connection timeout');
    usersService.findAccessContext.mockRejectedValue(dbError);

    await expect(strategy.validate(payload)).rejects.toBe(dbError);
  });
});
