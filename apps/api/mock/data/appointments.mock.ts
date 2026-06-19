export type AppointmentStatus = 'CONFIRMED' | 'TENTATIVE' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type Channel = 'WALK_IN' | 'PHONE' | 'ONLINE' | 'INSURANCE';

export interface MechanicAppointment {
  id: string;
  workshopId: string;
  scheduledDate: string;
  technicianId: string;
  technicianHours: number;
  status: AppointmentStatus;
  customerName: string;
  plate: string;
}

export interface BodyshopAppointment {
  id: string;
  workshopId: string;
  scheduledDate: string;
  workTypeId: string;
  status: AppointmentStatus;
  bodyworkHours: number;
  prepHours: number;
  paintHours: number;
  totalHours: number;
  stayDays: number;
  channel: Channel;
  customerName: string;
}

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// ─── MECHANIC appointments (hoy) ─────────────────────────────────────────────

export const MECHANIC_APPOINTMENTS: MechanicAppointment[] = [
  {
    id: 'ma-001',
    workshopId: 'ws-mechanic-01',
    scheduledDate: dateStr(0),
    technicianId: 'tech-01',
    technicianHours: 3.5,
    status: 'CONFIRMED',
    customerName: 'Carlos Gomez',
    plate: 'ABC123',
  },
  {
    id: 'ma-002',
    workshopId: 'ws-mechanic-01',
    scheduledDate: dateStr(0),
    technicianId: 'tech-02',
    technicianHours: 2.0,
    status: 'CONFIRMED',
    customerName: 'Maria Lopez',
    plate: 'DEF456',
  },
  {
    id: 'ma-003',
    workshopId: 'ws-mechanic-01',
    scheduledDate: dateStr(0),
    technicianId: 'tech-03',
    technicianHours: 6.0,
    status: 'IN_PROGRESS',
    customerName: 'Roberto Silva',
    plate: 'GHI789',
  },
  {
    id: 'ma-004',
    workshopId: 'ws-mechanic-01',
    scheduledDate: dateStr(0),
    technicianId: 'tech-04',
    technicianHours: 4.0,
    status: 'CONFIRMED',
    customerName: 'Ana Fernandez',
    plate: 'JKL012',
  },
  {
    id: 'ma-005',
    workshopId: 'ws-mechanic-01',
    scheduledDate: dateStr(0),
    technicianId: 'tech-05',
    technicianHours: 2.5,
    status: 'TENTATIVE',
    customerName: 'Diego Herrera',
    plate: 'MNO345',
  },
];

// ─── BODYSHOP appointments ────────────────────────────────────────────────────

export const BODYSHOP_APPOINTMENTS: BodyshopAppointment[] = [
  // HOY — ocupación ~60%
  {
    id: 'ba-001',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(0),
    workTypeId: 'wt-06',   // Puerta
    status: 'IN_PROGRESS',
    bodyworkHours: 3.0,
    prepHours: 2.5,
    paintHours: 2.0,
    totalHours: 7.5,
    stayDays: 2,
    channel: 'INSURANCE',
    customerName: 'Laura Rios',
  },
  {
    id: 'ba-002',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(0),
    workTypeId: 'wt-01',   // Toque leve
    status: 'CONFIRMED',
    bodyworkHours: 1.5,
    prepHours: 2.0,
    paintHours: 1.0,
    totalHours: 4.5,
    stayDays: 1,
    channel: 'PHONE',
    customerName: 'Sergio Blanco',
  },
  {
    id: 'ba-003',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(0),
    workTypeId: 'wt-08',   // Capot
    status: 'CONFIRMED',
    bodyworkHours: 3.5,
    prepHours: 2.5,
    paintHours: 2.0,
    totalHours: 8.0,
    stayDays: 2,
    channel: 'ONLINE',
    customerName: 'Patricia Vega',
  },

  // MAÑANA — ocupación >90% → debe dar RISK o OVERLOADED
  {
    id: 'ba-004',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(1),
    workTypeId: 'wt-03',   // Daño grave
    status: 'CONFIRMED',
    bodyworkHours: 10.0,
    prepHours: 6.0,
    paintHours: 5.0,
    totalHours: 21.0,
    stayDays: 5,
    channel: 'INSURANCE',
    customerName: 'Hugo Mendez',
  },
  {
    id: 'ba-005',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(1),
    workTypeId: 'wt-07',   // Lateral completo
    status: 'CONFIRMED',
    bodyworkHours: 8.0,
    prepHours: 5.0,
    paintHours: 4.0,
    totalHours: 17.0,
    stayDays: 4,
    channel: 'WALK_IN',
    customerName: 'Claudia Torres',
  },

  // D+2 — livianos
  {
    id: 'ba-006',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(2),
    workTypeId: 'wt-05',   // Paragolpes solo
    status: 'CONFIRMED',
    bodyworkHours: 1.0,
    prepHours: 1.5,
    paintHours: 1.5,
    totalHours: 4.0,
    stayDays: 1,
    channel: 'PHONE',
    customerName: 'Martin Paz',
  },
  {
    id: 'ba-007',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(2),
    workTypeId: 'wt-11',   // Pulido y detallado
    status: 'TENTATIVE',
    bodyworkHours: 0.5,
    prepHours: 1.0,
    paintHours: 2.0,
    totalHours: 3.5,
    stayDays: 1,
    channel: 'ONLINE',
    customerName: 'Valeria Mora',
  },

  // D+4 — siniestro
  {
    id: 'ba-008',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(4),
    workTypeId: 'wt-12',   // Siniestro total
    status: 'CONFIRMED',
    bodyworkHours: 24.0,
    prepHours: 16.0,
    paintHours: 12.0,
    totalHours: 52.0,
    stayDays: 10,
    channel: 'INSURANCE',
    customerName: 'Fernando Ruiz',
  },

  // D+7 — reprogramado (TENTATIVE)
  {
    id: 'ba-009',
    workshopId: 'ws-bodyshop-01',
    scheduledDate: dateStr(7),
    workTypeId: 'wt-09',   // Techo
    status: 'TENTATIVE',
    bodyworkHours: 6.0,
    prepHours: 4.0,
    paintHours: 3.5,
    totalHours: 13.5,
    stayDays: 3,
    channel: 'INSURANCE',
    customerName: 'Nadia Castro',
  },
];
