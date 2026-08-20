import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { WorkshopsService } from '../modules/workshops/workshops.service';
import { Workshop } from '../modules/workshops/workshop.entity';
import type { UserAccessContext } from '../modules/users/users.service';

const WS_A = { id: 'ws-a', name: 'Taller A', active: true };
const WS_B = { id: 'ws-b', name: 'Taller B', active: true };

function makeRepo(overrides: any = {}) {
  return {
    find: jest.fn().mockResolvedValue([WS_A, WS_B]),
    findOne: jest.fn().mockResolvedValue(WS_A),
    create: jest.fn().mockImplementation((d: any) => d),
    save: jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserAccessContext> = {}): UserAccessContext {
  return {
    id: 'user-1',
    role: 'receptionist',
    allowedWorkshopIds: null,
    active: true,
    ...overrides,
  };
}

describe('WorkshopsService', () => {
  let service: WorkshopsService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const mod = await Test.createTestingModule({
      providers: [
        WorkshopsService,
        { provide: getRepositoryToken(Workshop), useValue: repo },
      ],
    }).compile();
    service = mod.get(WorkshopsService);
  });

  describe('findAll', () => {
    it('admin ve todos los talleres', async () => {
      await service.findAll(makeUser({ role: 'admin', allowedWorkshopIds: ['ws-a'] }));
      expect(repo.find).toHaveBeenCalledWith({ where: { active: true }, order: { name: 'ASC' } });
    });

    it('admin_taller ve todos los talleres', async () => {
      await service.findAll(makeUser({ role: 'admin_taller', allowedWorkshopIds: ['ws-a'] }));
      expect(repo.find).toHaveBeenCalledWith({ where: { active: true }, order: { name: 'ASC' } });
    });

    it('usuario sin restricción (allowedWorkshopIds null) ve todos los talleres', async () => {
      await service.findAll(makeUser({ allowedWorkshopIds: null }));
      expect(repo.find).toHaveBeenCalledWith({ where: { active: true }, order: { name: 'ASC' } });
    });

    it('usuario sin restricción (allowedWorkshopIds []) ve todos los talleres', async () => {
      await service.findAll(makeUser({ allowedWorkshopIds: [] }));
      expect(repo.find).toHaveBeenCalledWith({ where: { active: true }, order: { name: 'ASC' } });
    });

    it('usuario restringido solo ve los talleres de su lista', async () => {
      repo.find.mockResolvedValue([WS_A]);
      const result = await service.findAll(makeUser({ allowedWorkshopIds: ['ws-a'] }));
      expect(repo.find).toHaveBeenCalledWith({
        where: { active: true, id: In(['ws-a']) },
        order: { name: 'ASC' },
      });
      expect(result).toEqual([WS_A]);
    });
  });

  describe('findOne', () => {
    it('lanza ForbiddenException si el taller pedido no está en la lista permitida', async () => {
      await expect(
        service.findOne('ws-b', makeUser({ allowedWorkshopIds: ['ws-a'] })),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('admin puede pedir cualquier taller', async () => {
      repo.findOne.mockResolvedValue(WS_B);
      const result = await service.findOne('ws-b', makeUser({ role: 'admin', allowedWorkshopIds: ['ws-a'] }));
      expect(result).toEqual(WS_B);
    });

    it('admin_taller puede pedir cualquier taller', async () => {
      repo.findOne.mockResolvedValue(WS_B);
      const result = await service.findOne('ws-b', makeUser({ role: 'admin_taller', allowedWorkshopIds: ['ws-a'] }));
      expect(result).toEqual(WS_B);
    });

    it('usuario sin restricción puede pedir cualquier taller', async () => {
      repo.findOne.mockResolvedValue(WS_B);
      const result = await service.findOne('ws-b', makeUser({ allowedWorkshopIds: null }));
      expect(result).toEqual(WS_B);
    });

    it('usuario restringido puede pedir un taller de su lista', async () => {
      repo.findOne.mockResolvedValue(WS_A);
      const result = await service.findOne('ws-a', makeUser({ allowedWorkshopIds: ['ws-a'] }));
      expect(result).toEqual(WS_A);
    });

    it('lanza NotFoundException si el taller permitido no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.findOne('ws-a', makeUser({ allowedWorkshopIds: ['ws-a'] })),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
