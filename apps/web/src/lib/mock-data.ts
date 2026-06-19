import { Technician, ServiceType, Appointment, TechnicianCapacity, Absence, Specialty } from '@/types';

// ─── Catálogos base ───────────────────────────────────────────────────────────

export const MOCK_SPECIALTIES: Specialty[] = [
  { id: 'sp1', name: 'Motor/Caja' },
  { id: 'sp2', name: 'Mp/Mc' },
  { id: 'sp3', name: 'Aire/S24' },
  { id: 'sp4', name: 'Mp/Mc/Sc' },
  { id: 'sp5', name: 'Mecanica Gral' },
  { id: 'sp6', name: 'SIN ESPECIALIDAD' },
  { id: 'sp7', name: 'Sprinter' },
  { id: 'sp8', name: 'Servicio Express/Mp Express/Alineacion-Neumaticos' },
];

export const MOCK_TECHNICIANS: Technician[] = [
  { id: 't1', name: 'Carlos Gutierrez', dailyHours: 8, active: true, specialtyId: 'sp1', specialty: MOCK_SPECIALTIES[0] },
  { id: 't2', name: 'Marcelo Diaz',     dailyHours: 8, active: true, specialtyId: 'sp4', specialty: MOCK_SPECIALTIES[3] },
  { id: 't3', name: 'Roberto Sanchez',  dailyHours: 8, active: true, specialtyId: 'sp5', specialty: MOCK_SPECIALTIES[4] },
];

export const MOCK_SERVICE_TYPES: ServiceType[] = [
  { id: 'st1', name: 'Service basico',   durationHours: 1.5, color: '#22c55e', active: true },
  { id: 'st2', name: 'Service completo', durationHours: 3,   color: '#3b82f6', active: true },
  { id: 'st3', name: 'Frenos',           durationHours: 2,   color: '#f59e0b', active: true },
  { id: 'st4', name: 'Suspension',       durationHours: 4,   color: '#ef4444', active: true },
  { id: 'st5', name: 'Diagnostico',      durationHours: 1,   color: '#8b5cf6', active: true },
];

// ─── Datos de clientes y vehículos ────────────────────────────────────────────

const CUSTOMER_NAMES = [
  'Juan Perez','Maria Lopez','Pedro Garcia','Ana Rodriguez','Luis Martinez',
  'Sofia Torres','Diego Fernandez','Laura Gomez','Carlos Medina','Patricia Ruiz',
  'Andres Morales','Claudia Herrera','Pablo Jimenez','Valentina Reyes','Matias Suarez',
  'Florencia Castro','Nicolas Romero','Gabriela Vargas','Ignacio Blanco','Cecilia Molina',
  'Esteban Gutierrez','Monica Vidal','Alejandro Rios','Daniela Mendoza','Ricardo Espinoza',
  'Adriana Contreras','Facundo Navarro','Paola Serrano','Tomas Acosta','Verónica Cruz',
  'Marcelo Rojas','Lorena Paredes','Sebastián Mora','Natalia Aguilar','Hernán Lara',
  'Catalina Ponce','Maximiliano Vera','Camila Soto','Rodrigo Alvarado','Elena Fuentes',
];

const PLATES = [
  'ABC123','XYZ789','DEF456','GHI012','JKL345','MNO678','PQR901','STU234',
  'VWX567','YZA890','BCD012','EFG345','HIJ678','KLM901','NOP234','QRS567',
  'TUV890','WXY012','ZAB345','CDE678','FGH901','IJK234','LMN567','OPQ890',
  'RST012','UVW345','XYZ678','ABC901','DEF234','GHI567','JKL890','MNO012',
  'PQR345','STU678','VWX901','YZA012','BCD345','EFG678','HIJ901','KLM012',
];

const NOTES_POOL = [
  '', '', '', '', '', '', // mayoría sin notas
  'Revision pre-viaje', 'Cliente frecuente', 'Aceite 5W30',
  'Revisar frenos traseros', 'Ruido en suspension', 'Cambio de filtros',
  'Falla en encendido', 'A/C no enfría', 'Batería baja',
];

// ─── Utilidad pseudo-aleatoria (determinista por seed) ────────────────────────

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

// ─── Generador histórico ──────────────────────────────────────────────────────
// Genera turnos desde startDate hasta endDate para todos los técnicos.

