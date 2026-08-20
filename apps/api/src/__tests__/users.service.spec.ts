import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService, CreateUserDto, UpdateUserDto } from '../modules/users/users.service';
import { User } from '../modules/users/user.entity';
import { Role } from '../modules/roles/role.entity';
import { MailService } from '../modules/mail/mail.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let roleRepo: { findOne: jest.Mock };
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    roleRepo = { findOne: jest.fn() };
    mailService = { sendWelcome: jest.fn().mockResolvedValue(undefined) } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findAccessContext()', () => {
    it('consulta el repo seleccionando solo id, role, allowedWorkshopIds, active', async () => {
      repo.findOne.mockResolvedValue({
        id: 'u1',
        role: 'receptionist',
        allowedWorkshopIds: ['ws-1'],
        active: true,
      });

      const result = await service.findAccessContext('u1');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: ['id', 'role', 'allowedWorkshopIds', 'active'],
      });
      expect(result).toEqual({
        id: 'u1',
        role: 'receptionist',
        allowedWorkshopIds: ['ws-1'],
        active: true,
      });
    });

    it('retorna null cuando el usuario no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findAccessContext('u-inexistente');

      expect(result).toBeNull();
    });
  });

  describe('create() — normalización allowedWorkshopIds', () => {
    beforeEach(() => {
      // findByEmail() -> null (no existe todavía)
      repo.findOne.mockImplementation(({ where }: any) => {
        if (where?.email) return Promise.resolve(null);
        // segunda llamada: findOne post-save (relations: customRole)
        return Promise.resolve({
          id: 'new-id',
          name: 'Nuevo',
          email: 'nuevo@taller.com',
          role: 'receptionist',
          allowedWorkshopIds: null,
          customRole: null,
        });
      });
      repo.create.mockImplementation((data: any) => data);
      repo.save.mockImplementation((data: any) => Promise.resolve({ ...data, id: 'new-id' }));
    });

    it('persiste null cuando allowedWorkshopIds llega como array vacío', async () => {
      const dto: CreateUserDto = {
        name: 'Nuevo',
        email: 'nuevo@taller.com',
        role: 'receptionist',
        allowedWorkshopIds: [],
      };

      await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ allowedWorkshopIds: null }),
      );
    });

    it('persiste la lista tal cual cuando allowedWorkshopIds tiene elementos', async () => {
      const dto: CreateUserDto = {
        name: 'Nuevo',
        email: 'nuevo@taller.com',
        role: 'receptionist',
        allowedWorkshopIds: ['ws-1', 'ws-2'],
      };

      await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ allowedWorkshopIds: ['ws-1', 'ws-2'] }),
      );
    });

    it('persiste null cuando allowedWorkshopIds no viene en el dto', async () => {
      const dto: CreateUserDto = {
        name: 'Nuevo',
        email: 'nuevo@taller.com',
        role: 'receptionist',
      };

      await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ allowedWorkshopIds: null }),
      );
    });
  });

  describe('update() — normalización allowedWorkshopIds', () => {
    const existingUser = {
      id: 'u1',
      name: 'Existente',
      role: 'receptionist',
      allowedWorkshopIds: ['ws-1'],
      customRole: null,
    };

    beforeEach(() => {
      repo.findOne.mockResolvedValue({ ...existingUser });
      repo.save.mockImplementation((data: any) => Promise.resolve({ ...data }));
    });

    it('setea null cuando allowedWorkshopIds llega como array vacío', async () => {
      const dto: UpdateUserDto = { allowedWorkshopIds: [] };

      await service.update('u1', dto);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ allowedWorkshopIds: null }),
      );
    });

    it('setea la lista tal cual cuando allowedWorkshopIds tiene elementos', async () => {
      const dto: UpdateUserDto = { allowedWorkshopIds: ['ws-2'] };

      await service.update('u1', dto);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ allowedWorkshopIds: ['ws-2'] }),
      );
    });

    it('no toca allowedWorkshopIds cuando la key no viene en el dto', async () => {
      const dto: UpdateUserDto = { name: 'Otro nombre' };

      await service.update('u1', dto);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ allowedWorkshopIds: ['ws-1'] }),
      );
    });
  });
});
