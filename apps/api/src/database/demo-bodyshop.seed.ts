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
  name: 'Pintura & Chapería Luque',
  address: 'Ruta 2 Km 18, Luque',
  type: 'BODYSHOP',
};

const TECHNICIANS = [
  // Chapería
  { name: 'Francisco Delgado',  specialty: 'CHAPERIA', dailyHours: 8, active: true,  monthlyTarget: 160 },
  { name: 'Rubén Portillo',     specialty: 'CHAPERIA', dailyHours: 8, active: true,  monthlyTarget: 160 },
  { name: 'Mario Godoy',        specialty: 'CHAPERIA', dailyHours: 8, active: true,  monthlyTarget: 160 },
  { name: 'Valentín Arce',      specialty: 'CHAPERIA', dailyHours: 8, active: false, monthlyTarget: 160 },
  // Preparación
  { name: 'Estela Britez',      specialty: 'PREPARACION', dailyHours: 8, active: true,  monthlyTarget: 144 },
  { name: 'Diego Amarilla',     specialty: 'PREPARACION', dailyHours: 8, active: true,  monthlyTarget: 144 },
  { name: 'Ana Lucía Roa',      specialty: 'PREPARACION', dailyHours: 8, active: true,  monthlyTarget: 144 },
  // Pintura
  { name: 'Marcelo Sánchez',    specialty: 'PINTURA', dailyHours: 8, active: true,  monthlyTarget: 176 },
  { name: 'Liliana Cáceres',    specialty: 'PINTURA', dailyHours: 8, active: true,  monthlyTarget: 176 },
  { name: 'Ismael Zarza',       specialty: 'PINTURA', dailyHours: 8, active: true,  monthlyTarget: 176 },
  { name: 'Rodrigo Cantero',    specialty: 'PINTURA', dailyHours: 8, active: false, monthlyTarget: 176 },
];

const SPECIALTIES = ['CHAPERIA', 'PREPARACION', 'PINTURA'];

const WORK_TYPES = [
  { name: 'Retoque menor',           severity: 'LIGHT',    estimatedDays: 1, bodyworkHours: 4,  prepHours: 2,  paintHours: 3,  color: '#22c55e' },
  { name: 'Choque frontal leve',     severity: 'LIGHT',    estimatedDays: 2, bodyworkHours: 8,  prepHours: 4,  paintHours: 6,  color: '#86efac' },
  { name: 'Choque lateral medio',    severity: 'MEDIUM',   estimatedDays: 4, bodyworkHours: 16, prepHours: 8,  paintHours: 12, color: '#f59e0b' },
  { name: 'Choque trasero grave',    severity: 'HEAVY',    estimatedDays: 7, bodyworkHours: 28, prepHours: 14, paintHours: 20, color: '#ef4444' },
  { name: 'Siniestro total parcial', severity: 'MULTIPLE', estimatedDays: 10,bodyworkHours: 40, prepHours: 20, paintHours: 30, color: '#7c3aed' },
  { name: 'Pintura completa',        severity: 'MEDIUM',   estimatedDays: 3, bodyworkHours: 4,  prepHours: 6,  paintHours: 16, color: '#3b82f6' },
  { name: 'Abolladuras capot',       severity: 'LIGHT',    estimatedDays: 1, bodyworkHours: 6,  prepHours: 3,  paintHours: 4,  color: '#10b981' },
];

// Base: hace 3 semanas, lunes
const BASE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 21);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
})();

function addDays(d: Date, n: number): string {
  const r = new Date(d); r.setDate(d.getDate() + n);
  return r.toISOString().split('T')[0];
}

// Entradas: [ día, wtIdx, cliente, placa, stayDays, canal, estado, [BODYWORK_techIdx, PREP_techIdx, PAINT_techIdx] ]
type EntryTmpl = {
  day: number; wt: number; name: string; plate: string; stay: number;
  channel: 'walk_in' | 'phone' | 'online' | 'insurance';
  status: 'scheduled' | 'in_progress' | 'done' | 'cancelled';
  techs: [number, number, number]; // índice en activos por proceso
};

