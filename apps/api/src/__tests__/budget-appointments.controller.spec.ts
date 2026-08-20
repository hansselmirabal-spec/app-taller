/**
 * PR1 de "presupuesto-abrir-simulador-desde-cita": GET /budget-appointments
 * gana from/to (mirror de appointments.controller.ts:26-45). El branch por
 * `date` existente NO cambia de comportamiento — solo se agrega un branch
 * nuevo. `find()` reemplaza al antiguo `findByDate()` como nombre del
 * handler (ver design.md, sección "Interfaces / Contracts").
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BudgetAppointmentsController } from '../modules/budget-appointments/budget-appointments.controller';
import { BudgetAppointmentsService } from '../modules/budget-appointments/budget-appointments.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';

describe('BudgetAppointmentsController.find()', () => {
  let controller: BudgetAppointmentsController;
  let service: jest.Mocked<BudgetAppointmentsService>;

  const perito = { id: 'perito-1', role: 'perito' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BudgetAppointmentsController],
      providers: [
        {
          provide: BudgetAppointmentsService,
          useValue: {
            findByDate:  jest.fn().mockResolvedValue([]),
            findByRange: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BudgetAppointmentsController>(BudgetAppointmentsController);
    service = module.get(BudgetAppointmentsService);
  });

  it('con workshopId+from+to válidos, llama service.findByRange con user.id/role y devuelve 200 envuelto', async () => {
    const result = await controller.find('ws-001', undefined, '2026-08-17', '2026-08-21', perito);

    expect(service.findByRange).toHaveBeenCalledWith('ws-001', '2026-08-17', '2026-08-21', 'perito-1', 'perito');
    expect(result).toEqual({ data: [], meta: expect.objectContaining({ timestamp: expect.any(String) }) });
  });

  it('rechaza from con formato inválido (400)', async () => {
    await expect(
      controller.find('ws-001', undefined, '17-08-2026', '2026-08-21', perito),
    ).rejects.toThrow(BadRequestException);
    expect(service.findByRange).not.toHaveBeenCalled();
  });

  it('rechaza to con formato inválido (400)', async () => {
    await expect(
      controller.find('ws-001', undefined, '2026-08-17', '21-08-2026', perito),
    ).rejects.toThrow(BadRequestException);
    expect(service.findByRange).not.toHaveBeenCalled();
  });

  // Regresión: el branch por `date` (preexistente) sigue funcionando igual,
  // sin ser tocado por el nuevo branch from/to.
  it('con date (sin from/to), sigue llamando a service.findByDate como antes', async () => {
    const result = await controller.find('ws-001', '2026-08-17', undefined, undefined, perito);

    expect(service.findByDate).toHaveBeenCalledWith('ws-001', '2026-08-17', 'perito-1', 'perito');
    expect(service.findByRange).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], meta: expect.objectContaining({ timestamp: expect.any(String) }) });
  });
});
