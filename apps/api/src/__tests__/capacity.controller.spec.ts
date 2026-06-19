import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CapacityController } from '../modules/capacity/capacity.controller';
import { CapacityService } from '../modules/capacity/capacity.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

describe('CapacityController', () => {
  let controller: CapacityController;
  let capacityService: jest.Mocked<CapacityService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CapacityController],
      providers: [
        {
          provide: CapacityService,
          useValue: {
            getDailyCapacity: jest.fn().mockResolvedValue([]),
            getWeekCapacity: jest.fn().mockResolvedValue({} as Record<string, any[]>),
            createAbsence: jest.fn(),
            deleteAbsence: jest.fn(),
            upsertWorkingDay: jest.fn(),
            deleteWorkingDay: jest.fn(),
          },
        },
        {
          provide: WorkshopsService,
          useValue: { findOne: jest.fn().mockResolvedValue({ name: 'Test Workshop' }) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CapacityController>(CapacityController);
    capacityService = module.get(CapacityService);
  });

  describe('getCapacity()', () => {
    it('retorna array vacio sin parametros', async () => {
      const result = await controller.getCapacity(undefined, undefined, undefined);
      expect(result).toEqual({ data: [], meta: expect.objectContaining({ timestamp: expect.any(String) }) });
    });

    it('lanza BadRequestException cuando el rango supera 31 dias', async () => {
      await expect(
        controller.getCapacity(undefined, '2025-01-01', '2025-02-15'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException para formato de fecha invalido en from', async () => {
      await expect(
        controller.getCapacity(undefined, '15-01-2025', '2025-01-20'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException para formato de fecha invalido en date', async () => {
      await expect(
        controller.getCapacity('2025/01/15', undefined, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException para formato de fecha invalido en to', async () => {
      await expect(
        controller.getCapacity(undefined, '2025-01-01', '20-01-2025'),
      ).rejects.toThrow(BadRequestException);
    });

    it('llama getDailyCapacity con date valida', async () => {
      capacityService.getDailyCapacity.mockResolvedValue([]);
      await controller.getCapacity('2025-07-15', undefined, undefined);
      expect(capacityService.getDailyCapacity).toHaveBeenCalledWith('2025-07-15', undefined, undefined);
    });

    it('llama getWeekCapacity con rango valido de hasta 31 dias', async () => {
      capacityService.getWeekCapacity.mockResolvedValue({} as Record<string, any[]>);
      await controller.getCapacity(undefined, '2025-07-01', '2025-07-31');
      expect(capacityService.getWeekCapacity).toHaveBeenCalledWith('2025-07-01', '2025-07-31', undefined, undefined);
    });
  });
});
