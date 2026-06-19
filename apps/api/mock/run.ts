import { getSummary } from './store';
import {
  calcMechanicCapacity, calcBodyshopCapacity, findAptDate,
  summarizeWorkshop, CapacityStatus,
} from './capacity-engine';
import { createMechanicWorkshop, createBodyshopWorkshop } from './workshop-factory';

// ─── Helpers visuales ─────────────────────────────────────────────────────────

function statusBadge(status: CapacityStatus): string {
  if (status === 'OK')        return '🟢 OK';
  if (status === 'RISK')      return '🟡 RISK';
  if (status === 'OVERLOADED') return '🔴 OVERLOADED';
  return status;
}

function pct(rate: number): string {
  return (rate * 100).toFixed(1) + '%';
}

function offsetDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function header(title: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function subheader(title: string) {
  console.log(`\n  ── ${title} ──`);
}

// ─── STORE SUMMARY ────────────────────────────────────────────────────────────

header('STORE SUMMARY');
const summary = getSummary();
console.log(`  Workshops    : ${summary.workshops}`);
console.log(`  WorkTypes    : ${summary.workTypes}`);
console.log(`  Appointments : ${summary.appointments}`);

// ─── MECHANIC CAPACITY ────────────────────────────────────────────────────────

header('MECHANIC — ws-mechanic-01');

const mechanicDays = [
  { label: 'Hoy  ', offset: 0 },
  { label: 'Mañana', offset: 1 },
  { label: 'D+2  ', offset: 2 },
];

for (const { label, offset } of mechanicDays) {
  const date = offsetDate(offset);
  const cap = calcMechanicCapacity('ws-mechanic-01', date);
  subheader(`${label} (${date})`);
  console.log(`  Teórico       : ${cap.theoreticalHours}h`);
  console.log(`  Real          : ${cap.realHours}h`);
  console.log(`  Comercializ.  : ${cap.commercializableHours}h`);
  console.log(`  Ocupadas      : ${cap.occupiedHours}h`);
  console.log(`  Disponibles   : ${cap.availableHours}h`);
  console.log(`  Ocupación     : ${pct(cap.occupancyRate)}`);
  console.log(`  Slots libres  : ${cap.availableSlots}`);
  console.log(`  Estado        : ${statusBadge(cap.status)}`);
}

// ─── BODYSHOP CAPACITY ────────────────────────────────────────────────────────

header('BODYSHOP — ws-bodyshop-01');

const bodyshopDays = [
  { label: 'Hoy  ', offset: 0 },
  { label: 'Mañana', offset: 1 },
  { label: 'D+2  ', offset: 2 },
  { label: 'D+4  ', offset: 4 },
];

for (const { label, offset } of bodyshopDays) {
  const date = offsetDate(offset);
  const cap = calcBodyshopCapacity('ws-bodyshop-01', date);
  subheader(`${label} (${date})`);
  console.log(`  Teórico       : ${cap.theoreticalHours}h`);
  console.log(`  Comercializ.  : ${cap.commercializableHours}h`);
  console.log(`  Global        : ${pct(cap.globalOccupancyRate)} → ${statusBadge(cap.globalStatus)}`);

  const p = cap.byProcess;
  console.log(`  ┌─ BODYWORK  ${p.BODYWORK.occupiedHours}h / ${p.BODYWORK.commercializableHours}h ` +
    `(${pct(p.BODYWORK.occupancyRate)}) ${statusBadge(p.BODYWORK.status)}`);
  console.log(`  ├─ PREP      ${p.PREP.occupiedHours}h / ${p.PREP.commercializableHours}h ` +
    `(${pct(p.PREP.occupancyRate)}) ${statusBadge(p.PREP.status)}`);
  console.log(`  └─ PAINT     ${p.PAINT.occupiedHours}h / ${p.PAINT.commercializableHours}h ` +
    `(${pct(p.PAINT.occupancyRate)}) ${statusBadge(p.PAINT.status)}`);
}

// ─── APT DATE ─────────────────────────────────────────────────────────────────

header('APT-DATE — fechas disponibles en ws-bodyshop-01');

const aptCases = [
  { id: 'wt-01', name: 'Toque leve' },
  { id: 'wt-03', name: 'Daño grave' },
  { id: 'wt-04', name: 'Piezas múltiples' },
  { id: 'wt-11', name: 'Pulido y detallado' },
  { id: 'wt-12', name: 'Siniestro total' },
];

for (const { id, name } of aptCases) {
  try {
    const result = findAptDate('ws-bodyshop-01', id);
    console.log(
      `\n  ${name.padEnd(22)} → ${result.aptDate}  (buscado ${result.daysSearched} día${result.daysSearched > 1 ? 's' : ''})`
    );
    console.log(
      `    Req: BW ${result.requiredHours.bodywork}h | PREP ${result.requiredHours.prep}h | PAINT ${result.requiredHours.paint}h`
    );
    console.log(
      `    Dis: BW ${result.availableOnDate.bodywork}h | PREP ${result.availableOnDate.prep}h | PAINT ${result.availableOnDate.paint}h`
    );
  } catch (e: any) {
    console.log(`\n  ${name.padEnd(22)} → ❌ ${e.message}`);
  }
}

// ─── ERROR CASES ─────────────────────────────────────────────────────────────

header('ERROR CASES');

subheader('findAptDate en taller MECHANIC → debe fallar');
try {
  findAptDate('ws-mechanic-01', 'wt-01');
  console.log('  ❌ No se lanzó ningún error (inesperado)');
} catch (e: any) {
  console.log(`  ✅ Error esperado: ${e.message}`);
}

subheader('calcBodyshopCapacity en taller MECHANIC → debe fallar');
try {
  calcBodyshopCapacity('ws-mechanic-01', offsetDate(0));
  console.log('  ❌ No se lanzó ningún error (inesperado)');
} catch (e: any) {
  console.log(`  ✅ Error esperado: ${e.message}`);
}

subheader('findWorkshop con ID inexistente → debe fallar');
try {
  const { findWorkshop } = require('./store');
  findWorkshop('ws-does-not-exist');
  console.log('  ❌ No se lanzó ningún error (inesperado)');
} catch (e: any) {
  console.log(`  ✅ Error esperado: ${e.message}`);
}

// ─── WORKSHOP FACTORY ────────────────────────────────────────────────────────

header('WORKSHOP FACTORY — Creación de talleres');

function printSummary(id: string) {
  const s = summarizeWorkshop(id);
  console.log(`\n  📋 ${s.name} [${s.type}] — ${s.id}`);
  console.log(`  Config: ${s.config.totalTechnicians} técnicos × ${s.config.hoursPerDay}h/día × ${s.config.workingDaysPerMonth} días`);
  console.log(`  Presencia ${(s.config.presenceRate * 100).toFixed(0)}% | Productividad ${(s.config.productivityRate * 100).toFixed(0)}% | Lost ${(s.config.lostHoursRate * 100).toFixed(0)}% | Buffer ${(s.config.bufferRate * 100).toFixed(0)}%`);
  console.log(`  ─`);
  console.log(`  Teórico mensual      : ${s.calculated.theoreticalMonthly}h`);
  console.log(`  Real mensual         : ${s.calculated.realMonthly}h`);
  console.log(`  Comercializ. mensual : ${s.calculated.commercializableMonthly}h`);
  console.log(`  Comercializ. diario  : ${s.calculated.commercializableDaily}h`);
  if (s.calculated.slotsPerDay !== undefined) {
    console.log(`  Slots/día            : ${s.calculated.slotsPerDay}`);
  }
  if (s.calculated.byProcessDaily) {
    const p = s.calculated.byProcessDaily;
    console.log(`  Por proceso/día      : BODYWORK ${p.BODYWORK}h | PREP ${p.PREP}h | PAINT ${p.PAINT}h`);
  }
}

// Escenario 1 — Taller Mecánico nuevo
subheader('Escenario 1 — Taller Mecánico nuevo (Taller Sur)');
try {
  const tallerSur = createMechanicWorkshop({
    name: 'Taller Sur',
    totalTechnicians: 5,
    hoursPerDay: 9,
  });
  printSummary(tallerSur.id);

  const capHoy = calcMechanicCapacity(tallerSur.id, offsetDate(0));
  console.log(`\n  Capacidad hoy (${capHoy.date}):`);
  console.log(`  Comercializ.: ${capHoy.commercializableHours}h | Ocupadas: ${capHoy.occupiedHours}h | Disponibles: ${capHoy.availableHours}h`);
  console.log(`  Ocupación: ${pct(capHoy.occupancyRate)} | Slots libres: ${capHoy.availableSlots} | ${statusBadge(capHoy.status)}`);
} catch (e: any) {
  console.log(`  ❌ Error inesperado: ${e.message}`);
}

// Escenario 2 — Bodyshop nuevo con mix válido
subheader('Escenario 2 — Bodyshop Express (mix 50/25/25)');
try {
  const bodyshopExpress = createBodyshopWorkshop({
    name: 'Bodyshop Express',
    totalTechnicians: 4,
    hoursPerDay: 8,
    mixBodywork: 0.50,
    mixPrep: 0.25,
    mixPaint: 0.25,
  });
  printSummary(bodyshopExpress.id);

  const apt = findAptDate(bodyshopExpress.id, 'wt-01');
  console.log(`\n  apt-date para "Toque leve":`);
  console.log(`  → ${apt.aptDate} (buscado ${apt.daysSearched} día${apt.daysSearched > 1 ? 's' : ''})`);
  console.log(`  Req: BW ${apt.requiredHours.bodywork}h | PREP ${apt.requiredHours.prep}h | PAINT ${apt.requiredHours.paint}h`);
  console.log(`  Dis: BW ${apt.availableOnDate.bodywork}h | PREP ${apt.availableOnDate.prep}h | PAINT ${apt.availableOnDate.paint}h`);
} catch (e: any) {
  console.log(`  ❌ Error inesperado: ${e.message}`);
}

// Escenario 3 — Validaciones
subheader('Escenario 3 — Validaciones (deben fallar)');

const validations: Array<{ label: string; fn: () => void }> = [
  {
    label: 'mix que suma 0.90',
    fn: () => createBodyshopWorkshop({
      name: 'Test Mix',
      totalTechnicians: 3,
      hoursPerDay: 8,
      mixBodywork: 0.45,
      mixPrep: 0.25,
      mixPaint: 0.20,
    }),
  },
  {
    label: 'totalTechnicians: 1',
    fn: () => createBodyshopWorkshop({
      name: 'Test Tech',
      totalTechnicians: 1,
      hoursPerDay: 8,
    }),
  },
  {
    label: 'hoursPerDay: 14',
    fn: () => createMechanicWorkshop({
      name: 'Test Hours',
      totalTechnicians: 3,
      hoursPerDay: 14,
    }),
  },
];

for (const { label, fn } of validations) {
  try {
    fn();
    console.log(`\n  [${label}] ❌ No se lanzó error (inesperado)`);
  } catch (e: any) {
    console.log(`\n  [${label}]`);
    console.log(`  ✅ Error esperado: ${e.message}`);
  }
}

console.log('\n' + '═'.repeat(60));
console.log('  ✅ Mock run completado\n');
