import type { BodyshopBalanceProcess } from '@/types';

// Única fuente de verdad para los 5 procesos reales de Chapería en el
// frontend — debe reflejar BALANCE_PROCESSES del backend
// (apps/api/src/modules/bodyshop/bodyshop.service.ts). Antes de esto, Pulida
// y Control Final se quedaban afuera en 3 lugares que redeclaraban su propia
// copia incompleta del catálogo (reporteria/bodyshop.tsx x2,
// appointments/bodyshop.tsx) — auditoría pre-producción 2026-08-13, FE-16.
export interface BodyshopProcessDef {
  code: BodyshopBalanceProcess;
  label: string;
  color: string;
}

export const BODYSHOP_PROCESSES: BodyshopProcessDef[] = [
  { code: 'BODYWORK',      label: 'Chapería',      color: '#3b82f6' },
  { code: 'PREP',          label: 'Preparación',   color: '#8b5cf6' },
  { code: 'PAINT',         label: 'Pintura',       color: '#f97316' },
  { code: 'POLISH',        label: 'Pulida',        color: '#14b8a6' },
  { code: 'FINAL_CONTROL', label: 'Control Final', color: '#ec4899' },
];

export const BODYSHOP_PROCESS_LABELS: Record<BodyshopBalanceProcess, string> = Object.fromEntries(
  BODYSHOP_PROCESSES.map(p => [p.code, p.label]),
) as Record<BodyshopBalanceProcess, string>;

export const BODYSHOP_PROCESS_COLORS: Record<BodyshopBalanceProcess, string> = Object.fromEntries(
  BODYSHOP_PROCESSES.map(p => [p.code, p.color]),
) as Record<BodyshopBalanceProcess, string>;

// BODYWORK/PREP/PAINT viven en columnas propias de BodyshopEntry; POLISH y
// FINAL_CONTROL (y cualquier paralelo) solo viven en entry.processes (jsonb).
export function entryProcessHours(
  entry: { bodyworkHours: number; prepHours: number; paintHours: number; processes?: { code: string; hours: number }[] | null },
  code: BodyshopBalanceProcess,
): number {
  if (code === 'BODYWORK') return entry.bodyworkHours;
  if (code === 'PREP')     return entry.prepHours;
  if (code === 'PAINT')    return entry.paintHours;
  return entry.processes?.find(p => p.code === code)?.hours ?? 0;
}
