export type WorkshopType = 'MECHANIC' | 'BODYSHOP';

export interface WorkshopMock {
  id: string;
  name: string;
  type: WorkshopType;
  technicians: number;
  hoursPerDay: number;
  presenceRate: number;
  productivityRate: number;
  lostHoursRate: number;
  bufferRate: number;
  avgJobHours?: number;         // solo MECHANIC
  processMix?: ProcessMix;      // solo BODYSHOP
}

export interface ProcessMix {
  bodywork: number;
  prep: number;
  paint: number;
}

export const WORKSHOPS: WorkshopMock[] = [
  {
    id: 'ws-mechanic-01',
    name: 'Taller Mecánica Central',
    type: 'MECHANIC',
    technicians: 8,
    hoursPerDay: 8,
    presenceRate: 0.92,
    productivityRate: 0.85,
    lostHoursRate: 0.05,
    bufferRate: 0.10,
    avgJobHours: 3.5,
  },
  {
    id: 'ws-bodyshop-01',
    name: 'Carrocería Norte',
    type: 'BODYSHOP',
    technicians: 6,
    hoursPerDay: 8,
    presenceRate: 0.90,
    productivityRate: 0.82,
    lostHoursRate: 0.06,
    bufferRate: 0.12,
    processMix: {
      bodywork: 0.45,
      prep: 0.30,
      paint: 0.25,
    },
  },
];
