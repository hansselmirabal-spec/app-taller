import 'reflect-metadata';
import { DataSource } from 'typeorm';

const DS = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://taller_user:taller_pass@localhost:5432/taller_db',
  entities: [__dirname + '/../**/*.entity.ts'],
  synchronize: false,
});

// ─── Configuración ─────────────────────────────────────────────────────────

const WORKSHOP = {
  name: 'Taller Automotriz San Lorenzo',
  address: 'Av. Mcal. López 4450, San Lorenzo',
  type: 'MECHANIC',
};

const TECHNICIANS = [
  { name: 'Rodrigo Espínola',  specialty: 'Motor',           dailyHours: 8, active: true  },
  { name: 'Natalia Ríos',      specialty: 'Motor',           dailyHours: 8, active: true  },
  { name: 'Javier Coronel',    specialty: 'Frenos/Suspensión', dailyHours: 8, active: true  },
  { name: 'Silvia Benítez',    specialty: 'Frenos/Suspensión', dailyHours: 8, active: true  },
  { name: 'Gustavo Medina',    specialty: 'Electricidad',    dailyHours: 8, active: true  },
  { name: 'Patricia Sotelo',   specialty: 'Electricidad',    dailyHours: 8, active: true  },
  { name: 'Omar Villalba',     specialty: 'Aire/Diagnóstico', dailyHours: 8, active: true  },
  { name: 'Luz Marina Fleitas', specialty: 'Express',        dailyHours: 8, active: true  },
  { name: 'Raúl Carballo',     specialty: 'Express',         dailyHours: 8, active: false }, // inactivo
];

const SERVICE_TYPES = [
  { name: 'Mantenimiento 5.000km',   durationHours: 1.0, color: '#22c55e' },
  { name: 'Reparación de motor',     durationHours: 4.0, color: '#ef4444' },
  { name: 'Revisión de frenos',      durationHours: 1.5, color: '#f97316' },
  { name: 'Diagnóstico eléctrico',   durationHours: 1.0, color: '#8b5cf6' },
  { name: 'Cambio de correa',        durationHours: 3.0, color: '#3b82f6' },
  { name: 'Cambio de aceite express', durationHours: 0.5, color: '#06b6d4' },
  { name: 'Revisión de suspensión',  durationHours: 2.0, color: '#f59e0b' },
];

// Base: primer lunes disponible relativo a hoy
const BASE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 14); // 2 semanas atrás
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
})();

function addDays(d: Date, n: number): string {
  const r = new Date(d); r.setDate(d.getDate() + n);
  return r.toISOString().split('T')[0];
}

function timeEnd(start: string, hours: number): string {
  const [h, m] = start.split(':').map(Number);
  const tot = h * 60 + m + Math.round(hours * 60);
  return `${Math.floor(tot / 60).toString().padStart(2, '0')}:${(tot % 60).toString().padStart(2, '0')}`;
}

