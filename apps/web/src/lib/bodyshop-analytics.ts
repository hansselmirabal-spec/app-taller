import type { BodyshopEntry, Technician, Absence } from '@/types';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type BalanceProcess = 'BODYWORK' | 'PREP' | 'PAINT';

export interface TechMonthlyRow {
  technicianId:      string;
  technicianName:    string;
  process:           BalanceProcess;
  processLabel:      string;
  monthlyTarget:     number;
  assignedHours:     number;
  workedHours:       number;
  balanceHours:      number;       // target - assigned  (negativo = sobre meta)
  compliancePercent: number;       // workedHours / target × 100
  loadRatio:         number;       // assignedHours / target  (0–1+)
  absenceDays:       number;
  workedDays:        number;
  rankLoadAsc:       number;       // 1 = menor carga acumulada
  rankLoadDesc:      number;       // 1 = mayor carga acumulada
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROCESS_LABEL: Record<BalanceProcess, string> = {
  BODYWORK: 'Chapería',
  PREP:     'Preparación',
  PAINT:    'Pintura',
};

function entryHours(entry: BodyshopEntry, process: BalanceProcess): number {
  if (process === 'BODYWORK') return entry.bodyworkHours;
  if (process === 'PREP')     return entry.prepHours;
  return entry.paintHours;
}

function techProcess(
  t: Technician,
  specIds: { BODYWORK: string[]; PREP: string[]; PAINT: string[] },
): BalanceProcess | null {
  const sp = (t.specialty ?? '').toUpperCase();
  // Specialty string match (new string-based approach)
  if (sp === 'CARROCERIA' || sp === 'BODYWORK' || specIds.BODYWORK.includes(sp)) return 'BODYWORK';
  if (sp === 'PREPARACION' || sp === 'PREP'     || specIds.PREP.includes(sp))    return 'PREP';
  if (sp === 'PINTURA'     || sp === 'PAINT'    || specIds.PAINT.includes(sp))   return 'PAINT';
  return null;
}

// ─── Cálculo principal ────────────────────────────────────────────────────────

/**
 * Calcula el balance mensual de carga por técnico.
 *
 * @param entries           Todos los entries del taller (se filtra internamente por mes)
 * @param technicians       Técnicos activos del taller
 * @param absences          Ausencias del taller
 * @param processSpecialtyIds Mapa especialidad → proceso (de WorkshopConfig)
 * @param year              Año (ej. 2026)
 * @param month             Mes 1-12
 */
export function calcMonthlyLoadReport(
  entries:            BodyshopEntry[],
  technicians:        Technician[],
  absences:           Absence[],
  processSpecialtyIds: { BODYWORK: string[]; PREP: string[]; PAINT: string[] },
  year:               number,
  month:              number,
): TechMonthlyRow[] {
  const prefix = `${year}-${month.toString().padStart(2, '0')}`;

  const rows: TechMonthlyRow[] = technicians
    .filter(t => t.active)
    .flatMap(t => {
      const process = techProcess(t, processSpecialtyIds);
      if (!process) return [];

      const monthlyTarget  = t.monthlyTargetHours ?? t.dailyHours * 22;
      let   assignedHours  = 0;
      let   workedHours    = 0;
      const workedDates    = new Set<string>();

      for (const e of entries) {
        if (!e.date.startsWith(prefix)) continue;
        if (e.status === 'cancelled')   continue;

        const pt = e.processTechs?.[process];
        if (pt?.technicianId !== t.id) continue;

        const h = entryHours(e, process);
        assignedHours += h;
        workedDates.add(e.date);
        if (e.status === 'done') workedHours += h;
      }

      const absenceDays = absences.filter(
        a => a.technicianId === t.id && a.date.startsWith(prefix),
      ).length;

      const ra = assignedHours;
      const rt = monthlyTarget > 0 ? ra / monthlyTarget : 0;

      return [{
        technicianId:      t.id,
        technicianName:    t.name,
        process,
        processLabel:      PROCESS_LABEL[process],
        monthlyTarget,
        assignedHours:     round1(assignedHours),
        workedHours:       round1(workedHours),
        balanceHours:      round1(monthlyTarget - assignedHours),
        compliancePercent: monthlyTarget > 0 ? Math.round((workedHours / monthlyTarget) * 100) : 0,
        loadRatio:         round2(rt),
        absenceDays,
        workedDays:        workedDates.size,
        rankLoadAsc:       0,  // calculado abajo
        rankLoadDesc:      0,
      }] satisfies TechMonthlyRow[];
    });

  // Ranking por carga relativa
  const sorted = [...rows].sort((a, b) => a.loadRatio - b.loadRatio || a.assignedHours - b.assignedHours);
  sorted.forEach((r, i) => {
    r.rankLoadAsc  = i + 1;
    r.rankLoadDesc = rows.length - i;
  });

  return rows.sort((a, b) => a.rankLoadAsc - b.rankLoadAsc);
}

// ─── Algoritmo load-aware para auto-asignación ────────────────────────────────

/**
 * Dado un pool de técnicos elegibles para un proceso, selecciona el que
 * tiene menor carga relativa (assignedHours / monthlyTarget) hasta ese momento.
 * Desempate: mayor dailyHours.
 */
export function pickLeastLoadedTech(
  pool:          Technician[],
  runningHours:  Record<string, Record<string, number>>,  // techId → { 'yyyy-MM' → horas }
  dateStr:       string,
): Technician | undefined {
  if (!pool.length) return undefined;
  const ym = dateStr.substring(0, 7);

  return [...pool].sort((a, b) => {
    const targetA  = a.monthlyTargetHours ?? a.dailyHours * 22;
    const targetB  = b.monthlyTargetHours ?? b.dailyHours * 22;
    const hoursA   = runningHours[a.id]?.[ym] ?? 0;
    const hoursB   = runningHours[b.id]?.[ym] ?? 0;
    const ratioA   = targetA > 0 ? hoursA / targetA : 0;
    const ratioB   = targetB > 0 ? hoursB / targetB : 0;
    return ratioA - ratioB || b.dailyHours - a.dailyHours;
  })[0];
}

export function addRunningHours(
  runningHours: Record<string, Record<string, number>>,
  techId: string,
  dateStr: string,
  hours: number,
): void {
  const ym = dateStr.substring(0, 7);
  if (!runningHours[techId]) runningHours[techId] = {};
  runningHours[techId][ym] = (runningHours[techId][ym] ?? 0) + hours;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function round1(n: number) { return Math.round(n * 10) / 10; }
function round2(n: number) { return Math.round(n * 100) / 100; }
