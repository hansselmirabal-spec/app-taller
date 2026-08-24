import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TrackingController } from '../modules/tracking/tracking.controller';
import { TrackingService } from '../modules/tracking/tracking.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { WorkshopAccessGuard } from '../common/guards/workshop-access.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';

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
            returnToProcess: jest.fn(),
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

  // ── returnProcess() (PR2 — kanban-devolver-proceso-anterior) ─────────────

  describe('returnProcess()', () => {
    it('llama service.returnToProcess con logId + reason/technicianId/technicianName del body', async () => {
      const returnedLog = { id: 'log-new-001', status: 'in_progress', processCode: 'BODYWORK' };
      (service.returnToProcess as jest.Mock).mockResolvedValue(returnedLog);

      const result = await controller.returnProcess('log-001', {
        reason: 'Faltó soldar un panel', technicianId: 'tech-001', technicianName: 'Luis Benitez',
      });

      expect(service.returnToProcess).toHaveBeenCalledWith('log-001', 'Faltó soldar un panel', 'tech-001', 'Luis Benitez');
      expect(result).toEqual({
        data: returnedLog,
        meta: expect.objectContaining({ timestamp: expect.any(String) }),
      });
    });
  });

  // ── ReturnProcessDto validation (PR2) ─────────────────────────────────────

  describe('ReturnProcessDto validation', () => {
    const VALID_TECH_ID = 'a4f1c2d0-1111-4a2b-9c3d-000000000001';

    it('rechaza reason vacío', async () => {
      const { ReturnProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(ReturnProcessDto, { reason: '', technicianId: VALID_TECH_ID });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'reason')).toBe(true);
    });

    it('rechaza reason de más de 120 caracteres', async () => {
      const { ReturnProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(ReturnProcessDto, { reason: 'x'.repeat(121), technicianId: VALID_TECH_ID });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'reason')).toBe(true);
    });

    it('rechaza technicianId ausente o no-UUID', async () => {
      const { ReturnProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(ReturnProcessDto, { reason: 'motivo válido', technicianId: 'no-es-uuid' });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'technicianId')).toBe(true);
    });

    it('acepta reason + technicianId válidos (technicianName opcional)', async () => {
      const { ReturnProcessDto } = await import('../modules/tracking/tracking.controller');
      const dto = plainToInstance(ReturnProcessDto, { reason: 'motivo válido', technicianId: VALID_TECH_ID });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ── returnProcess() — RolesGuard a nivel de método (PR2, D7) ──────────────

  describe('returnProcess() — RolesGuard enforcement', () => {
    function ctxWithRole(role: string, handler: (...args: any[]) => any) {
      return {
        getHandler: () => handler,
        getClass:   () => TrackingController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      } as any;
    }

    it('rechaza un rol sin admin/admin_taller (canActivate=false — Nest lo traduce a 403) y no llega a invocar al service', async () => {
      const guard = new RolesGuard(new Reflector());
      const ctx = ctxWithRole('receptionist', TrackingController.prototype.returnProcess);

      expect(guard.canActivate(ctx)).toBe(false);
      expect(service.returnToProcess).not.toHaveBeenCalled();
    });

    it('permite admin_taller (mismo par de roles que users.controller.ts:25)', async () => {
      const guard = new RolesGuard(new Reflector());
      const ctx = ctxWithRole('admin_taller', TrackingController.prototype.returnProcess);

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('guard method-level, no class-level: otras rutas del controller sin @Roles siguen sin restricción', async () => {
      const guard = new RolesGuard(new Reflector());
      const ctx = ctxWithRole('receptionist', TrackingController.prototype.addProcess);

      // Sin metadata @Roles en este handler, RolesGuard deja pasar (mismo
      // comportamiento default que roles.guard.ts: `if (!requiredRoles) return true`).
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
