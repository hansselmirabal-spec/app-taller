import { round1, sumBodyshopHours } from '@/lib/utils';

// Sumar 17.5 + 17.2 + 7.7 en JS da 42.400000000000006 por precisión de punto
// flotante — se vio tal cual en la UI (reportado en QA, captura de pantalla)
// antes de redondear al mostrarlo.
describe('round1', () => {
  it('corrige el ruido de precisión de punto flotante', () => {
    expect(round1(17.5 + 17.2 + 7.7)).toBe(42.4);
  });

  it('no altera valores ya limpios', () => {
    expect(round1(8)).toBe(8);
    expect(round1(0.4)).toBe(0.4);
  });
});

describe('sumBodyshopHours', () => {
  it('suma y redondea las horas de los 3 procesos', () => {
    const entry = { bodyworkHours: 17.5, prepHours: 17.2, paintHours: 7.7 };
    expect(sumBodyshopHours(entry)).toBe(42.4);
  });
});
