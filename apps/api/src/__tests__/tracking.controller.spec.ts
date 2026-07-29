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
            unblockProcess: jest.fn(),
            getResumeOptions: jest.fn(),
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

  // ── unblockProcess() (PR2 — kanban-mecanica-manual-y-pausa-libera-tecnico) ──

  describe('unblockProcess()', () => {
    it('llama service.unblockProcess con logId + technicianId/technicianName del body', async () => {
      const resumedLog = { id: 'log-001', status: 'in_progress', technicianId: 'tech-001', technicianName: 'Luis Benitez' };
      (service.unblockProcess as jest.Mock).mockResolvedValue(resumedLog);

      const result = await controller.unblockProcess('log-001', { technicianId: 'tech-001', technicianName: 'Luis Benitez' });

      expect(service.unblockProcess).toHaveBeenCalledWith('log-001', 'tech-001', 'Luis Benitez');
      expect(result).toEqual({
        data: resumedLog,
        meta: expect.objectContaining({ timestamp: expect.any(String) }),
      });
    });

    it('acepta body vacío (technicianId/technicianName opcionales — compat hacia atrás)', async () => {
      (service.unblockProcess as jest.Mock).mockResolvedValue({ id: 'log-001', status: 'pending' });

      await controller.unblockProcess('log-001', {});

      expect(service.unblockProcess).toHaveBeenCalledWith('log-001', undefined, undefined);
    });
  });

  // ── getResumeOptions() (PR2) ─────────────────────────────────────────────

  describe('getResumeOptions()', () => {
    it('llama service.getResumeOptions con logId y envuelve el resultado', async () => {
      const options = {
        previousTechnicianId: 'tech-001', previousTechnicianName: 'Luis Benitez',
        previousTechnicianFree: true, conflictProcessName: null,
      };
      (service.getResumeOptions as jest.Mock).mockResolvedValue(options);

      const result = await controller.getResumeOptions('log-001');

      expect(service.getResumeOptions).toHaveBeenCalledWith('log-001');
      expect(result).toEqual({
        data: options,
        meta: expect.objectContaining({ timestamp: expect.any(String) }),
      });
    });
  });

  // ── UnblockProcessDto validation (PR2) ────────────────────────────────────

  describe('UnblockProcessDto validation', () => {
    it('acepta body vacío (ambos campos opcionales)', async () => {
      const { UnblockProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(UnblockProcessDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('acepta technicianId + technicianName válidos', async () => {
      const { UnblockProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(UnblockProcessDto, { technicianId: 'tech-001', technicianName: 'Luis Benitez' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rechaza technicianId no-string', async () => {
      const { UnblockProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(UnblockProcessDto, { technicianId: 123 });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'technicianId')).toBe(true);
    });
  });
});
