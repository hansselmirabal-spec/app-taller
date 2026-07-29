import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TrackingController } from '../modules/tracking/tracking.controller';
import { TrackingService } from '../modules/tracking/tracking.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { WorkshopAccessGuard } from '../common/guards/workshop-access.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

const ENTRY_ID = 'entry-001';

describe('TrackingController', () => {
  let controller: TrackingController;
  let service: jest.Mocked<TrackingService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackingController],
      providers: [
        {
          provide: TrackingService,
          useValue: {
            addProcessToBodyshop: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkshopAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TrackingController>(TrackingController);
    service = module.get(TrackingService);
  });

  describe('addProcess()', () => {
    it('llama service.addProcessToBodyshop con entryId + body validado', async () => {
      const createdLog = {
        id: 'log-new-001', sourceType: 'bodyshop', sourceId: ENTRY_ID,
        processCode: 'MECHANIC', plannedHours: 2.5, status: 'pending',
      };
      (service.addProcessToBodyshop as jest.Mock).mockResolvedValue(createdLog);

      const result = await controller.addProcess(ENTRY_ID, { processCode: 'MECHANIC', hours: 2.5 });

      expect(service.addProcessToBodyshop).toHaveBeenCalledWith(ENTRY_ID, 'MECHANIC', 2.5);
      expect(result).toEqual({
        data: createdLog,
        meta: expect.objectContaining({ timestamp: expect.any(String) }),
      });
    });
  });

  describe('AddProcessDto validation', () => {
    it('rechaza processCode ausente', async () => {
      const { AddProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(AddProcessDto, { hours: 2 });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'processCode')).toBe(true);
    });

    it('rechaza hours <= 0', async () => {
      const { AddProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(AddProcessDto, { processCode: 'MECHANIC', hours: 0 });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'hours')).toBe(true);
    });

    it('acepta processCode + hours válidos', async () => {
      const { AddProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(AddProcessDto, { processCode: 'MECHANIC', hours: 2.5 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
