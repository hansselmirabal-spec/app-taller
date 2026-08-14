/**
 * El Simulador de presupuesto calcula un desglose por pieza (pieza, nivel de
 * daño, breakdown de procesos con horas), pero antes se descartaba al guardar
 * — budget_appointments solo persistía los 3 totales agregados por proceso.
 * `pieces` guarda ese detalle como dato informativo, sin reemplazar `processes`
 * (que sigue siendo la fuente de verdad para approve()).
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  UpdateBudgetProcessesDto,
  BudgetAppointmentsService,
} from '../modules/budget-appointments/budget-appointments.service';

describe('UpdateBudgetProcessesDto — pieces', () => {
  it('acepta un payload con detalle por pieza', async () => {
    const dto = plainToInstance(UpdateBudgetProcessesDto, {
      processes: [{ code: 'BODYWORK', name: 'Chapería', hours: 6.5 }],
      pieces: [{
        pieza: 'Puerta delantera izquierda',
        damageLevel: 'Medio',
        qty: 1,
        breakdown: [{ proceso: 'Reparar', horas: 6.5, descripcion: 'Reparar chapa' }],
        totalHoras: 6.5,
      }],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta un payload sin pieces (opcional)', async () => {
    const dto = plainToInstance(UpdateBudgetProcessesDto, {
      processes: [{ code: 'BODYWORK', name: 'Chapería', hours: 6.5 }],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('BudgetAppointmentsService.updateProcesses — pieces', () => {
  function makeService(entryOverrides: Record<string, any> = {}) {
    const appt = { id: 'appt-1', status: 'pending', processes: null, pieces: null, ...entryOverrides };
    const repo = {
      findOne: jest.fn().mockResolvedValue(appt),
      save:    jest.fn().mockImplementation((e: any) => Promise.resolve(e)),
    };
    const service = new BudgetAppointmentsService(repo as any, {} as any, {} as any);
    return { service, repo, appt };
  }

  it('persiste pieces cuando viene en el DTO', async () => {
    const { service } = makeService();
    const pieces = [{
      pieza: 'Puerta delantera izquierda', damageLevel: 'Medio', qty: 1,
      breakdown: [{ proceso: 'Reparar', horas: 6.5, descripcion: 'Reparar chapa' }],
      totalHoras: 6.5,
    }];
    const result = await service.updateProcesses('appt-1', {
      processes: [{ code: 'BODYWORK', name: 'Chapería', hours: 6.5 }],
      pieces,
    } as any);
    expect(result.pieces).toEqual(pieces);
  });

  it('NO borra pieces ya guardado cuando el DTO no manda pieces', async () => {
    const existingPieces = [{
      pieza: 'Guardabarros', damageLevel: 'Leve', qty: 1,
      breakdown: [{ proceso: 'Pintar', horas: 1.5, descripcion: 'Pintar' }],
      totalHoras: 1.5,
    }];
    const { service } = makeService({ pieces: existingPieces });
    const result = await service.updateProcesses('appt-1', {
      processes: [{ code: 'BODYWORK', name: 'Chapería', hours: 8 }],
    } as any);
    expect(result.pieces).toEqual(existingPieces);
  });
});
