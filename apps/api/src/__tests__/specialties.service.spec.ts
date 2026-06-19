import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SpecialtiesService } from '../modules/specialties/specialties.service';
import { Specialty } from '../modules/specialties/specialty.entity';

const WS_ID = 'ws-001';
const SP_ID = 'sp-001';

function makeRepo(overrides: any = {}) {
  return {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create:  jest.fn().mockImplementation((d: any) => d),
    save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ id: SP_ID, ...d })),
    remove:  jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('SpecialtiesService', () => {
  let service: SpecialtiesService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const mod = await Test.createTestingModule({
      providers: [
        SpecialtiesService,
        { provide: getRepositoryToken(Specialty), useValue: repo },
      ],
    }).compile();
    service = mod.get(SpecialtiesService);
  });

  describe('findAll', () => {
    it('sin filtro devuelve todo', async () => {
      repo.find.mockResolvedValue([{ id: SP_ID, name: 'CHAPERIA', workshopId: WS_ID }]);
      const result = await service.findAll();
      expect(repo.find).toHaveBeenCalledWith({ where: {}, order: { name: 'ASC' } });
      expect(result).toHaveLength(1);
    });

    it('con workshopId filtra correctamente', async () => {
      await service.findAll(WS_ID);
      expect(repo.find).toHaveBeenCalledWith({ where: { workshopId: WS_ID }, order: { name: 'ASC' } });
    });
  });

  describe('create', () => {
    it('crea especialidad nueva', async () => {
      const result = await service.create({ name: 'CHAPERIA', workshopId: WS_ID });
      expect(repo.create).toHaveBeenCalledWith({ name: 'CHAPERIA', workshopId: WS_ID });
      expect(repo.save).toHaveBeenCalled();
      expect(result.id).toBe(SP_ID);
    });

    it('lanza ConflictException si ya existe', async () => {
      repo.findOne.mockResolvedValue({ id: SP_ID, name: 'CHAPERIA', workshopId: WS_ID });
      await expect(service.create({ name: 'CHAPERIA', workshopId: WS_ID }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('actualiza nombre', async () => {
      const existing = { id: SP_ID, name: 'OLD', workshopId: WS_ID };
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue({ ...existing, name: 'NEW' });
      const result = await service.update(SP_ID, { name: 'NEW' });
      expect(result.name).toBe('NEW');
    });

    it('lanza NotFoundException si no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update('bad-id', { name: 'X' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('elimina la especialidad', async () => {
      const existing = { id: SP_ID, name: 'CHAPERIA', workshopId: WS_ID };
      repo.findOne.mockResolvedValue(existing);
      await service.delete(SP_ID);
      expect(repo.remove).toHaveBeenCalledWith(existing);
    });

    it('lanza NotFoundException si no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.delete('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