const ENTRIES: EntryTmpl[] = [
  // ─── Semana 1 — todo done ─────────────────────────────────────────────
  { day:  0, wt: 0, name: 'Ariel Sosa',       plate: 'BA 001', stay: 1, channel: 'walk_in',   status: 'done', techs: [0,0,0] },
  { day:  0, wt: 1, name: 'Karina López',     plate: 'BA 002', stay: 2, channel: 'phone',     status: 'done', techs: [1,1,1] },
  { day:  0, wt: 6, name: 'Marco Fleitas',    plate: 'BA 003', stay: 1, channel: 'insurance', status: 'done', techs: [2,2,2] },
  { day:  1, wt: 2, name: 'Verónica Ruiz',    plate: 'BA 004', stay: 4, channel: 'insurance', status: 'done', techs: [0,0,1] },
  { day:  1, wt: 5, name: 'Jorge Cano',       plate: 'BA 005', stay: 3, channel: 'walk_in',   status: 'done', techs: [1,1,2] },
  { day:  2, wt: 0, name: 'Silvia Acosta',    plate: 'BA 006', stay: 1, channel: 'online',    status: 'done', techs: [2,2,0] },
  { day:  2, wt: 3, name: 'Ernesto Meza',     plate: 'BA 007', stay: 7, channel: 'insurance', status: 'done', techs: [0,1,1] },
  { day:  3, wt: 1, name: 'Patricia Ibáñez',  plate: 'BA 008', stay: 2, channel: 'phone',     status: 'done', techs: [1,2,2] },
  { day:  3, wt: 6, name: 'Diego Rojas',      plate: 'BA 009', stay: 1, channel: 'walk_in',   status: 'done', techs: [2,0,0] },
  { day:  4, wt: 0, name: 'Claudia Benítez',  plate: 'BA 010', stay: 1, channel: 'phone',     status: 'done', techs: [0,1,1] },
  { day:  4, wt: 5, name: 'Héctor Villalba',  plate: 'BA 011', stay: 3, channel: 'insurance', status: 'done', techs: [1,2,2] },
  // ─── Semana 2 — mix done/in_progress ─────────────────────────────────
  { day:  7, wt: 1, name: 'Natalia Torres',   plate: 'BA 012', stay: 2, channel: 'walk_in',   status: 'done', techs: [2,0,0] },
  { day:  7, wt: 2, name: 'Roberto Acuña',    plate: 'BA 013', stay: 4, channel: 'insurance', status: 'done', techs: [0,1,1] },
  { day:  7, wt: 6, name: 'Sandra Gaona',     plate: 'BA 014', stay: 1, channel: 'online',    status: 'done', techs: [1,2,2] },
  { day:  8, wt: 0, name: 'Oscar Méndez',     plate: 'BA 015', stay: 1, channel: 'phone',     status: 'done', techs: [2,0,0] },
  { day:  8, wt: 3, name: 'Rosa Ferreira',    plate: 'BA 016', stay: 7, channel: 'insurance', status: 'done', techs: [0,1,2] },
  { day:  8, wt: 4, name: 'Daniel Cáceres',   plate: 'BA 017', stay:10, channel: 'insurance', status: 'done', techs: [1,2,0] },
  { day:  9, wt: 1, name: 'Alicia Soria',     plate: 'BA 018', stay: 2, channel: 'walk_in',   status: 'done', techs: [2,0,1] },
  { day:  9, wt: 5, name: 'Manuel Cardozo',   plate: 'BA 019', stay: 3, channel: 'phone',     status: 'done', techs: [0,1,2] },
  { day: 10, wt: 0, name: 'Estela Miranda',   plate: 'BA 020', stay: 1, channel: 'online',    status: 'done', techs: [1,2,0] },
  { day: 10, wt: 2, name: 'Fabio Lezcano',    plate: 'BA 021', stay: 4, channel: 'insurance', status: 'done', techs: [2,0,1] },
  { day: 11, wt: 6, name: 'Graciela Insfrán', plate: 'BA 022', stay: 1, channel: 'walk_in',   status: 'done', techs: [0,1,2] },
  { day: 11, wt: 1, name: 'Luis Portillo',    plate: 'BA 023', stay: 2, channel: 'phone',     status: 'in_progress', techs: [1,2,0] },
  { day: 11, wt: 3, name: 'Viviana Godoy',    plate: 'BA 024', stay: 7, channel: 'insurance', status: 'in_progress', techs: [2,0,1] },
  // ─── Semana 3 — mix in_progress/scheduled ─────────────────────────────
  { day: 14, wt: 1, name: 'Teodoro Almada',   plate: 'BA 025', stay: 2, channel: 'walk_in',   status: 'in_progress', techs: [0,1,2] },
  { day: 14, wt: 5, name: 'Norma Martínez',   plate: 'BA 026', stay: 3, channel: 'insurance', status: 'in_progress', techs: [1,2,0] },
  { day: 14, wt: 2, name: 'Camilo Roa',       plate: 'BA 027', stay: 4, channel: 'online',    status: 'in_progress', techs: [2,0,1] },
  { day: 15, wt: 0, name: 'Leticia Cruz',     plate: 'BA 028', stay: 1, channel: 'phone',     status: 'scheduled',   techs: [0,2,2] },
  { day: 15, wt: 6, name: 'Boris Espínola',   plate: 'BA 029', stay: 1, channel: 'walk_in',   status: 'scheduled',   techs: [1,0,0] },
  { day: 15, wt: 3, name: 'Aurora Sánchez',   plate: 'BA 030', stay: 7, channel: 'insurance', status: 'scheduled',   techs: [2,1,1] },
  { day: 16, wt: 1, name: 'Gonzalo Núñez',    plate: 'BA 031', stay: 2, channel: 'online',    status: 'scheduled',   techs: [0,2,2] },
  { day: 16, wt: 5, name: 'Sofía Medina',     plate: 'BA 032', stay: 3, channel: 'phone',     status: 'scheduled',   techs: [1,0,0] },
  { day: 17, wt: 2, name: 'Facundo Peña',     plate: 'BA 033', stay: 4, channel: 'insurance', status: 'scheduled',   techs: [2,1,1] },
  { day: 17, wt: 0, name: 'Renata López',     plate: 'BA 034', stay: 1, channel: 'walk_in',   status: 'scheduled',   techs: [0,2,2] },
  { day: 18, wt: 4, name: 'Sebastián Vera',   plate: 'BA 035', stay:10, channel: 'insurance', status: 'scheduled',   techs: [1,0,1] },
  { day: 18, wt: 6, name: 'Miriam Sotelo',    plate: 'BA 036', stay: 1, channel: 'phone',     status: 'scheduled',   techs: [2,1,2] },
  // ─── Cancelados ────────────────────────────────────────────────────────
  { day:  5, wt: 0, name: 'Alfredo Benítez',  plate: 'BA 037', stay: 1, channel: 'walk_in',   status: 'cancelled', techs: [0,0,0] },
  { day: 12, wt: 1, name: 'Luisa Paredes',    plate: 'BA 038', stay: 2, channel: 'phone',     status: 'cancelled', techs: [1,1,1] },
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
      `INSERT INTO workshops (id, name, address, type, active)
       VALUES (gen_random_uuid(), $1, $2, $3, true) ON CONFLICT DO NOTHING`,
      [WORKSHOP.name, WORKSHOP.address, WORKSHOP.type],
    );
    const [ws] = await qr.query(`SELECT id FROM workshops WHERE name = $1`, [WORKSHOP.name]);
    const wsId: string = ws.id;
    console.log(`✓ Workshop "${WORKSHOP.name}" (${wsId})`);

    // Workshop config: processSpecialtyIds
    await qr.query(
      `UPDATE workshops SET config = $1 WHERE id = $2`,
      [JSON.stringify({ processSpecialtyIds: { BODYWORK: ['CHAPERIA'], PREP: ['PREPARACION'], PAINT: ['PINTURA'] } }), wsId],
    );
    console.log(`✓ Workshop config seteado`);

    // 2. Técnicos
    for (const t of TECHNICIANS) {
      await qr.query(
        `INSERT INTO technicians (id, name, specialty, daily_hours, active, workshop_name, monthly_target_hours)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [t.name, t.specialty, t.dailyHours, t.active, WORKSHOP.name, t.monthlyTarget],
      );
    }
    const techRows: { id: string; name: string; specialty: string }[] = await qr.query(
      `SELECT id, name, specialty FROM technicians WHERE workshop_name = $1 ORDER BY name`,
      [WORKSHOP.name],
    );
    const techByName = Object.fromEntries(techRows.map(t => [t.name, t.id]));

    const byProc: Record<string, string[]> = { CHAPERIA: [], PREPARACION: [], PINTURA: [] };
    for (const t of TECHNICIANS.filter(t => t.active)) {
      byProc[t.specialty]?.push(techByName[t.name]);
    }
    console.log(`✓ ${techRows.length} técnicos | CHAPERIA:${byProc.CHAPERIA.length} PREP:${byProc.PREPARACION.length} PINTURA:${byProc.PINTURA.length}`);

    // 3. Specialties
    for (const sp of SPECIALTIES) {
      await qr.query(
        `INSERT INTO specialties (id, name, workshop_id)
         SELECT gen_random_uuid(), $1::varchar, $2::varchar WHERE NOT EXISTS
         (SELECT 1 FROM specialties WHERE name = $3::varchar AND workshop_id = $4::varchar)`,
        [sp, wsId, sp, wsId],
      );
    }
    console.log(`✓ ${SPECIALTIES.length} especialidades`);

    // 4. Work types
    for (const wt of WORK_TYPES) {
      await qr.query(
        `INSERT INTO work_types (id, workshop_id, name, severity, estimated_days,
          bodywork_hours, prep_hours, paint_hours, color, active)
         SELECT gen_random_uuid(), $1::varchar, $2::varchar, $3::varchar, $4, $5, $6, $7, $8::varchar, true
         WHERE NOT EXISTS (SELECT 1 FROM work_types WHERE name = $9::varchar AND workshop_id = $10::varchar)`,
        [wsId, wt.name, wt.severity, wt.estimatedDays, wt.bodyworkHours, wt.prepHours, wt.paintHours, wt.color, wt.name, wsId],
      );
    }
    const wtRows: { id: string; name: string; bodywork_hours: string; prep_hours: string; paint_hours: string }[] =
      await qr.query(`SELECT id, name, bodywork_hours, prep_hours, paint_hours FROM work_types WHERE workshop_id = $1`, [wsId]);
    const wtByName = Object.fromEntries(wtRows.map(w => [w.name, w]));
    const wtList = WORK_TYPES.map(w => wtByName[w.name]).filter(Boolean);
    console.log(`✓ ${wtRows.length} tipos de trabajo`);

    // 5. Ausencias
    const absenceTemplates = [
      { techName: byProc.CHAPERIA[0],     doff:  2, type: 'full'    },
      { techName: byProc.PREPARACION[1],  doff: 10, type: 'half'    },
      { techName: byProc.PINTURA[2],      doff: 18, type: 'holiday' },
      { techName: byProc.CHAPERIA[1],     doff:  9, type: 'full'    },
      { techName: byProc.PREPARACION[0],  doff: 17, type: 'half'    },
    ];
    let absCreated = 0;
    for (const ab of absenceTemplates) {
      if (!ab.techName) continue;
      await qr.query(
        `INSERT INTO technician_absences (id, technician_id, date, type)
         VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT (technician_id, date) DO NOTHING`,
        [ab.techName, addDays(BASE, ab.doff), ab.type],
      );
      absCreated++;
    }
    console.log(`✓ ${absCreated} ausencias`);

    // 6. Bodyshop entries + process techs
    let eCreated = 0;
    for (const tmpl of ENTRIES) {
      const wt = wtList[tmpl.wt % wtList.length];
      if (!wt) continue;
      const date = addDays(BASE, tmpl.day);

      const [entry] = await qr.query(
        `INSERT INTO bodyshop_entries
           (id, workshop_id, date, work_type_id, customer_name, plate, status,
            bodywork_hours, prep_hours, paint_hours, stay_days, channel, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'seed')
         ON CONFLICT DO NOTHING RETURNING id`,
        [wsId, date, wt.id, tmpl.name, tmpl.plate, tmpl.status,
         parseFloat(wt.bodywork_hours), parseFloat(wt.prep_hours), parseFloat(wt.paint_hours),
         tmpl.stay, tmpl.channel],
      );
      if (!entry) continue;
      eCreated++;

      const [bwTech, prTech, paTech] = [
        byProc.CHAPERIA[tmpl.techs[0] % (byProc.CHAPERIA.length || 1)],
        byProc.PREPARACION[tmpl.techs[1] % (byProc.PREPARACION.length || 1)],
        byProc.PINTURA[tmpl.techs[2] % (byProc.PINTURA.length || 1)],
      ];

      for (const [proc, tid] of [['BODYWORK', bwTech], ['PREP', prTech], ['PAINT', paTech]] as [string, string][]) {
        if (!tid) continue;
        await qr.query(
          `INSERT INTO bodyshop_process_techs (id, entry_id, process, technician_id)
           VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT (entry_id, process) DO NOTHING`,
          [entry.id, proc, tid],
        );
      }
    }
    console.log(`✓ ${eCreated} ingresos bodyshop con asignaciones`);

    await qr.commitTransaction();
    console.log(`\n✅ Demo bodyshop completo → "${WORKSHOP.name}"`);
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
