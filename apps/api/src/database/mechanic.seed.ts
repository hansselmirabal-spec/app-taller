import 'reflect-metadata';
import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://taller_user:taller_pass@localhost:5432/taller_db',
  entities: [__dirname + '/../**/*.entity.ts'],
  synchronize: false,
});

// ── Datos ─────────────────────────────────────────────────────────────────────

const WORKSHOP = {
  name: 'Taller Mecánico F1',
  address: 'Av. Eusebio Ayala 1245, Asunción',
  type: 'MECHANIC',
};

const TECHNICIANS = [
  { name: 'Carlos Rodríguez',  specialty: 'Motor/Caja',        dailyHours: 8, active: true  },
  { name: 'Miguel Benítez',    specialty: 'Motor/Caja',        dailyHours: 8, active: true  },
  { name: 'Luis Zárate',       specialty: 'Mecánica General',  dailyHours: 8, active: true  },
  { name: 'Jorge Acosta',      specialty: 'Mecánica General',  dailyHours: 8, active: true  },
  { name: 'Fernando Paredes',  specialty: 'Aire/S24',          dailyHours: 8, active: true  },
  { name: 'Diego Villalba',    specialty: 'Servicio Express',  dailyHours: 8, active: true  },
  { name: 'Pablo Núñez',       specialty: 'Diagnóstico',       dailyHours: 8, active: true  },
  { name: 'Rodrigo Cabrera',   specialty: 'Alineación',        dailyHours: 8, active: false },
];

const SERVICE_TYPES = [
  { name: 'Mantenimiento preventivo',  durationHours: 2.0, color: '#22c55e' },
  { name: 'Diagnóstico general',       durationHours: 1.0, color: '#8b5cf6' },
  { name: 'Cambio de aceite',          durationHours: 0.5, color: '#f59e0b' },
  { name: 'Alineación y balanceo',     durationHours: 1.5, color: '#3b82f6' },
  { name: 'Revisión de frenos',        durationHours: 2.0, color: '#ef4444' },
  { name: 'Servicio express',          durationHours: 0.5, color: '#06b6d4' },
];

