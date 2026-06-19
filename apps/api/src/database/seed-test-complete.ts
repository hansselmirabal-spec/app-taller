/**
 * Seed de prueba completo — cubre todos los escenarios del sistema
 * Limpia datos de "Pintura & Chapería Luque" y re-crea con casos de test.
 *
 * Escenarios cubiertos:
 *  1. No-inicio alerta (timeStart pasado >30min, sin inicio)
 *  2. Dentro de tolerancia (timeStart <30min atrás, sin alerta)
 *  3. Ya liberado (noStartAt set → badge gris)
 *  4. Trabajo iniciado (tracking log in_progress, sin alerta)
 *  5. Sin avance en AGENDA (P1) — entry de días atrás aún en scheduled
 *  6. Entrega vencida (P4) — estimatedFinishDate pasada
 *  7. Pipeline normal — in_progress en distintos procesos
 *  8. Finalizados (done)
 *  9. Cancelado
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';

const DS = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://taller_user:taller_pass@localhost:5432/taller_db',
  entities: [__dirname + '/../**/*.entity.ts'],
  synchronize: false,
});

const WS_NAME = 'Pintura & Chapería Luque';

function fmt(d: Date): string { return d.toISOString().split('T')[0]; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(d.getDate() + n); return r; }
function timeAgo(minutesAgo: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minutesAgo);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function seed() {
  await DS.initialize();
  const qr = DS.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // ── Workshop ──────────────────────────────────────────────────────────────
    const [ws] = await qr.query(`SELECT id FROM workshops WHERE name = $1`, [WS_NAME]);
    if (!ws) throw new Error(`Workshop "${WS_NAME}" no encontrado. Corré db:seed:bodyshop-ws primero.`);
    const wsId: string = ws.id;
    console.log(`Workshop: ${WS_NAME} (${wsId})`);

    // ── Técnicos activos por proceso ──────────────────────────────────────────
    const techs: { id: string; name: string; specialty: string }[] = await qr.query(
      `SELECT id, name, specialty FROM technicians WHERE workshop_name = $1 AND active = true`,
      [WS_NAME],
    );
    const byProc: Record<string, string[]> = {};
    for (const t of techs) {
      const key = t.specialty.toUpperCase();
      byProc[key] = byProc[key] || [];
      byProc[key].push(t.id);
    }
    const chap = byProc['CHAPERIA']    ?? [];
    const prep = byProc['PREPARACION'] ?? [];
    const pint = byProc['PINTURA']     ?? [];
    console.log(`Técnicos: CHAPERIA=${chap.length} PREP=${prep.length} PINTURA=${pint.length}`);
    if (!chap.length || !prep.length || !pint.length) throw new Error('Faltan técnicos activos para algún proceso');

    // ── Limpiar datos previos de ESTE taller ──────────────────────────────────
    const existingEntries: { id: string }[] = await qr.query(
      `SELECT id FROM bodyshop_entries WHERE workshop_id = $1`, [wsId],
    );
    const entryIds = existingEntries.map(e => e.id);

    if (entryIds.length > 0) {
      const ids = entryIds.map((_,i) => `$${i+1}`).join(',');
      await qr.query(`DELETE FROM bodyshop_entry_process_slots WHERE entry_id IN (${ids})`, entryIds);
      await qr.query(`DELETE FROM bodyshop_process_techs WHERE entry_id IN (${ids})`, entryIds);
      await qr.query(`DELETE FROM tracking_logs WHERE source_type = 'bodyshop' AND source_id IN (${ids})`, entryIds);
      await qr.query(`DELETE FROM bodyshop_entries WHERE id IN (${ids})`, entryIds);
      console.log(`Limpiados ${entryIds.length} entries + logs previos`);
    }

    // ── Work types ────────────────────────────────────────────────────────────
    const wts: { id: string; name: string; bodywork_hours: string; prep_hours: string; paint_hours: string }[] =
      await qr.query(`SELECT id, name, bodywork_hours, prep_hours, paint_hours FROM work_types WHERE workshop_id = $1`, [wsId]);
    if (!wts.length) throw new Error('No hay work_types. Corré db:seed:bodyshop primero.');
    const wt = (i: number) => wts[i % wts.length];

    const today     = fmt(new Date());
    const yesterday = fmt(addDays(new Date(), -1));
    const d3ago     = fmt(addDays(new Date(), -3));
    const d7ago     = fmt(addDays(new Date(), -7));
    const tomorrow  = fmt(addDays(new Date(), +1));
    const d3ahead   = fmt(addDays(new Date(), +3));

    // timeStart para los escenarios de hoy
    const tPast90    = timeAgo(90 + 30);   // 120min atrás: alerta activa hace 90min
    const tPast60    = timeAgo(60 + 30);   // 90min atrás: alerta activa hace 60min
    const tPast10    = timeAgo(10);        // 10min atrás: dentro de tolerancia, sin alerta
    const tReleased  = timeAgo(180 + 30);  // 210min atrás: ya liberado

    // ── Helper: crear entry ───────────────────────────────────────────────────
    async function createEntry(params: {
      plate: string; name: string; date: string;
      wti: number; status: string; stay: number;
      timeStart?: string | null;
      noStartAt?: Date | null;
      noStartHoursLost?: number | null;
      noStartTechSnapshot?: any[] | null;
      estimatedFinishDate?: string | null;
    }): Promise<string> {
      const w = wt(params.wti);
      const bh = parseFloat(w.bodywork_hours);
      const ph = parseFloat(w.prep_hours);
      const pth = parseFloat(w.paint_hours);
      const [row] = await qr.query(
        `INSERT INTO bodyshop_entries
           (id, workshop_id, date, work_type_id, customer_name, plate, status,
            bodywork_hours, prep_hours, paint_hours, stay_days, channel,
            time_start, no_start_at, no_start_hours_lost, no_start_tech_snapshot,
            estimated_finish_date, created_by)
         VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'seed')
         RETURNING id`,
        [
          wsId, params.date, w.id, params.name, params.plate, params.status,
          bh, ph, pth, params.stay, 'insurance',
          params.timeStart ?? null,
          params.noStartAt ?? null,
          params.noStartHoursLost ?? null,
          params.noStartTechSnapshot ? JSON.stringify(params.noStartTechSnapshot) : null,
          params.estimatedFinishDate ?? null,
        ],
      );
      return row.id;
    }

    // Helper: asignar techs a procesos
    async function assignTechs(entryId: string) {
      for (const [proc, tids] of [['BODYWORK', chap], ['PREP', prep], ['PAINT', pint]] as [string, string[]][]) {
        if (!tids[0]) continue;
        await qr.query(
          `INSERT INTO bodyshop_process_techs (id, entry_id, process, technician_id)
           VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT DO NOTHING`,
          [entryId, proc, tids[0]],
        );
      }
    }

    // Helper: crear tracking log
    async function createLog(entryId: string, process: string, code: string, order: number,
      hours: number, status: string, startedAt?: Date, completedAt?: Date) {
      await qr.query(
        `INSERT INTO tracking_logs
           (id, source_type, source_id, process_name, process_code, order_index,
            planned_hours, status, started_at, completed_at, process_type)
         VALUES (gen_random_uuid(),'bodyshop',$1,$2,$3,$4,$5,$6,$7,$8,'MOTHER')`,
        [entryId, process, code, order, hours, status,
         startedAt ?? null, completedAt ?? null],
      );
    }

    let count = 0;

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 1 — ALERTA NO-INICIO (tiempo vencido hace 90min)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 1: Alerta no-inicio (2 entries)');
    {
      const id = await createEntry({ plate: 'TEST 001', name: 'Carlos Méndez', date: today, wti: 0, status: 'scheduled', stay: 1, timeStart: tPast90 });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'in_progress', new Date());
      await createLog(id, 'Chapería', 'BODYWORK', 1, 4, 'pending');
      await createLog(id, 'Preparación', 'PREP', 2, 2, 'pending');
      await createLog(id, 'Pintura', 'PAINT', 3, 3, 'pending');
      console.log(`  ✓ ${id} | TEST 001 | timeStart=${tPast90} → badge ámbar "hace 90min"`);
      count++;
    }
    {
      const id = await createEntry({ plate: 'TEST 002', name: 'Lourdes Vera', date: today, wti: 2, status: 'scheduled', stay: 4, timeStart: tPast60 });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'in_progress', new Date());
      await createLog(id, 'Chapería', 'BODYWORK', 1, 16, 'pending');
      await createLog(id, 'Preparación', 'PREP', 2, 8, 'pending');
      await createLog(id, 'Pintura', 'PAINT', 3, 12, 'pending');
      console.log(`  ✓ ${id} | TEST 002 | timeStart=${tPast60} → badge ámbar "hace 60min"`);
      count++;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 2 — DENTRO DE TOLERANCIA (no alerta)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 2: Dentro de tolerancia (sin alerta)');
    {
      const id = await createEntry({ plate: 'TEST 003', name: 'Ana González', date: today, wti: 1, status: 'scheduled', stay: 2, timeStart: tPast10 });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'in_progress', new Date());
      await createLog(id, 'Chapería', 'BODYWORK', 1, 8, 'pending');
      await createLog(id, 'Preparación', 'PREP', 2, 4, 'pending');
      await createLog(id, 'Pintura', 'PAINT', 3, 6, 'pending');
      console.log(`  ✓ ${id} | TEST 003 | timeStart=${tPast10} → sin alerta (dentro 30min)`);
      count++;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 3 — YA LIBERADO (badge gris)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 3: Ya liberado por no-inicio');
    {
      const relAt = new Date(); relAt.setMinutes(relAt.getMinutes() - 45);
      const w = wt(1);
      const bh = parseFloat(w.bodywork_hours), ph = parseFloat(w.prep_hours), pth = parseFloat(w.paint_hours);
      const snapshot = [
        { process: 'BODYWORK', technicianId: chap[0], technicianName: (techs.find(t=>t.id===chap[0]))?.name ?? 'Tech' },
        { process: 'PREP',     technicianId: prep[0], technicianName: (techs.find(t=>t.id===prep[0]))?.name ?? 'Tech' },
        { process: 'PAINT',    technicianId: pint[0], technicianName: (techs.find(t=>t.id===pint[0]))?.name ?? 'Tech' },
      ];
      const id = await createEntry({
        plate: 'TEST 004', name: 'Roberto Fleitas', date: today, wti: 1, status: 'scheduled', stay: 2,
        timeStart: tReleased,
        noStartAt: relAt,
        noStartHoursLost: bh + ph + pth,
        noStartTechSnapshot: snapshot,
      });
      // Sin process_techs (ya fueron liberados), solo AGENDA log
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'in_progress', new Date());
      await createLog(id, 'Chapería', 'BODYWORK', 1, bh, 'pending');
      await createLog(id, 'Preparación', 'PREP', 2, ph, 'pending');
      await createLog(id, 'Pintura', 'PAINT', 3, pth, 'pending');
      console.log(`  ✓ ${id} | TEST 004 | noStartAt=${relAt.toISOString()} → badge gris "Cupo liberado"`);
      count++;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 4 — TRABAJO INICIADO (sin alerta aunque timeStart pasado)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 4: Trabajo iniciado (sin alerta)');
    {
      const startedAt = new Date(); startedAt.setMinutes(startedAt.getMinutes() - 45);
      const id = await createEntry({ plate: 'TEST 005', name: 'Patricia Ruiz', date: today, wti: 0, status: 'in_progress', stay: 1, timeStart: tPast90 });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'completed', new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_200_000));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 4, 'in_progress', startedAt);
      await createLog(id, 'Preparación', 'PREP', 2, 2, 'pending');
      await createLog(id, 'Pintura', 'PAINT', 3, 3, 'pending');
      console.log(`  ✓ ${id} | TEST 005 | in_progress → sin alerta no-inicio`);
      count++;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 5 — SIN AVANCE EN AGENDA (P1: días sin avance)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 5: Sin avance en AGENDA (P1)');
    {
      const id = await createEntry({ plate: 'TEST 006', name: 'Héctor Sosa', date: d3ago, wti: 2, status: 'scheduled', stay: 4, estimatedFinishDate: d3ahead });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'in_progress', new Date(d3ago + 'T08:00:00'));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 16, 'pending');
      await createLog(id, 'Preparación', 'PREP', 2, 8, 'pending');
      await createLog(id, 'Pintura', 'PAINT', 3, 12, 'pending');
      console.log(`  ✓ ${id} | TEST 006 | date=${d3ago} → badge "Sin avance · 3d en Agendado"`);
      count++;
    }
    {
      const id = await createEntry({ plate: 'TEST 007', name: 'Norma Cáceres', date: d7ago, wti: 3, status: 'scheduled', stay: 7, estimatedFinishDate: yesterday });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'in_progress', new Date(d7ago + 'T08:00:00'));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 28, 'pending');
      await createLog(id, 'Preparación', 'PREP', 2, 14, 'pending');
      await createLog(id, 'Pintura', 'PAINT', 3, 20, 'pending');
      console.log(`  ✓ ${id} | TEST 007 | date=${d7ago} → badge "Sin avance · 7d" + entrega vencida`);
      count++;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 6 — ENTREGA VENCIDA (P4)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 6: Entrega vencida (P4)');
    {
      const startedAt = new Date(d3ago + 'T08:30:00');
      const id = await createEntry({ plate: 'TEST 008', name: 'Diego Torres', date: d3ago, wti: 1, status: 'in_progress', stay: 2, estimatedFinishDate: yesterday });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'completed', new Date(d3ago+'T08:00:00'), new Date(d3ago+'T08:30:00'));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 8, 'completed', startedAt, new Date(d3ago+'T16:30:00'));
      await createLog(id, 'Preparación', 'PREP', 2, 4, 'in_progress', new Date(d3ago+'T17:00:00'));
      await createLog(id, 'Pintura', 'PAINT', 3, 6, 'pending');
      console.log(`  ✓ ${id} | TEST 008 | estimatedFinishDate=${yesterday} → badge "Entrega vencida"`);
      count++;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 7 — PIPELINE NORMAL (distintos procesos)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 7: Pipeline normal');
    // En Chapería
    {
      const startedAt = new Date(); startedAt.setHours(8, 0, 0, 0);
      const id = await createEntry({ plate: 'TEST 009', name: 'Silvia Almada', date: today, wti: 2, status: 'in_progress', stay: 4, estimatedFinishDate: d3ahead });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'completed', new Date(today+'T07:30:00'), new Date(today+'T08:00:00'));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 16, 'in_progress', startedAt);
      await createLog(id, 'Preparación', 'PREP', 2, 8, 'pending');
      await createLog(id, 'Pintura', 'PAINT', 3, 12, 'pending');
      console.log(`  ✓ ${id} | TEST 009 | En Chapería (in_progress)`);
      count++;
    }
    // En Preparación
    {
      const id = await createEntry({ plate: 'TEST 010', name: 'Fabio Barrios', date: yesterday, wti: 1, status: 'in_progress', stay: 2, estimatedFinishDate: tomorrow });
      await assignTechs(id);
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'completed', new Date(yesterday+'T08:00:00'), new Date(yesterday+'T08:30:00'));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 8, 'completed', new Date(yesterday+'T08:30:00'), new Date(yesterday+'T16:30:00'));
      await createLog(id, 'Preparación', 'PREP', 2, 4, 'in_progress', new Date(today+'T08:00:00'));
      await createLog(id, 'Pintura', 'PAINT', 3, 6, 'pending');
      console.log(`  ✓ ${id} | TEST 010 | En Preparación (in_progress)`);
      count++;
    }
    // En Pintura
    {
      const id = await createEntry({ plate: 'TEST 011', name: 'Leticia Duarte', date: addDays(new Date(),-5).toISOString().split('T')[0], wti: 5, status: 'in_progress', stay: 3, estimatedFinishDate: tomorrow });
      await assignTechs(id);
      const d5 = addDays(new Date(),-5).toISOString().split('T')[0];
      const d4 = addDays(new Date(),-4).toISOString().split('T')[0];
      const d2 = addDays(new Date(),-2).toISOString().split('T')[0];
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'completed', new Date(d5+'T08:00:00'), new Date(d5+'T08:30:00'));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 4, 'completed', new Date(d5+'T08:30:00'), new Date(d5+'T16:30:00'));
      await createLog(id, 'Preparación', 'PREP', 2, 6, 'completed', new Date(d4+'T08:00:00'), new Date(d4+'T14:00:00'));
      await createLog(id, 'Pintura', 'PAINT', 3, 16, 'in_progress', new Date(d2+'T08:00:00'));
      console.log(`  ✓ ${id} | TEST 011 | En Pintura (in_progress, semáforo rojo)`);
      count++;
    }
    // En Control Final (con pausa)
    {
      const id = await createEntry({ plate: 'TEST 012', name: 'Oscar Benítez', date: addDays(new Date(),-6).toISOString().split('T')[0], wti: 3, status: 'in_progress', stay: 7, estimatedFinishDate: d3ahead });
      await assignTechs(id);
      const d6 = addDays(new Date(),-6).toISOString().split('T')[0];
      const d5 = addDays(new Date(),-5).toISOString().split('T')[0];
      const d4 = addDays(new Date(),-4).toISOString().split('T')[0];
      const d3 = addDays(new Date(),-3).toISOString().split('T')[0];
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'completed', new Date(d6+'T08:00:00'), new Date(d6+'T08:30:00'));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 28, 'completed', new Date(d6+'T08:30:00'), new Date(d5+'T16:30:00'));
      await createLog(id, 'Preparación', 'PREP', 2, 14, 'completed', new Date(d5+'T08:00:00'), new Date(d4+'T16:00:00'));
      await createLog(id, 'Pintura', 'PAINT', 3, 20, 'completed', new Date(d4+'T08:00:00'), new Date(d3+'T16:00:00'));
      console.log(`  ✓ ${id} | TEST 012 | Todos procesos done → columna Finalizado`);
      count++;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 8 — FINALIZADOS (done)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 8: Finalizados');
    for (let i = 0; i < 3; i++) {
      const dStart = addDays(new Date(), -(i+2)).toISOString().split('T')[0];
      const dEnd   = addDays(new Date(), -(i)).toISOString().split('T')[0];
      const id = await createEntry({ plate: `DONE 00${i+1}`, name: `Cliente Done ${i+1}`, date: dStart, wti: i, status: 'done', stay: 2 });
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'completed', new Date(dStart+'T08:00:00'), new Date(dStart+'T08:30:00'));
      await createLog(id, 'Chapería', 'BODYWORK', 1, 4, 'completed', new Date(dStart+'T08:30:00'), new Date(dStart+'T16:00:00'));
      await createLog(id, 'Preparación', 'PREP', 2, 2, 'completed', new Date(dEnd+'T08:00:00'), new Date(dEnd+'T12:00:00'));
      await createLog(id, 'Pintura', 'PAINT', 3, 3, 'completed', new Date(dEnd+'T13:00:00'), new Date(dEnd+'T16:00:00'));
      count++;
    }
    console.log(`  ✓ 3 finalizados`);

    // ═══════════════════════════════════════════════════════════════════════
    // ESCENARIO 9 — CANCELADO
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n── ESCENARIO 9: Cancelado');
    {
      const id = await createEntry({ plate: 'CANC 001', name: 'Cliente Cancelado', date: yesterday, wti: 0, status: 'cancelled', stay: 1 });
      await createLog(id, 'Agendado', 'AGENDA', 0, 0.5, 'completed', new Date(yesterday+'T09:00:00'), new Date(yesterday+'T09:30:00'));
      console.log(`  ✓ ${id} | CANC 001 | status=cancelled`);
      count++;
    }

    await qr.commitTransaction();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅  ${count} entradas creadas para "${WS_NAME}"`);
    console.log(`\n📋  RESUMEN DE ESCENARIOS:`);
    console.log(`   TEST 001  → timeStart=${tPast90} → ALERTA "hace 90min" + botón Liberar`);
    console.log(`   TEST 002  → timeStart=${tPast60} → ALERTA "hace 60min" + botón Liberar`);
    console.log(`   TEST 003  → timeStart=${tPast10} → SIN ALERTA (dentro tolerancia)`);
    console.log(`   TEST 004  → noStartAt set       → BADGE GRIS "Cupo liberado"`);
    console.log(`   TEST 005  → in_progress iniciado → SIN ALERTA no-inicio`);
    console.log(`   TEST 006  → ${d3ago} agendado   → BADGE "Sin avance · 3d"`);
    console.log(`   TEST 007  → ${d7ago} agendado   → BADGE "Sin avance · 7d" + vencida`);
    console.log(`   TEST 008  → estimFinish=${yesterday} → BADGE "Entrega vencida"`);
    console.log(`   TEST 009  → En Chapería in_progress`);
    console.log(`   TEST 010  → En Preparación in_progress`);
    console.log(`   TEST 011  → En Pintura in_progress (semáforo rojo)`);
    console.log(`   TEST 012  → __DONE__ columna`);
    console.log(`   DONE 001-3 → Finalizados`);
    console.log(`   CANC 001   → Cancelado`);
    console.log(`${'═'.repeat(60)}\n`);

  } catch (err) {
    await qr.rollbackTransaction();
    console.error('❌ Error:', err);
    throw err;
  } finally {
    await qr.release();
    await DS.destroy();
  }
}

seed().catch(e => { console.error(e); process.exit(1); });
