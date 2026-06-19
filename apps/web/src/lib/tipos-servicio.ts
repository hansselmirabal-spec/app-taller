// Mapa único de Tipos de Servicio del DMS Condor.
// Usado por la tabla de seguimiento, los reportes y el dashboard ejecutivo.
// Origen: SELECT DISTINCT TipoServicio FROM v_maestro_ot_condor.

export const TIPO_SERVICIO_LABELS: Record<string, string> = {
  SC:         'Service programado',
  MC:         'Mantenimiento correctivo',
  MP:         'Mantenimiento preventivo',
  SCE:        'Service especial',
  ADM:        'Administrativo',
  RC:         'Reclamo / garantía',
  ACCESORIOS: 'Instalación de accesorios',
  PRE:        'Pre-entrega',
  AF:         'Aviso de falla',
  QS:         'Quality service',
  DG:         'Diagnóstico',
  S24:        'Service 24 hs',
  PU:         'Pick-up',
  MCM:        'Mant. correctivo mayor',
  PDP:        'Pre-entrega posventa',
  MPM:        'Mant. preventivo mayor',
  REST:       'Restauración',
  FRQ:        'Frenos / Quality',
  // Severidades de chapería
  LEVE:       'Chapería · daño leve',
  MEDIO:      'Chapería · daño medio',
  GRAVE:      'Chapería · daño grave',
};

// Devuelve "código · Nombre completo" para tooltips o "Nombre completo (código)" para selectores.
export function tipoServicioLabel(t: string): string {
  if (!t) return '—';
  const code = t.trim().toUpperCase();
  return TIPO_SERVICIO_LABELS[code] ? `${code} · ${TIPO_SERVICIO_LABELS[code]}` : code;
}

// Para selectores: "Mantenimiento correctivo (MC)" — más legible que la sigla sola.
export function tipoServicioOption(t: string): string {
  if (!t) return '—';
  const code  = t.trim().toUpperCase();
  const label = TIPO_SERVICIO_LABELS[code];
  return label ? `${label} (${code})` : code;
}

export interface TipoServicioFamily {
  name: string;
  description: string;
  codes: string[];
  swatch: string;
}

// Familias para la leyenda visual. Orden por frecuencia real en producción.
export const TIPO_SERVICIO_FAMILIES: TipoServicioFamily[] = [
  {
    name: 'Programado · Preventivo',
    description: 'Mantenimiento planificado, services y pre-entregas. El cliente vino agendado.',
    codes: ['SC','MP','SCE','S24','MPM','PRE','PDP'],
    swatch: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    name: 'Correctivo · Falla',
    description: 'Reparaciones por fallas detectadas o reportadas, diagnósticos.',
    codes: ['MC','MCM','AF','DG'],
    swatch: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    name: 'Garantía · Calidad',
    description: 'Reclamos, controles de calidad y garantías de fábrica.',
    codes: ['RC','QS','FRQ'],
    swatch: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    name: 'Administrativo · Otros',
    description: 'Pick-up, instalación de accesorios, restauraciones, trabajos internos.',
    codes: ['ADM','PU','REST','ACCESORIOS'],
    swatch: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    name: 'Chapería · Severidad del daño',
    description: 'Clasificación visual del daño en chapería y pintura.',
    codes: ['LEVE','MEDIO','GRAVE'],
    swatch: 'bg-orange-50 text-orange-700 border-orange-200',
  },
];

export function tipoServicioBadgeClass(t: string): string {
  const code = (t ?? '').trim().toUpperCase();
  if (!code) return 'bg-slate-50 text-slate-400 border-slate-200';
  if (code === 'LEVE')  return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  if (code === 'MEDIO') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (code === 'GRAVE') return 'bg-red-50 text-red-700 border-red-200';
  if (['SC','MP','SCE','S24','MPM','PRE','PDP'].includes(code))
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['MC','MCM','AF','DG'].includes(code))
    return 'bg-blue-50 text-blue-700 border-blue-200';
  if (['RC','QS','FRQ'].includes(code))
    return 'bg-amber-50 text-amber-700 border-amber-200';
  if (['ADM','PU','REST','ACCESORIOS'].includes(code))
    return 'bg-violet-50 text-violet-700 border-violet-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}