function generateHistoricalAppointments(): Appointment[] {
  const appointments: Appointment[] = [];
  const today = new Date('2026-04-18T12:00:00');
  const startDate = new Date('2026-01-02T12:00:00'); // primer día hábil del año

  // Distribución de servicios (índices con frecuencia)
  // st1=35%, st2=20%, st3=20%, st5=15%, st4=10%
  const serviceWeights = ['st1','st1','st1','st1','st1','st1','st1',
                          'st2','st2','st2','st2',
                          'st3','st3','st3','st3',
                          'st5','st5','st5',
                          'st4','st4'];

  let apptIdCounter = 1;

  const current = new Date(startDate);
  while (current <= today) {
    const dayOfWeek = current.getDay();

    // Sin domingo, sin sábado con menos frecuencia
    if (dayOfWeek === 0) { current.setDate(current.getDate() + 1); continue; }

    const dateStr = current.toISOString().split('T')[0];
    const isPast = current < today;
    const isToday = dateStr === '2026-04-13';
    const isSaturday = dayOfWeek === 6;

    // Seed basada en fecha para reproducibilidad
    const dateSeed = parseInt(dateStr.replace(/-/g, ''), 10);

    for (const tech of MOCK_TECHNICIANS) {
      const techSeed = dateSeed + (tech.id === 't1' ? 0 : tech.id === 't2' ? 1000 : 2000);
      const rand = seededRand(techSeed);

      // Sábado: 40% de chance de no trabajar o trabajar medio día
      if (isSaturday && rand() > 0.6) continue;

      // Número de turnos del día (2-4, sábado: 1-2)
      const maxAppts = isSaturday ? Math.ceil(rand() * 2) : 2 + Math.floor(rand() * 3);

      let cursor = 8 * 60; // 08:00 en minutos
      const dayEnd = 18 * 60; // 18:00

      for (let i = 0; i < maxAppts; i++) {
        const serviceId = pick(serviceWeights, rand) as string;
        const service = MOCK_SERVICE_TYPES.find(s => s.id === serviceId)!;
        const durationMin = service.durationHours * 60;

        // Redondear inicio al slot de 30 min más cercano
        const slotStart = Math.ceil(cursor / 30) * 30;
        const slotEnd = slotStart + durationMin;

        if (slotEnd > dayEnd) break; // No cabe en el día

        // Pequeña pausa entre turnos (0 o 30 min)
        const breakMin = rand() > 0.7 ? 30 : 0;

        const customerName = pick(CUSTOMER_NAMES, rand);
        const plate = pick(PLATES, rand);
        const notes = pick(NOTES_POOL, rand);

        // Estado según fecha
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

        appointments.push({
          id: `gen_${apptIdCounter++}`,
          date: dateStr,
          timeStart: toHHMM(slotStart),
          timeEnd: toHHMM(slotEnd),
          technicianId: tech.id,
          technician: tech,
          serviceTypeId: serviceId,
          serviceType: service,
          customerName,
          plate,
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

// ─── Exports ──────────────────────────────────────────────────────────────────

export const MOCK_APPOINTMENTS: Appointment[] = generateHistoricalAppointments();

export const MOCK_ABSENCES: Absence[] = [
  { id: 'ab1', technicianId: 't2', date: '2026-02-14', type: 'full' },
  { id: 'ab2', technicianId: 't3', date: '2026-02-14', type: 'full' },
  { id: 'ab3', technicianId: 't1', date: '2026-03-07', type: 'half' },
  { id: 'ab4', technicianId: 't2', date: '2026-03-20', type: 'full' },
  { id: 'ab5', technicianId: 't1', date: getTodayStr(2),  type: 'half' },
  { id: 'ab6', technicianId: 't3', date: getTodayStr(3),  type: 'full' },
];

export function getMockCapacity(date: string): TechnicianCapacity[] {
  const dayAppts = MOCK_APPOINTMENTS.filter(a => a.date === date && a.status !== 'cancelled');
  const absences = MOCK_ABSENCES.filter(a => a.date === date);

  return MOCK_TECHNICIANS.map(tech => {
    const usedHours = dayAppts
      .filter(a => a.technicianId === tech.id)
      .reduce((sum, a) => sum + a.serviceType.durationHours, 0);

    const absence = absences.find(a => a.technicianId === tech.id);
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const isSunday = dayOfWeek === 0;

    let availableHours: number;
    if (isSunday || absence?.type === 'full') {
      availableHours = 0;
    } else if (absence?.type === 'half' || absence?.type === 'holiday') {
      availableHours = tech.dailyHours / 2;
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
    };
  });
}

function getTodayStr(offsetDays: number): string {
  const d = new Date('2026-04-13T12:00:00');
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

export { getTodayStr };
