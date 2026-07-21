/**
 * BudgetProcessDto.hours — el catálogo real (Excel "Herramienta Presupuestador")
 * tiene procesos con horas legítimas por debajo de 0.5 (Empapelado 0.3h, Pulir
 * 0.4h). Un @Min(0.5) rechazaba esos valores reales al aprobar un presupuesto
 * ("Las horas mínimas por proceso son 0.5" — bug reportado en QA).
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BudgetProcessDto } from '../modules/budget-appointments/budget-appointments.service';

describe('BudgetProcessDto', () => {
  it('acepta valores reales del catálogo por debajo de 0.5h', async () => {
    const dto = plainToInstance(BudgetProcessDto, { code: 'EMPAPELADO', name: 'Empapelado', hours: 0.3 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta 0.4h (Pulir)', async () => {
    const dto = plainToInstance(BudgetProcessDto, { code: 'PULIR', name: 'Pulir', hours: 0.4 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza 0 o negativo', async () => {
    const dto = plainToInstance(BudgetProcessDto, { code: 'X', name: 'X', hours: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
