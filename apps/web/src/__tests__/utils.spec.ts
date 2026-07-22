import { round1, sumBodyshopHours, sumBodyshopHoursWithExtras } from '@/lib/utils';

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

// QA reportó una inconsistencia: el kanban mostraba "Duración plan: 32.9h"
// (incluye Pulido/Mecánica) pero el detalle del vehículo mostraba "32.2h" —
// solo Chapería+Prep+Pintura, ignorando entry.processes.
describe('sumBodyshopHoursWithExtras', () => {
  it('suma los procesos extra (Pulido, Mecánica) además de los 3 core', () => {
    const entry = {
      bodyworkHours: 17.5, prepHours: 17.2, paintHours: 7.7,
      processes: [
        { code: 'BODYWORK', name: 'Chapería',    hours: 17.5 },
        { code: 'PREP',     name: 'Preparación', hours: 17.2 },
        { code: 'PAINT',    name: 'Pintura',     hours: 7.7 },
        { code: 'POLISH',   name: 'Pulido',      hours: 0.3 },
        { code: 'MECHANIC', name: 'Mecánica',    hours: 0.4 },
      ],
    };
    expect(sumBodyshopHoursWithExtras(entry)).toBe(43.1);
  });

  it('sin procesos extra, da lo mismo que sumBodyshopHours', () => {
    const entry = { bodyworkHours: 8, prepHours: 4, paintHours: 6, processes: null };
    expect(sumBodyshopHoursWithExtras(entry)).toBe(18);
  });
});