// Semana 1: 2026-05-04 al 2026-05-08
// Semana 2: 2026-05-11 al 2026-05-15
// Semana 3: 2026-05-18 al 2026-05-22
const APPOINTMENTS_TEMPLATE = [
  // Semana 1
  { dayOffset: 0,  timeStart: '08:00', svcIdx: 0, techIdx: 0, customer: 'Juan Pérez',       plate: 'ABC 123', status: 'done'      },
  { dayOffset: 0,  timeStart: '10:30', svcIdx: 2, techIdx: 0, customer: 'Ana García',        plate: 'DEF 456', status: 'done'      },
  { dayOffset: 0,  timeStart: '08:00', svcIdx: 1, techIdx: 2, customer: 'Roberto Sosa',      plate: 'GHI 789', status: 'done'      },
  { dayOffset: 0,  timeStart: '08:00', svcIdx: 5, techIdx: 5, customer: 'Laura Mendoza',     plate: 'JKL 012', status: 'done'      },
  { dayOffset: 1,  timeStart: '08:00', svcIdx: 4, techIdx: 1, customer: 'Carlos Villalba',   plate: 'MNO 345', status: 'done'      },
  { dayOffset: 1,  timeStart: '10:30', svcIdx: 0, techIdx: 2, customer: 'Patricia Almada',   plate: 'PQR 678', status: 'cancelled' },
  { dayOffset: 1,  timeStart: '08:00', svcIdx: 3, techIdx: 6, customer: 'Diego Romero',      plate: 'STU 901', status: 'done'      },
  { dayOffset: 2,  timeStart: '08:00', svcIdx: 2, techIdx: 0, customer: 'Sofía Cabrera',     plate: 'VWX 234', status: 'done'      },
  { dayOffset: 2,  timeStart: '09:00', svcIdx: 5, techIdx: 5, customer: 'Marco Espínola',    plate: 'YZA 567', status: 'done'      },
  { dayOffset: 3,  timeStart: '08:00', svcIdx: 0, techIdx: 3, customer: 'Valeria Torres',    plate: 'BCD 890', status: 'done'      },
  { dayOffset: 3,  timeStart: '08:00', svcIdx: 1, techIdx: 6, customer: 'Nicolás Fleitas',   plate: 'EFG 123', status: 'cancelled' },
  { dayOffset: 4,  timeStart: '08:00', svcIdx: 4, techIdx: 1, customer: 'Sandra Vera',       plate: 'HIJ 456', status: 'done'      },
  { dayOffset: 4,  timeStart: '10:30', svcIdx: 2, techIdx: 4, customer: 'Gustavo Lezcano',   plate: 'KLM 789', status: 'done'      },
  // Semana 2
  { dayOffset: 7,  timeStart: '08:00', svcIdx: 0, techIdx: 0, customer: 'Marcela Ortiz',     plate: 'NOP 012', status: 'in_progress'},
  { dayOffset: 7,  timeStart: '08:00', svcIdx: 3, techIdx: 6, customer: 'Andrés Benítez',    plate: 'QRS 345', status: 'in_progress'},
  { dayOffset: 7,  timeStart: '08:30', svcIdx: 5, techIdx: 5, customer: 'Daniela Ruiz',      plate: 'TUV 678', status: 'scheduled' },
  { dayOffset: 8,  timeStart: '08:00', svcIdx: 1, techIdx: 2, customer: 'Fernando Giménez',  plate: 'WXY 901', status: 'scheduled' },
  { dayOffset: 8,  timeStart: '09:30', svcIdx: 4, techIdx: 1, customer: 'Cecilia Amarilla',  plate: 'ZAB 234', status: 'scheduled' },
  { dayOffset: 9,  timeStart: '08:00', svcIdx: 2, techIdx: 4, customer: 'Hugo Sánchez',      plate: 'CDE 567', status: 'scheduled' },
  { dayOffset: 9,  timeStart: '08:00', svcIdx: 0, techIdx: 3, customer: 'Elena Morinigo',    plate: 'FGH 890', status: 'scheduled' },
  { dayOffset: 10, timeStart: '08:00', svcIdx: 5, techIdx: 5, customer: 'Ricardo Báez',      plate: 'IJK 123', status: 'scheduled' },
  { dayOffset: 10, timeStart: '08:00', svcIdx: 1, techIdx: 6, customer: 'Claudia Insfrán',   plate: 'LMN 456', status: 'scheduled' },
  { dayOffset: 11, timeStart: '08:00', svcIdx: 3, techIdx: 0, customer: 'Óscar Ferreira',    plate: 'OPQ 789', status: 'scheduled' },
  // Semana 3
  { dayOffset: 14, timeStart: '08:00', svcIdx: 0, techIdx: 2, customer: 'Gloria Acuña',      plate: 'RST 012', status: 'scheduled' },
  { dayOffset: 15, timeStart: '08:00', svcIdx: 4, techIdx: 1, customer: 'Héctor Miranda',    plate: 'UVW 345', status: 'scheduled' },
];

const BASE_DATE = new Date('2026-05-04T12:00:00');

function addDays(d: Date, n: number): string {
  const result = new Date(d);
  result.setDate(d.getDate() + n);
  return result.toISOString().split('T')[0];
}

