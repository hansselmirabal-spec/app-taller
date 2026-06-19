import { Technician, ServiceType, Appointment, TechnicianCapacity, Absence, Specialty, Workshop, WorkType, BodyshopEntry, BodyshopDayCapacity, BodyshopWeekCapacity, ProcessCapacity, CapacityStatus, WorkshopConfig, BodyshopChannel } from '@/types';
import { pickLeastLoadedTech, addRunningHours } from '@/lib/bodyshop-analytics';

// ─── Talleres ─────────────────────────────────────────────────────────────────

export const MOCK_WORKSHOPS: Workshop[] = [
  { id: 'w1', name: 'Taller Principal', address: 'Av. Corrientes 1234, CABA', active: true, type: 'MECHANIC' },
  { id: 'w2', name: 'Taller Norte',     address: 'Av. Libertador 5678, CABA', active: true, type: 'MECHANIC' },
  { id: 'w3', name: 'Carrocería',       address: 'Taller Automotriz Condor',  active: true, type: 'BODYSHOP' },
];

// ─── Tipos de datos por taller ────────────────────────────────────────────────

interface WorkshopData {
  specialties:     Specialty[];
  technicians:     Technician[];
  serviceTypes:    ServiceType[];
  appointments:    Appointment[];
  absences:        Absence[];
  workTypes?:      WorkType[];
  bodyshopEntries?: BodyshopEntry[];
  config?:         WorkshopConfig;
}

// ─── Utilidad pseudo-aleatoria ────────────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Generador de turnos ──────────────────────────────────────────────────────

const CUSTOMER_NAMES = [
  'Juan Perez','Maria Lopez','Pedro Garcia','Ana Rodriguez','Luis Martinez',
  'Sofia Torres','Diego Fernandez','Laura Gomez','Carlos Medina','Patricia Ruiz',
  'Andres Morales','Claudia Herrera','Pablo Jimenez','Valentina Reyes','Matias Suarez',
  'Florencia Castro','Nicolas Romero','Gabriela Vargas','Ignacio Blanco','Cecilia Molina',
  'Esteban Gutierrez','Monica Vidal','Alejandro Rios','Daniela Mendoza','Ricardo Espinoza',
  'Adriana Contreras','Facundo Navarro','Paola Serrano','Tomas Acosta','Verónica Cruz',
];

const PLATES = [
  'ABC123','XYZ789','DEF456','GHI012','JKL345','MNO678','PQR901','STU234',
  'VWX567','YZA890','BCD012','EFG345','HIJ678','KLM901','NOP234','QRS567',
  'TUV890','WXY012','ZAB345','CDE678','FGH901','IJK234','LMN567','OPQ890',
];

const NOTES_POOL = [
  '', '', '', '', '', '',
  'Revision pre-viaje', 'Cliente frecuente', 'Aceite 5W30',
  'Revisar frenos traseros', 'Ruido en suspension', 'Cambio de filtros',
];