// t=techIdx, s=svcIdx, todos los índices son de los arrays ACTIVOS
const APPOINTMENTS: Array<{
  day: number; time: string; t: number; s: number; name: string; plate: string;
  status: 'done' | 'cancelled' | 'in_progress' | 'scheduled';
}> = [
  // ─── Semana 1 (pasado, todos done/cancelled) ───────────────────────────
  { day: 0, time: '08:00', t: 0, s: 0, name: 'Carlos Gómez',     plate: 'ABC 001', status: 'done'      },
  { day: 0, time: '09:30', t: 0, s: 2, name: 'Rosa Amarilla',    plate: 'ABD 002', status: 'done'      },
  { day: 0, time: '08:00', t: 2, s: 2, name: 'Daniel Ortega',    plate: 'ABE 003', status: 'done'      },
  { day: 0, time: '10:00', t: 2, s: 6, name: 'Cecilia Vera',     plate: 'ABF 004', status: 'done'      },
  { day: 0, time: '08:00', t: 4, s: 3, name: 'Marcos Giménez',   plate: 'ABG 005', status: 'done'      },
  { day: 0, time: '09:00', t: 7, s: 5, name: 'Lorena Sosa',      plate: 'ABH 006', status: 'done'      },
  { day: 1, time: '08:00', t: 1, s: 1, name: 'Pedro Malgarejo',  plate: 'ABI 007', status: 'done'      },
  { day: 1, time: '08:00', t: 3, s: 6, name: 'Ana Paredes',      plate: 'ABJ 008', status: 'done'      },
  { day: 1, time: '10:30', t: 3, s: 0, name: 'Luis Sánchez',     plate: 'ABK 009', status: 'cancelled' },
  { day: 1, time: '08:00', t: 5, s: 3, name: 'Elena Torres',     plate: 'ABL 010', status: 'done'      },
  { day: 1, time: '09:30', t: 6, s: 0, name: 'Hugo Ferreira',    plate: 'ABM 011', status: 'done'      },
  { day: 2, time: '08:00', t: 0, s: 4, name: 'Sandra Núñez',     plate: 'ABN 012', status: 'done'      },
  { day: 2, time: '08:00', t: 2, s: 0, name: 'Ricardo Lezcano',  plate: 'ABO 013', status: 'done'      },
  { day: 2, time: '08:00', t: 7, s: 5, name: 'Claudia Almada',   plate: 'ABP 014', status: 'done'      },
  { day: 3, time: '08:00', t: 1, s: 1, name: 'Osvaldo Acuña',    plate: 'ABQ 015', status: 'done'      },
  { day: 3, time: '08:00', t: 4, s: 3, name: 'Mirta Báez',       plate: 'ABR 016', status: 'done'      },
  { day: 3, time: '09:00', t: 6, s: 0, name: 'Óscar Morínigo',   plate: 'ABS 017', status: 'done'      },
  { day: 4, time: '08:00', t: 0, s: 2, name: 'Viviana Ruiz',     plate: 'ABT 018', status: 'done'      },
  { day: 4, time: '10:00', t: 3, s: 0, name: 'Andrés Insfrán',   plate: 'ABU 019', status: 'done'      },
  { day: 4, time: '08:00', t: 5, s: 3, name: 'Gloria Cabrera',   plate: 'ABV 020', status: 'done'      },
  // ─── Semana 2 (pasado reciente, done/in_progress) ──────────────────────
  { day: 7,  time: '08:00', t: 0, s: 1, name: 'Fabián Meza',      plate: 'ABW 021', status: 'done'        },
  { day: 7,  time: '08:00', t: 2, s: 6, name: 'Alicia Rojas',     plate: 'ABX 022', status: 'done'        },
  { day: 7,  time: '08:00', t: 4, s: 3, name: 'Ignacio Pereira',  plate: 'ABY 023', status: 'done'        },
  { day: 7,  time: '09:00', t: 7, s: 5, name: 'Carmen Valdez',    plate: 'ABZ 024', status: 'done'        },
  { day: 8,  time: '08:00', t: 1, s: 4, name: 'Néstor Britez',    plate: 'ACA 025', status: 'done'        },
  { day: 8,  time: '08:00', t: 3, s: 2, name: 'Ramona Gaona',     plate: 'ACB 026', status: 'done'        },
  { day: 8,  time: '08:00', t: 5, s: 3, name: 'Walter Mendoza',   plate: 'ACC 027', status: 'done'        },
  { day: 9,  time: '08:00', t: 0, s: 0, name: 'Teresa Paniagua',  plate: 'ACD 028', status: 'done'        },
  { day: 9,  time: '08:00', t: 6, s: 3, name: 'Blas Domínguez',   plate: 'ACE 029', status: 'done'        },
  { day: 10, time: '08:00', t: 2, s: 1, name: 'Mónica Jara',      plate: 'ACF 030', status: 'done'        },
  { day: 10, time: '08:00', t: 4, s: 3, name: 'Ernesto López',    plate: 'ACG 031', status: 'done'        },
  { day: 10, time: '09:00', t: 7, s: 5, name: 'Delia Acosta',     plate: 'ACH 032', status: 'done'        },
  { day: 11, time: '08:00', t: 1, s: 4, name: 'Victorino Meza',   plate: 'ACI 033', status: 'in_progress' },
  { day: 11, time: '08:00', t: 3, s: 6, name: 'Rosalba Cáceres',  plate: 'ACJ 034', status: 'in_progress' },
  { day: 11, time: '08:00', t: 5, s: 0, name: 'Adolfo Cardozo',   plate: 'ACK 035', status: 'in_progress' },
  // ─── Semana 3 (futuro, scheduled) ─────────────────────────────────────
  { day: 14, time: '08:00', t: 0, s: 0, name: 'Graciela Ruiz',    plate: 'ACL 036', status: 'scheduled'   },
  { day: 14, time: '08:00', t: 2, s: 2, name: 'Simón Torres',     plate: 'ACM 037', status: 'scheduled'   },
  { day: 14, time: '08:00', t: 4, s: 3, name: 'Beatriz Solís',    plate: 'ACN 038', status: 'scheduled'   },
  { day: 14, time: '09:00', t: 7, s: 5, name: 'Jonás Vera',       plate: 'ACO 039', status: 'scheduled'   },
  { day: 15, time: '08:00', t: 1, s: 1, name: 'Celia Gaona',      plate: 'ACP 040', status: 'scheduled'   },
  { day: 15, time: '08:00', t: 3, s: 6, name: 'Ismael Cabañas',   plate: 'ACQ 041', status: 'scheduled'   },
  { day: 15, time: '09:00', t: 5, s: 0, name: 'Débora Fleitas',   plate: 'ACR 042', status: 'scheduled'   },
  { day: 16, time: '08:00', t: 0, s: 4, name: 'Mauricio Peña',    plate: 'ACS 043', status: 'scheduled'   },
  { day: 16, time: '08:00', t: 6, s: 3, name: 'Lourdes Martínez', plate: 'ACT 044', status: 'scheduled'   },
  { day: 17, time: '08:00', t: 2, s: 0, name: 'Fermín Álvarez',   plate: 'ACU 045', status: 'scheduled'   },
  { day: 17, time: '08:00', t: 4, s: 3, name: 'Norma Chaparro',   plate: 'ACV 046', status: 'scheduled'   },
  { day: 18, time: '08:00', t: 1, s: 1, name: 'Rubén Acuña',      plate: 'ACW 047', status: 'scheduled'   },
  { day: 18, time: '09:00', t: 7, s: 5, name: 'Ida Ortega',       plate: 'ACX 048', status: 'scheduled'   },
];

