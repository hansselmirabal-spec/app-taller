/**
 * Tests de BudgetSimulatorService.estimate() — foco en la paridad con el Excel
 * de referencia "Herramienta Presupuestador" (QA reportó que el simulador no
 * calculaba igual que el Excel). Confirmado contra las fórmulas reales del Excel:
 * la columna "Pintar" siempre busca categoría "Pintar reparación" salvo que el
 * daño sea "Sustitución" — no varía entre Leve/Medio/Grave. El código excluía
 * Pintar del caso Leve a propósito (bug), rompiendo esa paridad.
 */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BudgetSimulatorService } from '../modules/budget-simulator/budget-simulator.service';
import { BudgetSimulatorItem } from '../modules/budget-simulator/budget-simulator-item.entity';
import { BudgetConfig } from '../modules/budget-simulator/budget-config.entity';

const PIEZA = 'Puerta delantera Izquierda';

const CATALOG_ROWS = [
  { pieza: PIEZA, proceso: 'Reparar',     tipoDano: 'Leve',              horas: 1.0, active: true },
  { pieza: PIEZA, proceso: 'Reparar',     tipoDano: 'Medio',             horas: 2.0, active: true },
  { pieza: PIEZA, proceso: 'Reparar',     tipoDano: 'Grave',             horas: 3.0, active: true },
  { pieza: PIEZA, proceso: 'Preparacion', tipoDano: 'Leve',              horas: 0.5, active: true },
  { pieza: PIEZA, proceso: 'Preparacion', tipoDano: 'Medio',             horas: 1.0, active: true },
  { pieza: PIEZA, proceso: 'Preparacion', tipoDano: 'Grave',             horas: 1.5, active: true },
  { pieza: PIEZA, proceso: 'Pintar',      tipoDano: 'Pintar reparación', horas: 0.4, active: true },
  { pieza: PIEZA, proceso: 'Pulir',       tipoDano: 'General',           horas: 0.4, active: true },
  { pieza: PIEZA, proceso: 'Sustituir',   tipoDano: 'General',           horas: 4.0, active: true },
];

async function build() {
  const itemRepo = {
    find: jest.fn().mockResolvedValue(CATALOG_ROWS),
  };
  const configRepo = {
    findOne: jest.fn().mockResolvedValue({ tarifaMdo: 100000, moneda: 'Gs.', ivaIncluido: false }),
    save:    jest.fn(),
    create:  jest.fn(),
  };

  const mod = await Test.createTestingModule({
    providers: [
      BudgetSimulatorService,
      { provide: getRepositoryToken(BudgetSimulatorItem), useValue: itemRepo },
      { provide: getRepositoryToken(BudgetConfig),        useValue: configRepo },
    ],
  }).compile();

  return mod.get(BudgetSimulatorService);
}

describe('BudgetSimulatorService.estimate() — paridad Pintar vs. severidad', () => {
  it('daño Leve incluye horas de Pintura (igual que el Excel — no varía por severidad)', async () => {
    const service = await build();
    const result = await service.estimate({ items: [{ pieza: PIEZA, damageLevel: 'Leve', qty: 1 }] });

    // paintHours suma Pintar (0.4) + Pulir (0.4, siempre incluido en Leve) = 0.8
    expect(result.paintHours).toBe(0.8);
    const paintLine = result.lines[0].breakdown.find(b => b.proceso === 'Pintar');
    expect(paintLine?.horas).toBe(0.4);
  });

  it('daño Medio sigue incluyendo Pintura (sin regresión)', async () => {
    const service = await build();
    const result = await service.estimate({ items: [{ pieza: PIEZA, damageLevel: 'Medio', qty: 1 }] });
    expect(result.paintHours).toBe(0.4);
  });

  it('daño Grave sigue incluyendo Pintura (sin regresión)', async () => {
    const service = await build();
    const result = await service.estimate({ items: [{ pieza: PIEZA, damageLevel: 'Grave', qty: 1 }] });
    expect(result.paintHours).toBe(0.4);
  });

  it('Sustitucion no incluye Pintar reparación (usa el circuito de sustitución, no el de reparación)', async () => {
    const service = await build();
    const result = await service.estimate({ items: [{ pieza: PIEZA, damageLevel: 'Sustitucion', qty: 1 }] });
    expect(result.paintHours).toBe(0);
    expect(result.bodyworkHours).toBe(4.0); // Sustituir
  });
});
