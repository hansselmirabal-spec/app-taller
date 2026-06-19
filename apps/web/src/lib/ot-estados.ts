export interface OtEstado {
  key: string;
  label: string;
  shortLabel?: string;
  color: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  order: number;
  isOpen: boolean;
}

export const OT_ESTADOS: OtEstado[] = [
  // ── Activos / en proceso ──────────────────────────────────────────────────
  { key: 'Abierto',                               label: 'Abierto',                                               color: '#3b82f6', bgColor: 'bg-blue-100',    textColor: 'text-blue-700',    borderColor: 'border-blue-200',    order: 1,  isOpen: true  },
  { key: 'En Presupuesto',                        label: 'En Presupuesto',        shortLabel: 'Presupuesto',     color: '#8b5cf6', bgColor: 'bg-violet-100',  textColor: 'text-violet-700',  borderColor: 'border-violet-200',  order: 2,  isOpen: true  },
  { key: 'En Mecánica',                           label: 'En Mecánica',           shortLabel: 'Mecánica',        color: '#0ea5e9', bgColor: 'bg-sky-100',     textColor: 'text-sky-700',     borderColor: 'border-sky-200',     order: 3,  isOpen: true  },
  { key: 'En proceso',                            label: 'En proceso',            shortLabel: 'Proceso',         color: '#f59e0b', bgColor: 'bg-amber-100',   textColor: 'text-amber-700',   borderColor: 'border-amber-200',   order: 4,  isOpen: true  },
  { key: 'En Diagnóstico',                        label: 'En Diagnóstico',        shortLabel: 'Diagnóstico',     color: '#d97706', bgColor: 'bg-yellow-100',  textColor: 'text-yellow-700',  borderColor: 'border-yellow-200',  order: 5,  isOpen: true  },
  // ── Carrocería y pintura ──────────────────────────────────────────────────
  { key: 'Chapería',                              label: 'Chapería',                                             color: '#f97316', bgColor: 'bg-orange-100',  textColor: 'text-orange-700',  borderColor: 'border-orange-200',  order: 6,  isOpen: true  },
  { key: 'En Chapería y Pintura',                 label: 'En Chapería y Pintura', shortLabel: 'Chap.+Pintura',   color: '#ec4899', bgColor: 'bg-pink-100',    textColor: 'text-pink-700',    borderColor: 'border-pink-200',    order: 7,  isOpen: true  },
  { key: 'Preparación',                           label: 'Preparación',           shortLabel: 'Prep.',           color: '#db2777', bgColor: 'bg-pink-100',    textColor: 'text-pink-700',    borderColor: 'border-pink-200',    order: 8,  isOpen: true  },
  { key: 'Pintura',                               label: 'Pintura',                                              color: '#a855f7', bgColor: 'bg-purple-100',  textColor: 'text-purple-700',  borderColor: 'border-purple-200',  order: 9,  isOpen: true  },
  { key: 'Pulida',                                label: 'Pulida',                                               color: '#e11d48', bgColor: 'bg-rose-100',    textColor: 'text-rose-700',    borderColor: 'border-rose-200',    order: 10, isOpen: true  },
  // ── Ensamble y cierre ─────────────────────────────────────────────────────
  { key: 'Montaje',                               label: 'Montaje',                                              color: '#14b8a6', bgColor: 'bg-teal-100',    textColor: 'text-teal-700',    borderColor: 'border-teal-200',    order: 11, isOpen: true  },
  { key: 'Completa repuestos',                    label: 'Completa repuestos',    shortLabel: 'Comp. rep.',      color: '#0d9488', bgColor: 'bg-teal-100',    textColor: 'text-teal-700',    borderColor: 'border-teal-200',    order: 12, isOpen: true  },
  { key: 'Control Final',                         label: 'Control Final',         shortLabel: 'Control',         color: '#6366f1', bgColor: 'bg-indigo-100',  textColor: 'text-indigo-700',  borderColor: 'border-indigo-200',  order: 13, isOpen: true  },
  { key: 'Procesamiento',                         label: 'Procesamiento',         shortLabel: 'Procesam.',       color: '#4f46e5', bgColor: 'bg-indigo-100',  textColor: 'text-indigo-700',  borderColor: 'border-indigo-200',  order: 14, isOpen: true  },
  { key: 'Reparación de llantas',                 label: 'Rep. de llantas',       shortLabel: 'Llantas',         color: '#78716c', bgColor: 'bg-stone-100',   textColor: 'text-stone-700',   borderColor: 'border-stone-200',   order: 15, isOpen: true  },
  // ── Pendientes ────────────────────────────────────────────────────────────
  { key: 'Pendiente de ingreso al taller',        label: 'Pend. ingreso',         shortLabel: 'Pend. ingreso',   color: '#94a3b8', bgColor: 'bg-slate-100',   textColor: 'text-slate-600',   borderColor: 'border-slate-200',   order: 16, isOpen: true  },
  { key: 'Pendiente de aprobación de cliente',    label: 'Pend. cliente',         shortLabel: 'Pend. cliente',   color: '#ef4444', bgColor: 'bg-red-100',     textColor: 'text-red-700',     borderColor: 'border-red-200',     order: 17, isOpen: true  },
  { key: 'Pendiente de aprobación garantía',      label: 'Pend. garantía',        shortLabel: 'Pend. garantía',  color: '#f87171', bgColor: 'bg-red-50',      textColor: 'text-red-600',     borderColor: 'border-red-200',     order: 18, isOpen: true  },
  { key: 'Pendiente por cambio de prioridad',     label: 'Pend. prioridad',       shortLabel: 'Pend. prior.',    color: '#fb923c', bgColor: 'bg-orange-100',  textColor: 'text-orange-600',  borderColor: 'border-orange-200',  order: 19, isOpen: true  },
  { key: 'Pendiente trabajo externo',             label: 'Pend. externo',         shortLabel: 'Pend. ext.',      color: '#fdba74', bgColor: 'bg-orange-50',   textColor: 'text-orange-600',  borderColor: 'border-orange-200',  order: 20, isOpen: true  },
  { key: 'Pendiente por repuesto externo',        label: 'Pend. rep. ext.',       shortLabel: 'Pend. rep. e.',   color: '#fca5a5', bgColor: 'bg-red-50',      textColor: 'text-red-600',     borderColor: 'border-red-200',     order: 21, isOpen: true  },
  { key: 'Pendiente por repuesto interno',        label: 'Pend. rep. int.',       shortLabel: 'Pend. rep. i.',   color: '#f87171', bgColor: 'bg-red-50',      textColor: 'text-red-600',     borderColor: 'border-red-200',     order: 22, isOpen: true  },
  { key: 'Pendiente por cotización de repuestos', label: 'Pend. cotización',      shortLabel: 'Pend. cotiz.',    color: '#fbbf24', bgColor: 'bg-amber-50',    textColor: 'text-amber-600',   borderColor: 'border-amber-200',   order: 23, isOpen: true  },
  // ── Finalizados ───────────────────────────────────────────────────────────
  { key: 'Finalizado con repuesto a colocar',     label: 'Fin. c/ repuesto',      shortLabel: 'Fin. repuesto',   color: '#84cc16', bgColor: 'bg-lime-100',    textColor: 'text-lime-700',    borderColor: 'border-lime-200',    order: 24, isOpen: true  },
  { key: 'Finalizado con espera de OC',           label: 'Fin. espera OC',        shortLabel: 'Fin. OC',         color: '#65a30d', bgColor: 'bg-lime-100',    textColor: 'text-lime-700',    borderColor: 'border-lime-200',    order: 25, isOpen: false },
  { key: 'Finalizado',                            label: 'Finalizado',                                           color: '#22c55e', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700', borderColor: 'border-emerald-200', order: 26, isOpen: false },
  // ── Comodín ───────────────────────────────────────────────────────────────
  { key: 'Otro',                                  label: 'Otro',                                                 color: '#94a3b8', bgColor: 'bg-slate-100',   textColor: 'text-slate-600',   borderColor: 'border-slate-200',   order: 27, isOpen: true  },
];

export const OT_ESTADOS_MAP = new Map(OT_ESTADOS.map(e => [e.key, e]));

export const OT_ESTADOS_KEYS = OT_ESTADOS.map(e => e.key);

// Variantes ortográficas del DMS (sin tilde, capitalización distinta) → clave canónica
export const OT_ESTADOS_ALIAS: Record<string, string> = {
  'En diagnostico':           'En Diagnóstico',
  'En Diagnostico':           'En Diagnóstico',
  'Preparacion':              'Preparación',
  'Pendiente por repuesto':   'Pendiente por repuesto interno',
};

export const OT_ESTADOS_QUERY_KEYS = [
  ...OT_ESTADOS_KEYS,
  ...Object.keys(OT_ESTADOS_ALIAS),
];

export function getEstado(key: string): OtEstado | undefined {
  const mapped = OT_ESTADOS_ALIAS[key] ?? key;
  return OT_ESTADOS_MAP.get(mapped);
}

export function resolveEstado(key: string): string {
  return OT_ESTADOS_ALIAS[key] ?? key;
}

export function isFacturada(estadoFinanciero: string | null | undefined): boolean {
  if (!estadoFinanciero) return false;
  return estadoFinanciero.trim().toUpperCase() === 'FACTURADO';
}
