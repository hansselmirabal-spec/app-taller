import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkTypesService } from '../modules/work-types/work-types.service';
import { WorkType } from '../modules/work-types/work-type.entity';

const WS_ID = 'ws-001';
const WT_ID = 'wt-001';

const MOCK_WT: Partial<WorkType> = {
  id: WT_ID, workshopId: WS_ID, name: 'Choque leve',
  severity: 'LIGHT', estimatedDays: 2,
  bodyworkHours: 8, prepHours: 4, paintHours: 6,
  color: '#22c55e', active: true,
};

function makeRepo(overrides: any = {}) {
  return {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create:  jest.fn().mockImplementation((d: any) => d),
    save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ id: WT_ID, ...d })),
    ...overrides,
  };
}

describe('WorkTypesService', () => {
  let service: WorkTypesService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const mod = await Test.createTestingModule({
      providers: [
        WorkTypesService,
        { provide: getRepositoryToken(WorkType), useValue: repo },
      ],
    }).compile();
    service = mod.get(WorkTypesService);
  });

  describe('findAll', () => {
    it('filtra por workshopId y activos', async () => {
      await service.findAll(WS_ID);
      expect(repo.find).toHaveBeenCalledWith({
        where: { active: true, workshopId: WS_ID },
        order: { name: 'ASC' },
      });
    });

    it('sin workshopId solo filtra activos', async () => {
      await service.findAll();
      expect(repo.find).toHaveBeenCalledWith({
        where: { active: true },
        order: { name: 'ASC' },
      });
    });
  });

  describe('create', () => {
    it('crea un work type', async () => {
      const dto = {
        workshopId: WS_ID, name: 'Choque leve', severity: 'LIGHT',
        estimatedDays: 2, bodyworkHours: 8, prepHours: 4, paintHours: 6, color: '#22c55e',
      };
      const result = await service.create(dto);
      expect(repo.create).toHaveBeenCalled();
      expect(result.id).toBe(WT_ID);
    });

    it('lanza ConflictException si duplicado en mismo taller', async () => {
      repo.findOne.mockResolvedValue(MOCK_WT);
      await expect(service.create({
        workshopId: WS_ID, name: 'Choque leve', severity: 'LIGHT',
        estimatedDays: 2, bodyworkHours: 8, prepHours: 4, paintHours: 6, color: '#22c55e',
      })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('actualiza campos permitidos', async () => {
      repo.findOne.mockResolvedValue({ ...MOCK_WT });
      repo.save.mockImplementation((d: any) => Promise.resolve(d));
      const result = await service.update(WT_ID, { name: 'Choque fuerte', estimatedDays: 5 });
      expect(result.name).toBe('Choque fuerte');
      expect(result.estimatedDays).toBe(5);
    });

    it('lanza NotFoundException si no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update('bad', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete (soft)', () => {
    it('pone active=false', async () => {
      const wt = { ...MOCK_WT, active: true };
      repo.findOne.mockResolvedValue(wt);
      repo.save.mockImplementation((d: any) => Promise.resolve(d));
      await service.delete(WT_ID);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    });

    it('lanza NotFoundException si no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.delete('bad')).rejects.toThrow(NotFoundException);
    });
  });
});
