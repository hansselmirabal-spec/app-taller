import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RolesService, CreateRoleDto, UpdateRoleDto } from '../modules/roles/roles.service';
import { Role } from '../modules/roles/role.entity';

const validPermissions = {
  dashboard:    { view: true, edit: false },
  capacity:     { view: true, edit: false },
  appointments: { view: true, edit: true  },
  kanban:       { view: true, edit: false },
  reports:      { view: false, edit: false },
  settings:     { view: false, edit: false },
};

const mockRole: Partial<Role> = {
  id: 'role-1',
  name: 'Recepcionista',
  permissions: validPermissions as any,
  active: true,
};

describe('RolesService', () => {
  let service: RolesService;
  let repo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; create: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(Role), useValue: repo },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  describe('create()', () => {
    it('crea un rol con permissions validas', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({ ...mockRole });
      repo.save.mockResolvedValue({ ...mockRole });

      const dto: CreateRoleDto = { name: 'Recepcionista', permissions: validPermissions as any };
      const result = await service.create(dto);

      expect(result.name).toBe('Recepcionista');
      expect(repo.save).toHaveBeenCalled();
    });

    it('lanza BadRequestException con module key invalido', async () => {
      const invalidPerms = {
        ...validPermissions,
        modulo_falso: { view: true, edit: false },
      };
      const dto: CreateRoleDto = { name: 'RolMalo', permissions: invalidPerms as any };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException cuando view no es boolean', async () => {
      const invalidPerms = {
        ...validPermissions,
        dashboard: { view: 'yes', edit: false },
      };
      const dto: CreateRoleDto = { name: 'RolMalo', permissions: invalidPerms as any };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException cuando edit no es boolean', async () => {
      const invalidPerms = {
        ...validPermissions,
        capacity: { view: true, edit: 1 },
      };
      const dto: CreateRoleDto = { name: 'RolMalo', permissions: invalidPerms as any };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException para nombre duplicado', async () => {
      repo.findOne.mockResolvedValue(mockRole);

      const dto: CreateRoleDto = { name: 'Recepcionista', permissions: validPermissions as any };
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update()', () => {
    it('actualiza permissions validas en un rol existente', async () => {
      repo.findOne.mockResolvedValue({ ...mockRole });
      repo.save.mockResolvedValue({ ...mockRole, name: 'Nuevo Nombre' });

      const dto: UpdateRoleDto = { name: 'Nuevo Nombre' };
      const result = await service.update('role-1', dto);

      expect(result.name).toBe('Nuevo Nombre');
    });

    it('lanza BadRequestException al actualizar permissions con module invalido', async () => {
      repo.findOne.mockResolvedValue({ ...mockRole });

      const dto: UpdateRoleDto = {
        permissions: { modulo_invalido: { view: true, edit: false } } as any,
      };

      await expect(service.update('role-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el rol no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
