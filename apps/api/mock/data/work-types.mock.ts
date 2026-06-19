export type Severity = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'MULTIPLE';

export interface WorkTypeMock {
  id: string;
  name: string;
  severity: Severity;
  estimatedDays: number;
  bodyworkHours: number;
  prepHours: number;
  paintHours: number;
}

export const WORK_TYPES: WorkTypeMock[] = [
  {
    id: 'wt-01',
    name: 'Toque leve',
    severity: 'LIGHT',
    estimatedDays: 1,
    bodyworkHours: 1.5,
    prepHours: 2.0,
    paintHours: 1.0,
  },
  {
    id: 'wt-02',
    name: 'Daño mediano',
    severity: 'MEDIUM',
    estimatedDays: 2,
    bodyworkHours: 4.0,
    prepHours: 3.0,
    paintHours: 2.5,
  },
  {
    id: 'wt-03',
    name: 'Daño grave',
    severity: 'HEAVY',
    estimatedDays: 5,
    bodyworkHours: 10.0,
    prepHours: 6.0,
    paintHours: 5.0,
  },
  {
    id: 'wt-04',
    name: 'Piezas múltiples',
    severity: 'MULTIPLE',
    estimatedDays: 7,
    bodyworkHours: 16.0,
    prepHours: 10.0,
    paintHours: 8.0,
  },
  {
    id: 'wt-05',
    name: 'Paragolpes solo',
    severity: 'LIGHT',
    estimatedDays: 1,
    bodyworkHours: 1.0,
    prepHours: 1.5,
    paintHours: 1.5,
  },
  {
    id: 'wt-06',
    name: 'Puerta',
    severity: 'MEDIUM',
    estimatedDays: 2,
    bodyworkHours: 3.0,
    prepHours: 2.5,
    paintHours: 2.0,
  },
  {
    id: 'wt-07',
    name: 'Lateral completo',
    severity: 'HEAVY',
    estimatedDays: 4,
    bodyworkHours: 8.0,
    prepHours: 5.0,
    paintHours: 4.0,
  },
  {
    id: 'wt-08',
    name: 'Capot',
    severity: 'MEDIUM',
    estimatedDays: 2,
    bodyworkHours: 3.5,
    prepHours: 2.5,
    paintHours: 2.0,
  },
  {
    id: 'wt-09',
    name: 'Techo',
    severity: 'HEAVY',
    estimatedDays: 3,
    bodyworkHours: 6.0,
    prepHours: 4.0,
    paintHours: 3.5,
  },
  {
    id: 'wt-10',
    name: 'Paragolpes + Pintura',
    severity: 'MEDIUM',
    estimatedDays: 2,
    bodyworkHours: 2.0,
    prepHours: 2.0,
    paintHours: 2.5,
  },
  {
    id: 'wt-11',
    name: 'Pulido y detallado',
    severity: 'LIGHT',
    estimatedDays: 1,
    bodyworkHours: 0.5,
    prepHours: 1.0,
    paintHours: 2.0,
  },
  {
    id: 'wt-12',
    name: 'Siniestro total',
    severity: 'MULTIPLE',
    estimatedDays: 10,
    bodyworkHours: 24.0,
    prepHours: 16.0,
    paintHours: 12.0,
  },
];
