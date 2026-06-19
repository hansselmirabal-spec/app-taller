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
  name: 'Chapería & Pintura Express',
  address: 'Ruta Mariscal Estigarribia 3320, Fernando de la Mora',
  type: 'BODYSHOP',
};

// Especialidades reconocidas por el frontend:
// CHAPERIA / PREPARACION / PINTURA
const TECHNICIANS = [
  // Chapería
  { name: 'Alejandro Vera',      specialty: 'CHAPERIA',    dailyHours: 8, active: true,  box: 'BOX-A' },
  { name: 'Cristian Meza',       specialty: 'CHAPERIA',    dailyHours: 8, active: true,  box: 'BOX-A' },
  { name: 'Marcelo Bogado',      specialty: 'CHAPERIA',    dailyHours: 8, active: true,  box: 'BOX-B' },
  { name: 'Sebastián Ortiz',     specialty: 'CHAPERIA',    dailyHours: 8, active: true,  box: 'BOX-B' },
  // Preparación
  { name: 'Gustavo Fleitas',     specialty: 'PREPARACION', dailyHours: 8, active: true,  box: 'BOX-C' },
  { name: 'Raúl Insfrán',        specialty: 'PREPARACION', dailyHours: 8, active: true,  box: 'BOX-C' },
  { name: 'Walter Benítez',      specialty: 'PREPARACION', dailyHours: 8, active: false, box: null    },
  // Pintura
  { name: 'Héctor Amarilla',     specialty: 'PINTURA',     dailyHours: 8, active: true,  box: 'BOX-D' },
  { name: 'Julio Giménez',       specialty: 'PINTURA',     dailyHours: 8, active: true,  box: 'BOX-D' },
  { name: 'Eduardo Villalba',    specialty: 'PINTURA',     dailyHours: 8, active: true,  box: 'BOX-E' },
];

// Semana base: 2026-05-04 (lunes)
const BASE_DATE = new Date('2026-05-04T12:00:00');

function addDays(d: Date, n: number): string {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r.toISOString().split('T')[0];
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
    const existing = await qr.query(
      `SELECT id FROM workshops WHERE name = $1`, [WORKSHOP.name],
    );
    if (existing.length) {
      console.log(`  ⚠  Workshop "${WORKSHOP.name}" ya existe, se omite.`);
    } else {
      await qr.query(`
        INSERT INTO workshops (id, name, address, type, active)
        VALUES (gen_random_uuid(), $1, $2, $3, true)
      `, [WORKSHOP.name, WORKSHOP.address, WORKSHOP.type]);
    }
    const [ws] = await qr.query(`SELECT id FROM workshops WHERE name = $1`, [WORKSHOP.name]);
    console.log(`  ✓ Workshop "${WORKSHOP.name}" (${ws.id})`);

    // 2. Técnicos
    console.log('Seeding technicians...');
    let techCreated = 0;
    for (const tech of TECHNICIANS) {
      const dup = await qr.query(
        `SELECT id FROM technicians WHERE name = $1 AND workshop_name = $2`,
        [tech.name, WORKSHOP.name],
      );
      if (dup.length) continue;
      await qr.query(`
        INSERT INTO technicians (id, name, specialty, daily_hours, active, workshop_name, box)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
      `, [tech.name, tech.specialty, tech.dailyHours, tech.active, WORKSHOP.name, tech.box]);
      techCreated++;
    }
    const techRows: { id: string; name: string; specialty: string }[] = await qr.query(
      `SELECT id, name, specialty FROM technicians WHERE workshop_name = $1 ORDER BY specialty, name`,
      [WORKSHOP.name],
    );
    console.log(`  ✓ ${techCreated} técnicos creados (${techRows.length} total en taller)`);

    // 3. Ausencias representativas
    console.log('Seeding absences...');
    const bySpecialty = (sp: string) => techRows.filter(t => t.specialty === sp);
    const chaps = bySpecialty('CHAPERIA');
    const preps = bySpecialty('PREPARACION');
    const paints = bySpecialty('PINTURA');

    const absences = [
      // Chapero con ausencia full semana 1 viernes
      chaps[0] && { techId: chaps[0].id, date: addDays(BASE_DATE, 4),  type: 'full'    },
      // Preparador con media jornada semana 2 lunes
      preps[0] && { techId: preps[0].id, date: addDays(BASE_DATE, 7),  type: 'half'    },
      // Pintor con feriado semana 2 miércoles
      paints[0] && { techId: paints[0].id, date: addDays(BASE_DATE, 9), type: 'holiday' },
      // Segundo chapero ausencia full semana 3 lunes
      chaps[1] && { techId: chaps[1].id, date: addDays(BASE_DATE, 14), type: 'full'    },
    ].filter(Boolean) as { techId: string; date: string; type: string }[];

    let absCreated = 0;
    for (const abs of absences) {
      const dup = await qr.query(
        `SELECT id FROM technician_absences WHERE technician_id = $1 AND date = $2`,
        [abs.techId, abs.date],
      );
      if (dup.length) continue;
      await qr.query(`
        INSERT INTO technician_absences (id, technician_id, date, type)
        VALUES (gen_random_uuid(), $1, $2, $3)
      `, [abs.techId, abs.date, abs.type]);
      absCreated++;
    }
    console.log(`  ✓ ${absCreated} ausencias`);

    await qr.commitTransaction();
    console.log('\n✅ Bodyshop workshop seed complete');
    console.log('\nTécnicos por especialidad:');
    for (const sp of ['CHAPERIA', 'PREPARACION', 'PINTURA']) {
      const list = techRows.filter(t => t.specialty === sp).map(t => `  • ${t.name}`).join('\n');
      console.log(`  ${sp}:\n${list}`);
    }
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
