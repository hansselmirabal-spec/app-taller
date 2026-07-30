/**
 * BudgetAppointmentsService.approve() — pieceCount para Pulida (POLISH) y
 * Control Final (FINAL_CONTROL). Regla (ver design, decisión 2):
 *   - pieceCount SIEMPRE se deriva de la suma de appt.pieces[].qty, NUNCA de
 *     appt.processes (que es la fuente de verdad del presupuesto/factura).
 *   - appt.processes queda intacto tras approve(), incluso si el perito
 *     agregó manualmente una línea "Pulido" — esa línea es solo informativa/
 *     facturable y NUNCA se mezcla con el cómputo operacional de Pulida.
 *   - extraProcesses (lo que se reenvía a BodyshopService.create()) excluye
 *     POLISH/FINAL_CONTROL además de los códigos legacy, para que una línea
 *     manual de Pulido en el presupuesto no termine duplicando/pisando la
 *     reserva operacional de horas.
 */

import { BudgetAppointmentsService } from '../modules/budget-appointments/budget-appointments.service';

const WS_ID = 'ws-001';
const USER_ID = 'user-001';
const APPT_ID = 'appt-001';

function makeAppt(overrides: Record<string, any> = {}) {
  return {
    id: APPT_ID,
    workshopId: WS_ID,
    date: '2026-06-10',
    timeStart: '08:00',
    timeEnd: '10:00',
    peritoId: 'perito-1',
    customerName: 'Test Cliente',
    plate: 'TST 001',
    status: 'pending',
    processes: [{ code: 'BODYWORK', name: 'Chapería', hours: 8 }],
    pieces: null,
    notes: null,
    budgetNumber: null,
    linkedEntryId: null,
    ...overrides,
  };
}

function makeRepo(appt: any) {
  return {
    findOne: jest.fn().mockResolvedValue(appt),
    save: jest.fn().mockImplementation((a: any) => Promise.resolve(a)),
    find: jest.fn().mockResolvedValue([]),
  };
}

function makeBodyshopService() {
  return {
    create: jest.fn().mockResolvedValue({ id: 'entry-001' }),
  };
}

describe('BudgetAppointmentsService.approve — pieceCount', () => {
  it('deriva pieceCount como la suma de appt.pieces[].qty (nunca desde processes)', async () => {
    const pieces = [
      { pieza: 'Puerta', damageLevel: 'Medio', qty: 3, breakdown: [], totalHoras: 1.5 },
      { pieza: 'Guardabarros', damageLevel: 'Leve', qty: 1, breakdown: [], totalHoras: 0.5 },
    ];
    const appt = makeAppt({ pieces });
    const repo = makeRepo(appt);
    const bodyshopService = makeBodyshopService();
    const service = new BudgetAppointmentsService(repo as any, bodyshopService as any);

    await service.approve(APPT_ID, USER_ID);

    expect(bodyshopService.create).toHaveBeenCalledWith(
      expect.objectContaining({ pieceCount: 4 }),
      USER_ID,
    );
  });

  it('sin pieces (presupuesto legacy sin desglose): pieceCount=0, no rompe la aprobación', async () => {
    const appt = makeAppt({ pieces: null });
    const repo = makeRepo(appt);
    const bodyshopService = makeBodyshopService();
    const service = new BudgetAppointmentsService(repo as any, bodyshopService as any);

    await service.approve(APPT_ID, USER_ID);

    expect(bodyshopService.create).toHaveBeenCalledWith(
      expect.objectContaining({ pieceCount: 0 }),
      USER_ID,
    );
  });

  it('una línea manual "Pulido" (code=POLISH) en processes NO se reenvía como extraProcesses', async () => {
    const appt = makeAppt({
      processes: [
        { code: 'BODYWORK', name: 'Chapería', hours: 8 },
        { code: 'POLISH', name: 'Pulido', hours: 3 }, // agregada manualmente por el perito
      ],
      pieces: [{ pieza: 'Puerta', damageLevel: 'Medio', qty: 2, breakdown: [], totalHoras: 1 }],
    });
    const repo = makeRepo(appt);
    const bodyshopService = makeBodyshopService();
    const service = new BudgetAppointmentsService(repo as any, bodyshopService as any);

    await service.approve(APPT_ID, USER_ID);

    const callArg = bodyshopService.create.mock.calls[0][0];
    expect((callArg.extraProcesses ?? []).some((p: any) => p.code === 'POLISH')).toBe(false);
    // pieceCount se deriva de pieces (2), no de la línea manual (3h)
    expect(callArg.pieceCount).toBe(2);
  });

  it('appt.processes permanece sin cambios después de approve(), incluida la línea manual de Pulido', async () => {
    const originalProcesses = [
      { code: 'BODYWORK', name: 'Chapería', hours: 8 },
      { code: 'POLISH', name: 'Pulido', hours: 3 },
    ];
    const appt = makeAppt({ processes: originalProcesses, pieces: [] });
    const repo = makeRepo(appt);
    const bodyshopService = makeBodyshopService();
    const service = new BudgetAppointmentsService(repo as any, bodyshopService as any);

    const { budget } = await service.approve(APPT_ID, USER_ID);

    expect(budget.processes).toEqual(originalProcesses);
  });
});

describe('BudgetAppointmentsService.findByPlate', () => {
  it('busca por workshopId + chapa normalizada (mayúsculas, sin espacios extra) y excluye linkedEntryId', async () => {
    const repo = makeRepo(null);
    const bodyshopService = makeBodyshopService();
    const service = new BudgetAppointmentsService(repo as any, bodyshopService as any);

    await service.findByPlate(WS_ID, '  tst 001  ');

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workshopId: WS_ID, plate: 'TST 001' }),
        order: { date: 'DESC' },
      }),
    );
    // linkedEntryId debe filtrarse con IsNull() (un FindOperator, no un valor literal)
    const whereArg = (repo.find as jest.Mock).mock.calls[0][0].where;
    expect(whereArg.linkedEntryId).toBeDefined();
  });

  it('devuelve la lista tal cual la resuelve el repo (ya excluye presupuestos vinculados)', async () => {
    const found = [makeAppt({ id: 'appt-002', linkedEntryId: null })];
    const repo = makeRepo(null);
    repo.find = jest.fn().mockResolvedValue(found);
    const bodyshopService = makeBodyshopService();
    const service = new BudgetAppointmentsService(repo as any, bodyshopService as any);

    const result = await service.findByPlate(WS_ID, 'TST 001');

    expect(result).toEqual(found);
  });
});
