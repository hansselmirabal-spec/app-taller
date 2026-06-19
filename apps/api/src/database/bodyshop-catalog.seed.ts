import 'reflect-metadata';
import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://taller_user:taller_pass@localhost:5432/taller_db',
  entities: [__dirname + '/../**/*.entity.ts'],
  synchronize: process.env.NODE_ENV !== 'production',
});

// ── Datos ────────────────────────────────────────────────────────────────────

const GROUPS = [
  { code: '40', label: 'Ruedas, llantas y componentes asociados' },
  { code: '61', label: 'Elementos estructurales inferiores' },
  { code: '62', label: 'Componentes de frente del vehículo' },
  { code: '63', label: 'Laterales de carrocería' },
  { code: '64', label: 'Componentes de sección trasera' },
  { code: '65', label: 'Panel y estructura de techo' },
  { code: '72', label: 'Puertas y subconjuntos' },
  { code: '88', label: 'Molduras y piezas externas' },
  { code: '98', label: 'Operaciones generales de pintura' },
];

const PROCESSES = [
  { code: '00', label: 'Sin proceso',     order: 0  },
  { code: '05', label: 'Parcial desarmar', order: 5  },
  { code: '10', label: 'Reparar',          order: 10 },
  { code: '15', label: 'Renovar',          order: 15 },
  { code: '20', label: 'Preparación',      order: 20 },
  { code: '25', label: 'Empapelado',       order: 25 },
  { code: '30', label: 'Separación',       order: 30 },
  { code: '35', label: 'Desmontar',        order: 35 },
  { code: '40', label: 'Pintar',           order: 40 },
  { code: '45', label: 'Montar',           order: 45 },
  { code: '50', label: 'Pulir',            order: 50 },
  { code: '55', label: 'Sustituir',        order: 55 },
  { code: '60', label: 'Desm/mont',        order: 60 },
];

const GRADES = [
  { code: '00', label: 'Sin grado',          factor: null },
  { code: '01', label: 'Leve 25%',           factor: 0.25 },
  { code: '02', label: 'Medio 50%',          factor: 0.50 },
  { code: '03', label: 'Grave 75%',          factor: 0.75 },
  { code: '04', label: 'Reparación',         factor: null },
  { code: '05', label: 'Sustitución',        factor: null },
  { code: '06', label: 'Pintar reparación',  factor: null },
];

