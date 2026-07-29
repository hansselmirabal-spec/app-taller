/**
 * bodyshop-hours.util — regla única de horas para POLISH (Pulida) y
 * FINAL_CONTROL (Control Final): 0.5h por pieza para Pulida, 0.5h fijo
 * para Control Final. Ver design: "Single shared pure helper" — único
 * punto de cómputo, sin duplicar la regla en bodyshop.service.ts.
 */

import { computePolishHours, computeFinalControlHours } from '../modules/bodyshop/bodyshop-hours.util';

describe('computePolishHours', () => {
  it.each([
    [0, 0],
    [1, 0.5],
    [4, 2.0],
  ])('computePolishHours(%i) → %f', (pieceCount, expected) => {
    expect(computePolishHours(pieceCount)).toBe(expected);
  });

  it('nunca retorna un valor negativo para pieceCount negativo', () => {
    expect(computePolishHours(-3)).toBe(0);
  });
});

describe('computeFinalControlHours', () => {
  it('siempre retorna 0.5h fijo, sin importar el pieceCount', () => {
    expect(computeFinalControlHours()).toBe(0.5);
  });
});