function addMinutes(time: string, durationHours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMin = h * 60 + m + Math.round(durationHours * 60);
  return `${Math.floor(totalMin / 60).toString().padStart(2, '0')}:${(totalMin % 60).toString().padStart(2, '0')}`;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // 1. Workshop
    console.log('Seeding workshop...');
    await qr.query(`
      INSERT INTO workshops (id, name, address, type, active)
      VALUES (gen_random_uuid(), $1, $2, $3, true)
      ON CONFLICT DO NOTHING
    `, [WORKSHOP.name, WORKSHOP.address, WORKSHOP.type]);

    const [ws] = await qr.query(`SELECT id FROM workshops WHERE name = $1`, [WORKSHOP.name]);
    const workshopId: string = ws.id;
    console.log(`  ✓ Workshop "${WORKSHOP.name}" (${workshopId})`);

    // 2. Técnicos
    console.log('Seeding technicians...');
    for (const tech of TECHNICIANS) {
      await qr.query(`
        INSERT INTO technicians (id, name, specialty, daily_hours, active, workshop_name)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [tech.name, tech.specialty, tech.dailyHours, tech.active, WORKSHOP.name]);
    }
    const techRows: { id: string; name: string }[] = await qr.query(
      `SELECT id, name FROM technicians WHERE workshop_name = $1 ORDER BY name`,
      [WORKSHOP.name],
    );
    const techByName = Object.fromEntries(techRows.map(t => [t.name, t.id]));
    console.log(`  ✓ ${techRows.length} técnicos`);

    // 3. Service Types
    console.log('Seeding service types...');
    for (const svc of SERVICE_TYPES) {
      await qr.query(`
        INSERT INTO service_types (id, name, duration_hours, color, active, workshop_id)
        SELECT gen_random_uuid(), $1::varchar, $2, $3, true, $5::varchar
        WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE name = $4::varchar AND workshop_id = $5::varchar)
      `, [svc.name, svc.durationHours, svc.color, svc.name, workshopId]);
    }
    const svcRows: { id: string; name: string; duration_hours: string }[] = await qr.query(
      `SELECT id, name, duration_hours FROM service_types WHERE name = ANY($1)`,
      [SERVICE_TYPES.map(s => s.name)],
    );
    const svcByName = Object.fromEntries(svcRows.map(s => [s.name, { id: s.id, durationHours: parseFloat(s.duration_hours) }]));
    console.log(`  ✓ ${svcRows.length} tipos de servicio`);

    // 4. Ausencias
    console.log('Seeding absences...');
    const techNames = Object.keys(techByName);
    const absences = [
      { techName: techNames[0], date: addDays(BASE_DATE, 9),  type: 'full'    }, // miércoles S2
      { techName: techNames[2], date: addDays(BASE_DATE, 7),  type: 'half'    }, // lunes S2
      { techName: techNames[4], date: addDays(BASE_DATE, 14), type: 'holiday' }, // lunes S3
    ];
    for (const abs of absences) {
      const techId = techByName[abs.techName];
      if (!techId) continue;
      await qr.query(`
        INSERT INTO technician_absences (id, technician_id, date, type)
        VALUES (gen_random_uuid(), $1, $2, $3)
        ON CONFLICT (technician_id, date) DO NOTHING
      `, [techId, abs.date, abs.type]);
    }
    console.log(`  ✓ ${absences.length} ausencias`);

    // 5. Appointments
    console.log('Seeding appointments...');
    const orderedTechs = TECHNICIANS.filter(t => t.active).map(t => techByName[t.name]).filter(Boolean);
    const orderedSvcs = SERVICE_TYPES.map(s => svcByName[s.name]).filter(Boolean);

    let created = 0;
    for (const tmpl of APPOINTMENTS_TEMPLATE) {
      const techId = orderedTechs[tmpl.techIdx % orderedTechs.length];
      const svc    = orderedSvcs[tmpl.svcIdx % orderedSvcs.length];
      if (!techId || !svc) continue;

      const date    = addDays(BASE_DATE, tmpl.dayOffset);
      const timeEnd = addMinutes(tmpl.timeStart, svc.durationHours);

      await qr.query(`
        INSERT INTO appointments
          (id, date, time_start, time_end, technician_id, service_type_id,
           customer_name, plate, status, created_by)
        VALUES
          (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'seed')
        ON CONFLICT DO NOTHING
      `, [date, tmpl.timeStart, timeEnd, techId, svc.id, tmpl.customer, tmpl.plate, tmpl.status]);
      created++;
    }
    console.log(`  ✓ ${created} turnos`);

    await qr.commitTransaction();
    console.log('\n✅ Mechanic seed complete');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