// piece code → group code mapping
const PIECES: { code: string; label: string; groupCode: string }[] = [
  // ── Puertas (72)
  { code: '01', label: 'Puerta delantera izquierda',          groupCode: '72' },
  { code: '02', label: 'Puerta delantera derecha',            groupCode: '72' },
  { code: '03', label: 'Puerta trasera izquierda',            groupCode: '72' },
  { code: '04', label: 'Puerta trasera derecha',              groupCode: '72' },
  // ── Frente (62)
  { code: '05', label: 'Paragolpe delantero',                 groupCode: '62' },
  { code: '07', label: 'Capo',                                groupCode: '62' },
  // ── Sección trasera (64)
  { code: '06', label: 'Paragolpe trasero',                   groupCode: '64' },
  { code: '08', label: 'Puerta/portón trasero',               groupCode: '64' },
  { code: '25', label: 'Panel trasero',                       groupCode: '64' },
  // ── Laterales (63)
  { code: '09', label: 'Guardabarro delantero izquierdo',     groupCode: '63' },
  { code: '10', label: 'Guardabarro delantero derecho',       groupCode: '63' },
  { code: '11', label: 'Guardabarro trasero izquierdo',       groupCode: '63' },
  { code: '12', label: 'Guardabarro trasero derecho',         groupCode: '63' },
  // ── Techo (65)
  { code: '13', label: 'Techo',                               groupCode: '65' },
  { code: '14', label: 'Techo lateral izquierdo',             groupCode: '65' },
  { code: '15', label: 'Techo lateral derecho',               groupCode: '65' },
  // ── Puertas subconjuntos (72) — entradas/marcos
  { code: '16', label: 'Entrada puerta delantero',            groupCode: '72' },
  { code: '17', label: 'Entrada puerta trasero',              groupCode: '72' },
  // ── Molduras externas (88)
  { code: '18', label: 'Espejo izquierdo',                    groupCode: '88' },
  { code: '19', label: 'Espejo derecho',                      groupCode: '88' },
  { code: '22', label: 'Listones guardabarros delantero',     groupCode: '88' },
  { code: '23', label: 'Listones guardabarros trasero',       groupCode: '88' },
  // ── Estructurales inferiores (61)
  { code: '20', label: 'Peldaño izquierdo',                   groupCode: '61' },
  { code: '21', label: 'Peldaño derecho',                     groupCode: '61' },
  // ── Ruedas (40)
  { code: '24', label: 'Llantas',                             groupCode: '40' },

  // ── VANS ─────────────────────────────────────────────────────────────────
  // Puertas vans (72)
  { code: '26', label: 'Puerta delantera izquierda vans',     groupCode: '72' },
  { code: '27', label: 'Puerta delantera derecha vans',       groupCode: '72' },
  { code: '28', label: 'Puerta corrediza vans',               groupCode: '72' },
  { code: '29', label: 'Puerta trasera vans',                 groupCode: '72' },
  { code: '39', label: 'Entrada puerta vans',                 groupCode: '72' },
  { code: '40', label: 'Entrada puertas vans',                groupCode: '72' },
  // Frente vans (62)
  { code: '30', label: 'Paragolpe delantero vans',            groupCode: '62' },
  { code: '32', label: 'Capo vans',                           groupCode: '62' },
  { code: '48', label: 'Marco frontal vans',                  groupCode: '62' },
  // Sección trasera vans (64)
  { code: '31', label: 'Paragolpe trasero vans',              groupCode: '64' },
  { code: '35', label: 'Esquina trasera izquierda vans',      groupCode: '64' },
  { code: '36', label: 'Esquina trasera derecha vans',        groupCode: '64' },
  { code: '47', label: 'Panel trasero vans',                  groupCode: '64' },
  // Laterales vans (63)
  { code: '33', label: 'Guardabarro delantero izquierdo vans', groupCode: '63' },
  { code: '34', label: 'Guardabarro delantero derecho vans',  groupCode: '63' },
  { code: '38', label: 'Pared lateral vans',                  groupCode: '63' },
  // Techo vans (65)
  { code: '37', label: 'Techo seccionado vans',               groupCode: '65' },
  // Molduras vans (88)
  { code: '41', label: 'Espejo izquierdo vans',               groupCode: '88' },
  { code: '44', label: 'Listones guardabarros vans',          groupCode: '88' },
  { code: '45', label: 'Listones traseros vans',              groupCode: '88' },
  // Estructurales inferiores vans (61)
  { code: '42', label: 'Piso vans',                           groupCode: '61' },
  { code: '43', label: 'Peldaño corrediza vans',              groupCode: '61' },
  // Ruedas vans (40)
  { code: '46', label: 'Llantas vans',                        groupCode: '40' },
];

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // 1. GROUPS
    console.log('Seeding bodyshop_groups...');
    await qr.query(`
      INSERT INTO bodyshop_groups (id, code, label)
      VALUES ${GROUPS.map((_, i) => `(gen_random_uuid(), $${i * 2 + 1}, $${i * 2 + 2})`).join(', ')}
      ON CONFLICT (code) DO NOTHING
    `, GROUPS.flatMap(g => [g.code, g.label]));
    console.log(`  ✓ ${GROUPS.length} groups`);

    // 2. PROCESSES
    console.log('Seeding bodyshop_processes...');
    await qr.query(`
      INSERT INTO bodyshop_processes (id, code, label, "order")
      VALUES ${PROCESSES.map((_, i) => `(gen_random_uuid(), $${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')}
      ON CONFLICT (code) DO NOTHING
    `, PROCESSES.flatMap(p => [p.code, p.label, p.order]));
    console.log(`  ✓ ${PROCESSES.length} processes`);

    // 3. GRADES
    console.log('Seeding bodyshop_work_grades...');
    await qr.query(`
      INSERT INTO bodyshop_work_grades (id, code, label, factor)
      VALUES ${GRADES.map((_, i) => `(gen_random_uuid(), $${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')}
      ON CONFLICT (code) DO NOTHING
    `, GRADES.flatMap(g => [g.code, g.label, g.factor]));
    console.log(`  ✓ ${GRADES.length} grades`);

    // 4. PIECES — requiere los IDs de grupos ya insertados
    console.log('Seeding bodyshop_pieces...');
    const groups: { id: string; code: string }[] = await qr.query(
      'SELECT id, code FROM bodyshop_groups'
    );
    const groupById = Object.fromEntries(groups.map(g => [g.code, g.id]));

    for (const piece of PIECES) {
      const groupId = groupById[piece.groupCode] ?? null;
      await qr.query(`
        INSERT INTO bodyshop_pieces (id, code, label, "groupId")
        VALUES (gen_random_uuid(), $1, $2, $3)
        ON CONFLICT (code) DO NOTHING
      `, [piece.code, piece.label, groupId]);
    }
    console.log(`  ✓ ${PIECES.length} pieces`);

    await qr.commitTransaction();
    console.log('\n✅ Bodyshop catalog seed complete');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('❌ Seed failed, transaction rolled back:', err);
    throw err;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