function generateAppointments(
  technicians: Technician[],
  serviceTypes: ServiceType[],
  startDate: Date,
  endDate: Date,
  workshopPrefix: string,
): Appointment[] {
  const appointments: Appointment[] = [];

  // Pesos basados en duración: servicios más cortos = más frecuentes
  const serviceWeights: string[] = [];
  for (const st of serviceTypes) {
    const freq = st.durationHours <= 1 ? 6 : st.durationHours <= 2 ? 4 : st.durationHours <= 3 ? 3 : 2;
    for (let i = 0; i < freq; i++) serviceWeights.push(st.id);
  }

  let counter = 1;
  const current = new Date(startDate);
  const today = new Date('2026-04-13T12:00:00');

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 0) { current.setDate(current.getDate() + 1); continue; }

    const dateStr = current.toISOString().split('T')[0];
    const isPast = current < today;
    const isToday = dateStr === '2026-04-13';
    const isSaturday = dayOfWeek === 6;
    const dateSeed = parseInt(dateStr.replace(/-/g, ''), 10);

    for (const tech of technicians) {
      // Seed único por taller + técnico + fecha
      const techNum = parseInt(tech.id.replace(/\D/g, '').slice(-2) || '1');
      const prefixSeed = workshopPrefix === 'w2' ? 77777 : 0;
      const rand = seededRand(dateSeed + techNum * 1000 + prefixSeed);

      if (isSaturday && rand() > 0.55) continue;

      const maxAppts = isSaturday ? Math.ceil(rand() * 2) : 2 + Math.floor(rand() * 3);
      let cursor = 8 * 60;
      const dayEnd = 18 * 60;

      for (let i = 0; i < maxAppts; i++) {
        const stId = pick(serviceWeights, rand);
        const service = serviceTypes.find(s => s.id === stId)!;
        const durationMin = service.durationHours * 60;
        const slotStart = Math.ceil(cursor / 30) * 30;
        const slotEnd = slotStart + durationMin;
        if (slotEnd > dayEnd) break;

        const breakMin = rand() > 0.7 ? 30 : 0;

        let status: Appointment['status'];
        if (isPast) {
          const r = rand();
          status = r < 0.82 ? 'done' : r < 0.92 ? 'cancelled' : 'scheduled';
        } else if (isToday) {
          const r = rand();
          status = r < 0.4 ? 'done' : r < 0.65 ? 'in_progress' : 'scheduled';
        } else {
          status = 'scheduled';
        }

        const notes = pick(NOTES_POOL, rand);
        appointments.push({
          id: `${workshopPrefix}_${counter++}`,
          date: dateStr,
          timeStart: toHHMM(slotStart),
          timeEnd: toHHMM(slotEnd),
          technicianId: tech.id,
          technician: tech,
          serviceTypeId: stId,
          serviceType: service,
          customerName: pick(CUSTOMER_NAMES, rand),
          plate: pick(PLATES, rand),
          status,
          ...(notes ? { notes } : {}),
        });

        cursor = slotEnd + breakMin;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return appointments;
}

// ─── Datos del Taller Principal (w1) ──────────────────────────────────────────

function buildW1(): WorkshopData {
  const specialties: Specialty[] = [
    { id: 'w1_sp1', name: 'Motor/Caja' },
    { id: 'w1_sp2', name: 'Mp/Mc' },
    { id: 'w1_sp3', name: 'Aire/S24' },
    { id: 'w1_sp4', name: 'Mp/Mc/Sc' },
    { id: 'w1_sp5', name: 'Mecanica Gral' },
    { id: 'w1_sp6', name: 'SIN ESPECIALIDAD' },
    { id: 'w1_sp7', name: 'Sprinter' },
    { id: 'w1_sp8', name: 'Servicio Express/Mp Express/Alineacion-Neumaticos' },
  ];

  const serviceTypes: ServiceType[] = [
    { id: 'st1', name: 'Service basico',   durationHours: 1.5, color: '#22c55e', active: true },
    { id: 'st2', name: 'Service completo', durationHours: 3,   color: '#3b82f6', active: true },
    { id: 'st3', name: 'Frenos',           durationHours: 2,   color: '#f59e0b', active: true, specialtyId: 'w1_sp5', specialty: specialties[4] },
    { id: 'st4', name: 'Suspension',       durationHours: 4,   color: '#ef4444', active: true, specialtyId: 'w1_sp5', specialty: specialties[4] },
    { id: 'st5', name: 'Diagnostico',      durationHours: 1,   color: '#8b5cf6', active: true },
  ];

  const technicians: Technician[] = [
    { id: 'w1_t1', name: 'Carlos Gutierrez', dailyHours: 8, active: true, specialty: specialties[0].name },
    { id: 'w1_t2', name: 'Marcelo Diaz',     dailyHours: 8, active: true, specialty: specialties[3].name },
    { id: 'w1_t3', name: 'Roberto Sanchez',  dailyHours: 8, active: true, specialty: specialties[4].name },
  ];

  const absences: Absence[] = [
    { id: 'w1_ab1', technicianId: 'w1_t2', date: '2026-02-14', type: 'full' },
    { id: 'w1_ab2', technicianId: 'w1_t3', date: '2026-02-14', type: 'full' },
    { id: 'w1_ab3', technicianId: 'w1_t1', date: '2026-03-07', type: 'half' },
    { id: 'w1_ab4', technicianId: 'w1_t2', date: '2026-03-20', type: 'full' },
    { id: 'w1_ab5', technicianId: 'w1_t1', date: '2026-04-12', type: 'half' },
    { id: 'w1_ab6', technicianId: 'w1_t3', date: '2026-04-13', type: 'full' },
  ];

  const appointments = generateAppointments(
    technicians, serviceTypes,
    new Date('2026-01-02T12:00:00'),
    new Date('2026-04-20T12:00:00'),
    'w1',
  );

  return { specialties, technicians, serviceTypes, appointments, absences };
}

// ─── Datos del Taller Norte (w2) ──────────────────────────────────────────────

function buildW2(): WorkshopData {
  const specialties: Specialty[] = [
    { id: 'w2_sp1', name: 'Chapa y Pintura' },
    { id: 'w2_sp2', name: 'Electricidad Automotriz' },
    { id: 'w2_sp3', name: 'Mecanica General' },
    { id: 'w2_sp4', name: 'Transmision' },
    { id: 'w2_sp5', name: 'Neumaticos y Alineacion' },
    { id: 'w2_sp6', name: 'SIN ESPECIALIDAD' },
  ];

  const serviceTypes: ServiceType[] = [
    { id: 'w2_st1', name: 'Revision rapida',    durationHours: 1,   color: '#22c55e', active: true },
    { id: 'w2_st2', name: 'Service completo',   durationHours: 2.5, color: '#3b82f6', active: true },
    { id: 'w2_st3', name: 'Chapa y reparacion', durationHours: 4,   color: '#f59e0b', active: true, specialtyId: 'w2_sp1', specialty: specialties[0] },
    { id: 'w2_st4', name: 'Electricidad',        durationHours: 2,   color: '#ec4899', active: true, specialtyId: 'w2_sp2', specialty: specialties[1] },
    { id: 'w2_st5', name: 'Neumaticos',          durationHours: 1,   color: '#14b8a6', active: true, specialtyId: 'w2_sp5', specialty: specialties[4] },
    { id: 'w2_st6', name: 'Diagnostico OBD',     durationHours: 1,   color: '#8b5cf6', active: true },
    { id: 'w2_st7', name: 'Transmision/Caja',   durationHours: 4,   color: '#ef4444', active: true, specialtyId: 'w2_sp4', specialty: specialties[3] },
  ];

  const technicians: Technician[] = [
    { id: 'w2_t1', name: 'Fernando Ruiz',      dailyHours: 8, active: true, specialty: specialties[0].name },
    { id: 'w2_t2', name: 'Silvina Morales',    dailyHours: 8, active: true, specialty: specialties[1].name },
    { id: 'w2_t3', name: 'Diego Castellano',   dailyHours: 8, active: true, specialty: specialties[2].name },
    { id: 'w2_t4', name: 'Lucia Pereyra',      dailyHours: 8, active: true, specialty: specialties[3].name },
    { id: 'w2_t5', name: 'Maximo Alderete',    dailyHours: 8, active: true, specialty: specialties[4].name },
  ];

  const absences: Absence[] = [
    { id: 'w2_ab1', technicianId: 'w2_t1', date: '2026-01-15', type: 'full' },
    { id: 'w2_ab2', technicianId: 'w2_t3', date: '2026-01-28', type: 'half' },
    { id: 'w2_ab3', technicianId: 'w2_t2', date: '2026-02-10', type: 'full' },
    { id: 'w2_ab4', technicianId: 'w2_t4', date: '2026-02-14', type: 'full' },
    { id: 'w2_ab5', technicianId: 'w2_t5', date: '2026-02-14', type: 'full' },
    { id: 'w2_ab6', technicianId: 'w2_t1', date: '2026-03-10', type: 'full' },
    { id: 'w2_ab7', technicianId: 'w2_t2', date: '2026-03-24', type: 'half' },
    { id: 'w2_ab8', technicianId: 'w2_t3', date: '2026-04-02', type: 'full' },
    { id: 'w2_ab9', technicianId: 'w2_t4', date: '2026-04-07', type: 'half' },
    { id: 'w2_ab10',technicianId: 'w2_t1', date: '2026-04-13', type: 'half' },
  ];

  const appointments = generateAppointments(
    technicians, serviceTypes,
    new Date('2026-01-02T12:00:00'),
    new Date('2026-04-20T12:00:00'),
    'w2',
  );

  return { specialties, technicians, serviceTypes, appointments, absences };
}

// ─── Auto-asignación load-aware por proceso ───────────────────────────────────

function autoAssignProcessTechs(
  entries:      BodyshopEntry[],
  technicians:  Technician[],
  specialtyIds: { BODYWORK: string[]; PREP: string[]; PAINT: string[] },
): BodyshopEntry[] {
  const byProcess = {
    BODYWORK: technicians.filter(t => t.active && specialtyIds.BODYWORK.includes((t.specialty ?? '').toUpperCase())),
    PREP:     technicians.filter(t => t.active && specialtyIds.PREP.includes((t.specialty ?? '').toUpperCase())),
    PAINT:    technicians.filter(t => t.active && specialtyIds.PAINT.includes((t.specialty ?? '').toUpperCase())),
  };

  // Acumulador de horas asignadas por técnico y mes: { techId: { 'yyyy-MM': horas } }
  const runningHours: Record<string, Record<string, number>> = {};

  // Procesar en orden cronológico para que el balanceo sea correcto
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return sorted.map(e => {
    if (e.status === 'cancelled') return e;

    // Si ya tiene asignaciones, registrar esas horas en el acumulador y seguir
    if (e.processTechs) {
      (['BODYWORK', 'PREP', 'PAINT'] as const).forEach(proc => {
        const pt = e.processTechs![proc];
        if (!pt) return;
        const h = proc === 'BODYWORK' ? e.bodyworkHours : proc === 'PREP' ? e.prepHours : e.paintHours;
        addRunningHours(runningHours, pt.technicianId, e.date, h);
      });
      return e;
    }

    const processTechs: NonNullable<BodyshopEntry['processTechs']> = {};

    if (e.bodyworkHours > 0 && byProcess.BODYWORK.length > 0) {
      const t = pickLeastLoadedTech(byProcess.BODYWORK, runningHours, e.date);
      if (t) {
        processTechs.BODYWORK = { technicianId: t.id, technician: t };
        addRunningHours(runningHours, t.id, e.date, e.bodyworkHours);
      }
    }
    if (e.prepHours > 0 && byProcess.PREP.length > 0) {
      const t = pickLeastLoadedTech(byProcess.PREP, runningHours, e.date);
      if (t) {
        processTechs.PREP = { technicianId: t.id, technician: t };
        addRunningHours(runningHours, t.id, e.date, e.prepHours);
      }
    }
    if (e.paintHours > 0 && byProcess.PAINT.length > 0) {
      const t = pickLeastLoadedTech(byProcess.PAINT, runningHours, e.date);
      if (t) {
        processTechs.PAINT = { technicianId: t.id, technician: t };
        addRunningHours(runningHours, t.id, e.date, e.paintHours);
      }
    }

    return { ...e, processTechs };
  });
}

// ─── Generador de ingresos BODYSHOP ──────────────────────────────────────────

function generateBodyshopEntries(
  workTypes: WorkType[],
  startDate: Date,
  endDate: Date,
): BodyshopEntry[] {
  const entries: BodyshopEntry[] = [];
  let counter = 1;

  // Hoy fijo: 15 de abril 2026
  const todayStr = '2026-04-15';
  const today = new Date(todayStr + 'T12:00:00');

  // Pesos de tipo de trabajo: más light/medium que heavy
  const wtWeightMap: Record<string, number> = {
    'w3_wt1': 3,  // toque leve
    'w3_wt2': 5,  // daño mediano
    'w3_wt3': 2,  // daño grave
    'w3_wt4': 4,  // paragolpes
    'w3_wt5': 4,  // puerta
    'w3_wt6': 2,  // lateral completo
    'w3_wt7': 3,  // capot
    'w3_wt8': 1,  // siniestro total
  };
  const wtPool: string[] = [];
  for (const [id, weight] of Object.entries(wtWeightMap)) {
    for (let i = 0; i < weight; i++) wtPool.push(id);
  }

  // Canal: insurance domina en bodyshop
  const channelPool: BodyshopChannel[] = [
    'insurance', 'insurance', 'insurance', 'insurance', 'insurance',
    'phone', 'phone', 'phone',
    'walk_in', 'walk_in',
    'online',
  ];

  const current = new Date(startDate);
  while (current <= endDate) {
    const dow = current.getDay();
    // Bodyshop trabaja lun-vie (sin sábado para mantener carga legible)
    if (dow === 0 || dow === 6) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dateStr = current.toISOString().split('T')[0];
    const dateSeed = parseInt(dateStr.replace(/-/g, ''), 10);
    const rand = seededRand(dateSeed * 31 + 555);

    // Densidad de ingresos: 60% de los días tienen 1+ vehículo
    // Semanas "pico" (quincenas) tienen más carga
    const dayOfMonth = current.getDate();
    const isPeak = dayOfMonth >= 7 && dayOfMonth <= 12 || dayOfMonth >= 20 && dayOfMonth <= 25;
    const arrivalChance = isPeak ? 0.80 : 0.55;

    if (rand() > arrivalChance) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // 1-3 vehículos por día, días pico pueden tener 3
    const r2 = rand();
    const numEntries = r2 < 0.55 ? 1 : r2 < 0.85 ? 2 : 3;

    const isPast = current < today;
    const isToday = dateStr === todayStr;

    for (let i = 0; i < numEntries; i++) {
      const wtId = wtPool[Math.floor(rand() * wtPool.length)];
      const wt = workTypes.find(w => w.id === wtId);
      if (!wt) continue;

      const channel = channelPool[Math.floor(rand() * channelPool.length)];
      const customerName = CUSTOMER_NAMES[Math.floor(rand() * CUSTOMER_NAMES.length)];
      const plate = PLATES[Math.floor(rand() * PLATES.length)];

      let status: BodyshopEntry['status'];
      if (isPast) {
        const r = rand();
        status = r < 0.88 ? 'done' : r < 0.95 ? 'cancelled' : 'done';
      } else if (isToday) {
        status = rand() < 0.6 ? 'in_progress' : 'scheduled';
      } else {
        status = 'scheduled';
      }

      entries.push({
        id: `w3_e${counter++}`,
        workshopId: 'w3',
        date: dateStr,
        workTypeId: wtId,
        workType: wt,
        customerName,
        plate,
        status,
        bodyworkHours: wt.bodyworkHours,
        prepHours:     wt.prepHours,
        paintHours:    wt.paintHours,
        stayDays:      wt.estimatedDays,
        channel,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return entries;
}

// ─── Datos de Carrocería Sur (w3) — BODYSHOP ──────────────────────────────────

function buildW3(): WorkshopData {
  const workTypes: WorkType[] = [
    { id: 'w3_wt1', workshopId: 'w3', name: 'Toque leve',        severity: 'LIGHT',    estimatedDays: 1,  bodyworkHours: 1.5,  prepHours: 2.0,  paintHours: 1.0,  color: '#22c55e' },
    { id: 'w3_wt2', workshopId: 'w3', name: 'Daño mediano',      severity: 'MEDIUM',   estimatedDays: 2,  bodyworkHours: 4.0,  prepHours: 3.0,  paintHours: 2.5,  color: '#3b82f6' },
    { id: 'w3_wt3', workshopId: 'w3', name: 'Daño grave',        severity: 'HEAVY',    estimatedDays: 5,  bodyworkHours: 10.0, prepHours: 6.0,  paintHours: 5.0,  color: '#f59e0b' },
    { id: 'w3_wt4', workshopId: 'w3', name: 'Paragolpes',        severity: 'LIGHT',    estimatedDays: 1,  bodyworkHours: 1.0,  prepHours: 1.5,  paintHours: 1.5,  color: '#14b8a6' },
    { id: 'w3_wt5', workshopId: 'w3', name: 'Puerta',            severity: 'MEDIUM',   estimatedDays: 2,  bodyworkHours: 3.0,  prepHours: 2.5,  paintHours: 2.0,  color: '#8b5cf6' },
    { id: 'w3_wt6', workshopId: 'w3', name: 'Lateral completo',  severity: 'HEAVY',    estimatedDays: 4,  bodyworkHours: 8.0,  prepHours: 5.0,  paintHours: 4.0,  color: '#ef4444' },
    { id: 'w3_wt7', workshopId: 'w3', name: 'Capot',             severity: 'MEDIUM',   estimatedDays: 2,  bodyworkHours: 3.5,  prepHours: 2.5,  paintHours: 2.0,  color: '#ec4899' },
    { id: 'w3_wt8', workshopId: 'w3', name: 'Siniestro total',   severity: 'MULTIPLE', estimatedDays: 10, bodyworkHours: 20.0, prepHours: 12.0, paintHours: 10.0, color: '#dc2626' },
  ];

  const config: WorkshopConfig = {
    presenceRate: 0.90,
    productivityRate: 0.82,
    lostHoursRate: 0.06,
    bufferRate: 0.12,
    // processMix queda como fallback pero el motor usará processSpecialtyIds
    processMix: { bodywork: 0.50, prep: 0.25, paint: 0.25 },
    processSpecialtyIds: {
      BODYWORK: ['w3_sp1'],  // Chapista
      PREP:     ['w3_sp2'],  // Preparador
      PAINT:    ['w3_sp3'],  // Pintor
    },
  };

  const specialties: Specialty[] = [
    { id: 'w3_sp1', name: 'Chapista' },
    { id: 'w3_sp2', name: 'Preparador' },
    { id: 'w3_sp3', name: 'Pintor' },
    { id: 'w3_sp4', name: 'Diamantador' },
    { id: 'w3_sp5', name: 'Mecánico' },
    { id: 'w3_sp6', name: 'Pulidor' },
  ];

  const sp = (id: string) => specialties.find(s => s.id === id)!.name;

  const technicians: Technician[] = [
    // Chapistas — BOX1–BOX5
    { id: 'w3_t01', name: 'NERY JUNIOR SOSA ZOTTI',           dailyHours: 9.5, active: true, specialty: sp('w3_sp1'), monthlyTargetHours: 190 },
    { id: 'w3_t02', name: 'MARCOS ANTONIO ARAUJO SANABRIA',   dailyHours: 9.5, active: true, specialty: sp('w3_sp1'), monthlyTargetHours: 190 },
    { id: 'w3_t03', name: 'JOSE ANTONIO SILVA ORTEGA',        dailyHours: 9.5, active: true, specialty: sp('w3_sp1'), monthlyTargetHours: 190 },
    { id: 'w3_t04', name: 'JORGE DAVID BARRIOS GIMENEZ',      dailyHours: 9.5, active: true, specialty: sp('w3_sp1'), monthlyTargetHours: 190 },
    { id: 'w3_t05', name: 'CHRISTIAN ARTURO BAEZ GODOY',      dailyHours: 9.5, active: true, specialty: sp('w3_sp1'), monthlyTargetHours: 190 },
    // Preparadores — BOX6–BOX10, CAB2
    { id: 'w3_t06', name: 'ANIBAL RAMON PACUA',               dailyHours: 9.5, active: true, specialty: sp('w3_sp2'), monthlyTargetHours: 190 },
    { id: 'w3_t07', name: 'DERLIS ABEL ROJAS PEREZ',          dailyHours: 9.5, active: true, specialty: sp('w3_sp2'), monthlyTargetHours: 190 },
    { id: 'w3_t08', name: 'HECTOR ARMANDO MARTINEZ VILLAGRA', dailyHours: 9.5, active: true, specialty: sp('w3_sp2'), monthlyTargetHours: 190 },
    { id: 'w3_t09', name: 'REINALDO CARRERAS',                dailyHours: 9.5, active: true, specialty: sp('w3_sp2'), monthlyTargetHours: 190 },
    { id: 'w3_t10', name: 'GUIDO ARMANDO ACUNA GARCIA',       dailyHours: 9.5, active: true, specialty: sp('w3_sp2'), monthlyTargetHours: 190 },
    { id: 'w3_t11', name: 'CRISPULO GALEANO ALEMA',           dailyHours: 9.5, active: true, specialty: sp('w3_sp2'), monthlyTargetHours: 190 },
    { id: 'w3_t12', name: 'LUIS ALBERTO BOGADO',              dailyHours: 9.5, active: true, specialty: sp('w3_sp2'), monthlyTargetHours: 190 },
    // Pintores — CAB1
    { id: 'w3_t13', name: 'LUIS ALFREDO GONZALEZ MOREL',      dailyHours: 9.5, active: true, specialty: sp('w3_sp3'), monthlyTargetHours: 190 },
    { id: 'w3_t14', name: 'JOSE BENITEZ',                     dailyHours: 9.5, active: true, specialty: sp('w3_sp3'), monthlyTargetHours: 190 },
    // Diamantador — AD1
    { id: 'w3_t15', name: 'JOSE RAFAEL GAONA MONGELOS',       dailyHours: 9.5, active: true, specialty: sp('w3_sp4'), monthlyTargetHours: 190 },
    // Mecánico — AD2
    { id: 'w3_t16', name: 'JULIO RAFAEL DOMINGUEZ ZARZA',     dailyHours: 9.5, active: true, specialty: sp('w3_sp5'), monthlyTargetHours: 190 },
    // Pulidores — BOX11–BOX13
    { id: 'w3_t17', name: 'PULIDOR BOX11',                    dailyHours: 9.5, active: true, specialty: sp('w3_sp6'), monthlyTargetHours: 190 },
    { id: 'w3_t18', name: 'PULIDOR BOX12',                    dailyHours: 9.5, active: true, specialty: sp('w3_sp6'), monthlyTargetHours: 190 },
    { id: 'w3_t19', name: 'PULIDOR BOX12B',                   dailyHours: 9.5, active: true, specialty: sp('w3_sp6'), monthlyTargetHours: 190 },
    { id: 'w3_t20', name: 'PULIDOR BOX13',                    dailyHours: 9.5, active: true, specialty: sp('w3_sp6'), monthlyTargetHours: 190 },
  ];

  const bodyshopEntries = generateBodyshopEntries(
    workTypes,
    new Date('2026-01-06T12:00:00'),
    new Date('2026-04-30T12:00:00'),
  );

  // ── Ingresos garantizados — Abril 2026 completo ───────────────────────────
  // Asegura cobertura densa para el reporte mensual.
  const wt = (id: string) => workTypes.find(w => w.id === id)!;

  type S = BodyshopEntry['status'];
  type Ch = BodyshopEntry['channel'];

  let fixedCounter = 1;
  const e = (
    id: string, date: string, wtId: string,
    customer: string, plate: string,
    status: S, channel: Ch, notes?: string,
  ): BodyshopEntry => ({
    id,
    workshopId: 'w3',
    date,
    workTypeId: wtId,
    workType: wt(wtId),
    customerName: customer,
    plate,
    status,
    bodyworkHours: wt(wtId).bodyworkHours,
    prepHours:     wt(wtId).prepHours,
    paintHours:    wt(wtId).paintHours,
    stayDays:      wt(wtId).estimatedDays,
    channel,
    notes,
  });

  // Semana 1 (1-3 abr — mié/jue/vie)
  const week1: BodyshopEntry[] = [
    e('w3_f01', '2026-04-01', 'w3_wt4', 'Daniela Ruiz',      'PQR112', 'done', 'insurance'),
    e('w3_f02', '2026-04-01', 'w3_wt2', 'Nicolás Ibáñez',    'GHJ445', 'done', 'phone'),
    e('w3_f03', '2026-04-02', 'w3_wt5', 'Patricia Suárez',   'KLM556', 'done', 'insurance', 'Seguro Sancor'),
    e('w3_f04', '2026-04-02', 'w3_wt7', 'Rodrigo Ferreyra',  'NOP667', 'done', 'walk_in'),
    e('w3_f05', '2026-04-03', 'w3_wt1', 'Martina Gómez',     'QRS778', 'done', 'online'),
    e('w3_f06', '2026-04-03', 'w3_wt6', 'Oscar Navarro',     'TUV889', 'done', 'insurance', 'Seguro Galicia'),
  ];

  // Semana 2 (6-10 abr — lun/mar/mié/jue/vie)
  const week2: BodyshopEntry[] = [
    e('w3_f07', '2026-04-06', 'w3_wt3', 'Florencia Méndez',  'ABC123', 'done', 'insurance', 'Choque trasero. Seguros Rivadavia'),
    e('w3_f08', '2026-04-06', 'w3_wt2', 'Esteban Romero',    'DEF234', 'done', 'phone'),
    e('w3_f09', '2026-04-06', 'w3_wt5', 'Laura Castillo',    'GHI345', 'done', 'insurance'),
    e('w3_f10', '2026-04-07', 'w3_wt7', 'Marcos Olivares',   'JKL456', 'done', 'walk_in'),
    e('w3_f11', '2026-04-07', 'w3_wt4', 'Silvia Bravo',      'MNO567', 'done', 'online'),
    e('w3_f12', '2026-04-08', 'w3_wt2', 'Emilio Torres',     'PQR678', 'done', 'insurance'),
    e('w3_f13', '2026-04-08', 'w3_wt6', 'Natalia Ríos',      'STU789', 'done', 'insurance', 'Lateral izq. Seguro BBVA'),
    e('w3_f14', '2026-04-09', 'w3_wt1', 'Andrés Pereyra',    'VWX890', 'done', 'phone'),
    e('w3_f15', '2026-04-09', 'w3_wt5', 'Cecilia Leiva',     'YZA901', 'done', 'walk_in'),
    e('w3_f16', '2026-04-10', 'w3_wt3', 'Tomás Vargas',      'BCD012', 'done', 'insurance', 'Impacto frontal. Mapfre'),
    e('w3_f17', '2026-04-10', 'w3_wt7', 'Viviana Espinoza',  'EFG123', 'done', 'phone'),
  ];

  // Semana 3 (13-17 abr — lun/mar/mié/jue/vie) — hoy es 15
  const week3: BodyshopEntry[] = [
    e('w3_f18', '2026-04-13', 'w3_wt6', 'Javier Mora',       'HIJ234', 'done', 'insurance', 'Lateral completo. Allianz'),
    e('w3_f19', '2026-04-13', 'w3_wt2', 'Graciela Pedraza',  'KLM345', 'done', 'phone'),
    e('w3_f20', '2026-04-13', 'w3_wt5', 'Ricardo Sánchez',   'NOP456', 'done', 'walk_in'),
    e('w3_f21', '2026-04-14', 'w3_wt3', 'Elena Villafuerte', 'QRS567', 'done', 'insurance', 'Choque múltiple. Sancor'),
    e('w3_f22', '2026-04-14', 'w3_wt4', 'Pablo Godoy',       'TUV678', 'done', 'online'),
    // Hoy 15 abr
    e('w3_today_1', '2026-04-15', 'w3_wt3', 'Valeria Mora',    'ZAB345', 'in_progress', 'insurance', 'Choque frontal. Aseguradora Mapfre.'),
    e('w3_today_2', '2026-04-15', 'w3_wt5', 'Sergio Blanco',   'CDE678', 'in_progress', 'phone'),
    e('w3_today_3', '2026-04-15', 'w3_wt7', 'Luciana Pedraza', 'RST901', 'scheduled',   'walk_in'),
    e('w3_today_4', '2026-04-15', 'w3_wt2', 'Hernán Villalba', 'UVW234', 'scheduled',   'insurance', 'Seguro La Caja. Autorización pendiente.'),
    // 16-17 abr
    e('w3_f23', '2026-04-16', 'w3_wt2', 'Diana Herrera',     'WXY345', 'scheduled', 'insurance'),
    e('w3_f24', '2026-04-16', 'w3_wt6', 'Carlos Mendoza',    'XYZ456', 'scheduled', 'insurance', 'Siniestro lat. der. Galicia'),
    e('w3_f25', '2026-04-17', 'w3_wt1', 'Miriam Aguilar',    'YZA567', 'scheduled', 'phone'),
    e('w3_f26', '2026-04-17', 'w3_wt5', 'Fernando Salinas',  'ZAB678', 'scheduled', 'walk_in'),
  ];

  // Semana 4 (20-24 abr)
  const week4: BodyshopEntry[] = [
    e('w3_f27', '2026-04-20', 'w3_wt3', 'Adriana Contreras', 'ABC789', 'scheduled', 'insurance', 'Choque frontal. Federación Patronal'),
    e('w3_f28', '2026-04-20', 'w3_wt5', 'Mauricio Paredes',  'BCD890', 'scheduled', 'phone'),
    e('w3_f29', '2026-04-20', 'w3_wt2', 'Inés Cárdenas',     'CDE901', 'scheduled', 'insurance'),
    e('w3_f30', '2026-04-21', 'w3_wt7', 'Gustavo Acevedo',   'DEF012', 'scheduled', 'walk_in'),
    e('w3_f31', '2026-04-21', 'w3_wt4', 'Rosa Fuentes',      'EFG123', 'scheduled', 'online'),
    e('w3_f32', '2026-04-22', 'w3_wt6', 'Santiago Campos',   'FGH234', 'scheduled', 'insurance', 'Lateral completo. Zurich'),
    e('w3_f33', '2026-04-22', 'w3_wt2', 'Teresa Leal',       'GHI345', 'scheduled', 'phone'),
    e('w3_f34', '2026-04-23', 'w3_wt5', 'Ramiro Jiménez',    'HIJ456', 'scheduled', 'insurance'),
    e('w3_f35', '2026-04-23', 'w3_wt1', 'Beatriz Solano',    'IJK567', 'scheduled', 'walk_in'),
    e('w3_f36', '2026-04-24', 'w3_wt3', 'Horacio Delgado',   'JKL678', 'scheduled', 'insurance', 'Choque trasero. HDI Seguros'),
    e('w3_f37', '2026-04-24', 'w3_wt7', 'Claudia Serrano',   'KLM789', 'scheduled', 'phone'),
  ];

  // Semana 5 (27-30 abr)
  const week5: BodyshopEntry[] = [
    e('w3_f38', '2026-04-27', 'w3_wt2', 'Roberto Vega',      'LMN890', 'scheduled', 'insurance'),
    e('w3_f39', '2026-04-27', 'w3_wt6', 'Alejandra Cruz',    'MNO901', 'scheduled', 'insurance', 'Seg. Integridad. Lateral completo'),
    e('w3_f40', '2026-04-28', 'w3_wt5', 'Ignacio Ramos',     'NOP012', 'scheduled', 'phone'),
    e('w3_f41', '2026-04-28', 'w3_wt4', 'Valeria Herrero',   'OPQ123', 'scheduled', 'walk_in'),
    e('w3_f42', '2026-04-29', 'w3_wt3', 'Marco Medina',      'PQR234', 'scheduled', 'insurance', 'Mapfre. Frente completo'),
    e('w3_f43', '2026-04-29', 'w3_wt1', 'Alicia Ponce',      'QRS345', 'scheduled', 'online'),
    e('w3_f44', '2026-04-30', 'w3_wt7', 'Diego Bernal',      'RST456', 'scheduled', 'phone'),
    e('w3_f45', '2026-04-30', 'w3_wt2', 'Elena Osorio',      'STU567', 'scheduled', 'insurance'),
  ];

  const fixedAprilEntries: BodyshopEntry[] = [
    ...week1, ...week2, ...week3, ...week4, ...week5,
  ];

  // ── Ausencias de abril (hacen el reporte más realista) ────────────────────
  const aprilAbsences: Absence[] = [
    { id: 'w3_abs1', technicianId: 'w3_t01', date: '2026-04-03', type: 'full',    reason: 'Enfermedad' },
    { id: 'w3_abs2', technicianId: 'w3_t02', date: '2026-04-09', type: 'half',    reason: 'Médico' },
    { id: 'w3_abs3', technicianId: 'w3_t02', date: '2026-04-10', type: 'full',    reason: 'Enfermedad' },
    { id: 'w3_abs4', technicianId: 'w3_t06', date: '2026-04-07', type: 'holiday', reason: 'Feriado puente' },
    { id: 'w3_abs5', technicianId: 'w3_t13', date: '2026-04-22', type: 'half',    reason: 'Trámite personal' },
  ];

  // Deduplicar: los fixedAprilEntries tienen prioridad sobre los generados aleatoriamente
  const fixedIds = new Set(fixedAprilEntries.map(e => e.id));
  const fixedDates = new Set(fixedAprilEntries.map(e => e.date));
  // Conservar entradas generadas de días de abril que no tienen cobertura fija,
  // y todas las de meses anteriores a abril.
  const filteredGenerated = bodyshopEntries.filter(e =>
    !fixedIds.has(e.id) &&
    !(e.date.startsWith('2026-04') && fixedDates.has(e.date)),
  );

  const allEntries = autoAssignProcessTechs(
    [...filteredGenerated, ...fixedAprilEntries],
    technicians,
    config.processSpecialtyIds!,
  );

  return {
    specialties,
    technicians,
    serviceTypes: [],
    appointments: [],
    absences: aprilAbsences,
    workTypes,
    bodyshopEntries: allEntries,
    config,
  };
}

// ─── Store de talleres ────────────────────────────────────────────────────────

const WORKSHOP_DB: Record<string, WorkshopData> = {
  w1: buildW1(),
  w2: buildW2(),
  w3: buildW3(),
};

export function getWorkshopData(workshopId: string): WorkshopData {
  if (!WORKSHOP_DB[workshopId]) {
    WORKSHOP_DB[workshopId] = {
      specialties: [], technicians: [], serviceTypes: [], appointments: [], absences: [],
    };
  }
  return WORKSHOP_DB[workshopId];
}

// ─── Función de capacidad ─────────────────────────────────────────────────────

export function getMockCapacity(date: string, workshopId: string): TechnicianCapacity[] {
  const { technicians, appointments, absences } = getWorkshopData(workshopId);
  const dayAppts = appointments.filter(a => a.date === date && a.status !== 'cancelled');
  const dayAbsences = absences.filter(a => a.date === date);

  return technicians.map(tech => {
    const usedHours = dayAppts
      .filter(a => a.technicianId === tech.id)
      .reduce((sum, a) => sum + a.serviceType.durationHours, 0);

    const absence = dayAbsences.find(a => a.technicianId === tech.id);
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const isSunday = dayOfWeek === 0;

    let availableHours: number;
    if (isSunday || absence?.type === 'full') {
      availableHours = 0;
    } else if (absence?.type === 'half' || absence?.type === 'holiday') {
      availableHours = tech.dailyHours / 2;
    } else if (absence?.type === 'partial' && absence.timeStart && absence.timeEnd) {
      const [sh, sm] = absence.timeStart.split(':').map(Number);
      const [eh, em] = absence.timeEnd.split(':').map(Number);
      const blockedHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      availableHours = Math.max(tech.dailyHours - blockedHours, 0);
    } else {
      availableHours = tech.dailyHours;
    }

    return {
      technicianId: tech.id,
      technicianName: tech.name,
      dailyHours: tech.dailyHours,
      availableHours,
      usedHours,
      absenceType: absence?.type ?? null,
      isWorkingDay: !isSunday,
      blockedFrom: absence?.type === 'partial' ? absence.timeStart : undefined,
      blockedTo:   absence?.type === 'partial' ? absence.timeEnd   : undefined,
      absenceReason: absence?.reason,
    };
  });
}

// ─── Motor de capacidad BODYSHOP ─────────────────────────────────────────────

const RISK_THRESHOLD = 0.85;
const BODYSHOP_TECHNICIANS = 4;
const BODYSHOP_HOURS_PER_DAY = 8;

function buildProcessCapacity(
  process: ProcessCapacity['process'],
  label: string,
  commercializable: number,
  occupied: number,
): ProcessCapacity {
  const available = Math.max(0, commercializable - occupied);
  const rate = commercializable > 0 ? occupied / commercializable : 0;
  const status: CapacityStatus = rate >= 1.0 ? 'OVERLOADED' : rate >= RISK_THRESHOLD ? 'RISK' : 'OK';
  return { process, label, commercializableHours: r2(commercializable), occupiedHours: r2(occupied), availableHours: r2(available), occupancyRate: r2(rate), status };
}

function r2(n: number) { return Math.round(n * 100) / 100; }

export function getBodyshopCapacity(date: string, workshopId: string): BodyshopDayCapacity {
  const data = getWorkshopData(workshopId);
  const cfg = data.config ?? {
    presenceRate: 0.90, productivityRate: 0.82, lostHoursRate: 0.06, bufferRate: 0.12,
    processMix: { bodywork: 0.42, prep: 0.33, paint: 0.25 },
  };
  const mix = cfg.processMix ?? { bodywork: 0.42, prep: 0.33, paint: 0.25 };

  const isSunday = new Date(date + 'T12:00:00').getDay() === 0;
  const adj = (1 - cfg.lostHoursRate) * (1 - cfg.bufferRate) * cfg.presenceRate * cfg.productivityRate;

  // ── Capacidad comercializable por proceso ─────────────────────────────────
  // Si hay processSpecialtyIds, usa horas reales de los técnicos de cada proceso.
  // Si no, aplica processMix al total.
  let commBW: number, commPrep: number, commPaint: number;

  if (cfg.processSpecialtyIds && data.technicians.length > 0) {
    const hoursForProcess = (specialtyIds: string[]) => {
      if (isSunday) return 0;
      return data.technicians
        .filter(t => t.active && specialtyIds.includes((t.specialty ?? '').toUpperCase()))
        .reduce((s, t) => s + t.dailyHours, 0);
    };

    commBW    = hoursForProcess(cfg.processSpecialtyIds.BODYWORK) * adj;
    commPrep  = hoursForProcess(cfg.processSpecialtyIds.PREP)     * adj;
    commPaint = hoursForProcess(cfg.processSpecialtyIds.PAINT)    * adj;
  } else {
    const techs = data.technicians.length || BODYSHOP_TECHNICIANS;
    const hpd   = data.technicians[0]?.dailyHours || BODYSHOP_HOURS_PER_DAY;
    const commercial = isSunday ? 0 : techs * hpd * adj;
    commBW    = commercial * mix.bodywork;
    commPrep  = commercial * mix.prep;
    commPaint = commercial * mix.paint;
  }

  const commercial = commBW + commPrep + commPaint;

  const entries = (data.bodyshopEntries ?? []).filter(
    e => e.date === date && e.status !== 'cancelled',
  );

  const occBW    = entries.reduce((s, e) => s + e.bodyworkHours, 0);
  const occPrep  = entries.reduce((s, e) => s + e.prepHours, 0);
  const occPaint = entries.reduce((s, e) => s + e.paintHours, 0);
  const totalOcc = occBW + occPrep + occPaint;

  const byProcess = {
    BODYWORK: buildProcessCapacity('BODYWORK', 'Chapería',    commBW,    occBW),
    PREP:     buildProcessCapacity('PREP',     'Preparación', commPrep,  occPrep),
    PAINT:    buildProcessCapacity('PAINT',    'Pintura',     commPaint, occPaint),
  };

  const globalRate   = commercial > 0 ? totalOcc / commercial : 0;
  const globalStatus: CapacityStatus = globalRate >= 1.0 ? 'OVERLOADED' : globalRate >= RISK_THRESHOLD ? 'RISK' : 'OK';

  return {
    workshopId,
    date,
    commercializableTotal: r2(commercial),
    byProcess,
    byTechnician: [],
    globalOccupancyRate: r2(globalRate),
    globalStatus,
    entries,
    pendingBudgets: 0,
  };
}

export function getBodyshopWeekCapacity(from: string, to: string, workshopId: string): BodyshopWeekCapacity {
  const result: BodyshopWeekCapacity = {};
  const current = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (current <= end) {
    const d = current.toISOString().split('T')[0];
    result[d] = getBodyshopCapacity(d, workshopId);
    current.setDate(current.getDate() + 1);
  }
  return result;
}

// ─── Compat exports (usan w1 por defecto) ────────────────────────────────────
// Solo para referencias directas legacy. Preferir getWorkshopData().

export const MOCK_SPECIALTIES  = getWorkshopData('w1').specialties;
export const MOCK_TECHNICIANS  = getWorkshopData('w1').technicians;
export const MOCK_SERVICE_TYPES = getWorkshopData('w1').serviceTypes;
export const MOCK_APPOINTMENTS = getWorkshopData('w1').appointments;
export const MOCK_ABSENCES     = getWorkshopData('w1').absences;