// ─── Seed ──────────────────────────────────────────────────────────────────

async function seed() {
  await DS.initialize();
  const qr = DS.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // 1. Workshop
    await qr.query(
      `INSERT INTO workshops (id, name, address, type, active) VALUES (gen_random_uuid(), $1, $2, $3, true) ON CONFLICT DO NOTHING`,
      [WORKSHOP.name, WORKSHOP.address, WORKSHOP.type],
    );
    const [ws] = await qr.query(`SELECT id FROM workshops WHERE name = $1`, [WORKSHOP.name]);
    const wsId: string = ws.id;
    console.log(`✓ Workshop "${WORKSHOP.name}" (${wsId})`);

    // 2. Técnicos
    for (const t of TECHNICIANS) {
      await qr.query(
        `INSERT INTO technicians (id, name, specialty, daily_hours, active, workshop_name)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [t.name, t.specialty, t.dailyHours, t.active, WORKSHOP.name],
      );
    }
    const techRows: { id: string; name: string }[] = await qr.query(
      `SELECT id, name FROM technicians WHERE workshop_name = $1 ORDER BY name`,
      [WORKSHOP.name],
    );
    const techById = Object.fromEntries(techRows.map(t => [t.name, t.id]));
    const activeTechs = TECHNICIANS.filter(t => t.active).map(t => techById[t.name]).filter(Boolean);
    console.log(`✓ ${techRows.length} técnicos (${activeTechs.length} activos)`);

    // 3. Service types
    for (const s of SERVICE_TYPES) {
      await qr.query(
        `INSERT INTO service_types (id, name, duration_hours, color, active, workshop_id)
         SELECT gen_random_uuid(), $1::varchar, $2, $3, true, $5::varchar
         WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE name = $4::varchar AND workshop_id = $5::varchar)`,
        [s.name, s.durationHours, s.color, s.name, wsId],
      );
    }
    const svcRows: { id: string; name: string; duration_hours: string }[] = await qr.query(
      `SELECT id, name, duration_hours FROM service_types WHERE workshop_id = $1`, [wsId],
    );
    const svcByName = Object.fromEntries(
      svcRows.map(s => [s.name, { id: s.id, durationHours: parseFloat(s.duration_hours) }]),
    );
    const svcList = SERVICE_TYPES.map(s => svcByName[s.name]).filter(Boolean);
    console.log(`✓ ${svcRows.length} tipos de servicio`);

    // 4. Ausencias
    const absences = [
      { name: activeTechs[0] && techRows.find(t => t.id === activeTechs[0])?.name, idx: 0, doff: 2,  type: 'full'    },
      { name: activeTechs[2] && techRows.find(t => t.id === activeTechs[2])?.name, idx: 2, doff: 9,  type: 'half'    },
      { name: activeTechs[4] && techRows.find(t => t.id === activeTechs[4])?.name, idx: 4, doff: 16, type: 'holiday' },
      { name: activeTechs[1] && techRows.find(t => t.id === activeTechs[1])?.name, idx: 1, doff: 3,  type: 'full'    },
    ];
    for (const ab of absences) {
      const tid = activeTechs[ab.idx];
      if (!tid) continue;
      await qr.query(
        `INSERT INTO technician_absences (id, technician_id, date, type)
         VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT (technician_id, date) DO NOTHING`,
        [tid, addDays(BASE_DATE, ab.doff), ab.type],
      );
    }
    console.log(`✓ ${absences.length} ausencias`);

    // 5. Turnos
    let created = 0;
    for (const appt of APPOINTMENTS) {
      const techId = activeTechs[appt.t % activeTechs.length];
      const svc    = svcList[appt.s % svcList.length];
      if (!techId || !svc) continue;
      const date = addDays(BASE_DATE, appt.day);
      const end  = timeEnd(appt.time, svc.durationHours);
      await qr.query(
        `INSERT INTO appointments
           (id, date, time_start, time_end, technician_id, service_type_id,
            customer_name, plate, status, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'seed')
         ON CONFLICT DO NOTHING`,
        [date, appt.time, end, techId, svc.id, appt.name, appt.plate, appt.status],
      );
      created++;
    }
    console.log(`✓ ${created} turnos`);

    await qr.commitTransaction();
    console.log(`\n✅ Demo mecánico completo → "${WORKSHOP.name}"`);
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('❌', err);
    throw err;
  } finally {
    await qr.release();
    await DS.destroy();
  }
}

seed().catch(e => { console.error(e); process.exit(1); });
