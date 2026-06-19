import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../modules/auth/auth.service';
import { UsersService } from '../modules/users/users.service';
import { MailService } from '../modules/mail/mail.service';
import * as bcrypt from 'bcryptjs';

const mockUser = {
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@taller.com',
  role: 'admin',
  active: true,
  passwordHash: 'hashed_password',
  roleId: null,
  customRole: null,
  allowedWorkshopIds: ['ws-1'],
};

const mockPermissions = {
  dashboard: { view: true, edit: true },
  capacity: { view: true, edit: true },
  appointments: { view: true, edit: true },
  kanban: { view: true, edit: true },
  reports: { view: true, edit: true },
  settings: { view: true, edit: true },
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let mailService: jest.Mocked<MailService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            resolvePermissions: jest.fn(),
            update: jest.fn(),
            clearMustChangePassword: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.jwt.token'),
            decode: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_SECRET')   return 'test-secret';
              if (key === 'FRONTEND_URL') return 'http://localhost:3003';
              return undefined;
            }),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendPasswordReset: jest.fn().mockResolvedValue(undefined),
            sendWelcome: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    mailService = module.get(MailService);
    configService = module.get(ConfigService);
  });

  describe('login()', () => {
    it('retorna access_token y user con credenciales validas', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      usersService.resolvePermissions.mockReturnValue(mockPermissions as any);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.login('admin@taller.com', 'password123');

      expect(result.data.access_token).toBe('mock.jwt.token');
      expect(result.data.user.email).toBe('admin@taller.com');
      expect(result.data.user.role).toBe('admin');
      expect(result.meta.timestamp).toBeDefined();
    });

    it('incluye permissions y allowedWorkshopIds en la respuesta', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      usersService.resolvePermissions.mockReturnValue(mockPermissions as any);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.login('admin@taller.com', 'password123');

      expect(result.data.user.permissions).toEqual(mockPermissions);
      expect(result.data.user.allowedWorkshopIds).toEqual(['ws-1']);
    });

    it('lanza UnauthorizedException con password incorrecta', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login('admin@taller.com', 'wrong_pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException con email desconocido', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login('noexiste@taller.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si el usuario esta inactivo', async () => {
      usersService.findByEmail.mockResolvedValue({ ...mockUser, active: false } as any);

      await expect(service.login('admin@taller.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('el JWT payload incluye sub, email, role y permissions', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      usersService.resolvePermissions.mockReturnValue(mockPermissions as any);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      await service.login('admin@taller.com', 'password123');

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'admin@taller.com',
        role: 'admin',
        permissions: mockPermissions,
      });
    });
  });

  describe('forgotPassword()', () => {
    // El processForgotPasswordAsync es fire-and-forget. Para verificar que se hizo el trabajo,
    // hay que esperar al menos un microtask después de la llamada.
    const flush = () => new Promise<void>(r => setImmediate(r));

    it('responde mensaje genérico inmediatamente sin esperar al envío de mail', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      const result = await service.forgotPassword('admin@taller.com');

      // La respuesta llega antes de que termine el async
      expect(result.data.message).toContain('Si el email existe');
    });

    it('si el usuario existe y está activo: dispara sign + sendMail (async)', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      await service.forgotPassword('admin@taller.com');
      await flush();

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', type: 'pwd_reset', hash: expect.any(String) }),
        expect.objectContaining({ expiresIn: '1h' }),
      );
      expect(mailService.sendPasswordReset).toHaveBeenCalledWith(
        'Admin User',
        'admin@taller.com',
        expect.stringContaining('http://localhost:3003/reset-password?token='),
      );
    });

    it('si el email NO existe: NO se firma token ni se envía mail (anti-enumeración)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('nadie@x.com');
      await flush();

      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
      expect(result.data.message).toContain('Si el email existe');
    });

    it('si el usuario está inactivo: NO se envía mail', async () => {
      usersService.findByEmail.mockResolvedValue({ ...mockUser, active: false } as any);

      await service.forgotPassword('admin@taller.com');
      await flush();

      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('no falla la respuesta si el SMTP explota (el trabajo es fire-and-forget)', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      mailService.sendPasswordReset.mockRejectedValue(new Error('SMTP down'));

      await expect(service.forgotPassword('admin@taller.com')).resolves.toBeDefined();
      await flush(); // dejar que el catch corra sin tirar UnhandledPromiseRejection
    });
  });

  describe('resetPassword()', () => {
    // mockUser.passwordHash = 'hashed_password' (15 chars) → slice(-10) = 'd_password'
    const validHash = 'd_password';
    const validPayload = { sub: 'user-1', type: 'pwd_reset', hash: validHash };

    it('actualiza la pass cuando el token es válido y el hash coincide', async () => {
      jwtService.verify.mockReturnValue(validPayload as any);
      usersService.findById.mockResolvedValue(mockUser as any);

      const result = await service.resetPassword('valid.token.here', 'NuevaPass123');

      expect(jwtService.verify).toHaveBeenCalledWith('valid.token.here');
      expect(usersService.update).toHaveBeenCalledWith('user-1', { password: 'NuevaPass123' });
      expect(usersService.clearMustChangePassword).toHaveBeenCalledWith('user-1');
      expect(result.data.message).toContain('restablecida');
    });

    it('rechaza token cuando la firma es inválida (verify lanza)', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('invalid signature'); });

      await expect(service.resetPassword('bad.token', 'X')).rejects.toThrow(BadRequestException);
      // CRÍTICO: NO debe consultar la DB si la firma es inválida (anti-DoS).
      expect(usersService.findById).not.toHaveBeenCalled();
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('rechaza token con type incorrecto', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'login', hash: validHash } as any);

      await expect(service.resetPassword('bad.token', 'X')).rejects.toThrow(BadRequestException);
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('rechaza token sin sub', async () => {
      jwtService.verify.mockReturnValue({ type: 'pwd_reset', hash: validHash } as any);

      await expect(service.resetPassword('bad.token', 'X')).rejects.toThrow(BadRequestException);
    });

    it('rechaza token sin hash snapshot', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', type: 'pwd_reset' } as any);

      await expect(service.resetPassword('bad.token', 'X')).rejects.toThrow(BadRequestException);
    });

    it('rechaza cuando el usuario no existe', async () => {
      jwtService.verify.mockReturnValue(validPayload as any);
      usersService.findById.mockResolvedValue(null);

      await expect(service.resetPassword('valid.token', 'X')).rejects.toThrow(BadRequestException);
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('rechaza cuando el usuario está inactivo', async () => {
      jwtService.verify.mockReturnValue(validPayload as any);
      usersService.findById.mockResolvedValue({ ...mockUser, active: false } as any);

      await expect(service.resetPassword('valid.token', 'X')).rejects.toThrow(BadRequestException);
    });

    it('rechaza cuando la pass cambió desde la emisión del token (hashSnapshot mismatch)', async () => {
      jwtService.verify.mockReturnValue(validPayload as any);
      // Hash actual del user es distinto al snapshot del token (pass ya fue cambiada)
      usersService.findById.mockResolvedValue({ ...mockUser, passwordHash: 'nuevo_hash_distinto' } as any);

      await expect(service.resetPassword('reused.token', 'X'))
        .rejects.toThrow(/ya fue utilizado/i);
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });
});
