// ─── DMS OT shared types ─────────────────────────────────────────────────────
// These types were previously co-located with the Next.js API route handlers.
// They are extracted here so that UI components can import them without coupling
// to the route implementation, which is now a thin proxy to NestJS.

// ── /api/ot-seguimiento ───────────────────────────────────────────────────────

export interface OtRow {
  ot: number;
  codCliente: string;
  nombreCliente: string;
  chasis: string;
  modelo: string;
  estadoOt: string;
  estadoIdis: string;
  estadoFinanciero: string;
  asesor: string;
  sucursal: string;
  diasIngreso: number;
  diasEnEstado: number;
  fechaIngreso: string | null;
  horaIngreso: string | null;
  fechaCompromisoCliente: string | null;
  fechaCompromisoTaller: string | null;
  fechaFinalizado: string | null;
  montoTotal: number;
  observaciones: string;
  tipoServicio: string;
}

// ── /api/ot-seguimiento/operativo ────────────────────────────────────────────

export type Periodo = 'hoy' | 'semana';

export interface VencidoRow {
  ot: number;
  cliente: string;
  modelo: string;
  asesor: string;
  sucursal: string;
  fechaCompromiso: string;
  diasVencido: number;
  diasEnTaller: number;
}

export interface ProximoVencerRow {
  ot: number;
  cliente: string;
  modelo: string;
  asesor: string;
  fechaCompromiso: string;
  diasRestantes: number;
}

export interface AsesorOpRow {
  asesor: string;
  ingresados: number;
  cerrados: number;
  vencidos: number;
  diasPromCierre: number;
}

export interface DistribucionRow {
  label: string;
  count: number;
}

export interface FilterOptions {
  sucursales: string[];
  asesores: string[];
}

export type DrillMetric = 'abiertas' | 'criticas' | 'atraso' | 'ingresos' | 'cerrados' | 'vencidos';

export interface DrillRow {
  ot: number;
  cliente: string;
  modelo: string;
  asesor: string;
  estado: string;
  sucursal: string;
  fechaIngreso: string;
  diasEnTaller: number;
  fechaCompromiso?: string;
  fechaCierre?: string;
}

export interface DrillResult {
  metric: DrillMetric;
  label: string;
  rows: DrillRow[];
  total: number;
}

export interface OperativoData {
  periodo: Periodo;
  generatedAt: string;
  otsAbiertas: number;
  otsCriticas: number;
  otsEnAtraso: number;
  diasPromedio: number;
  ingresados: number;
  cerradosEnPeriodo: number;
  tasaCierre: number;
  vencidos: VencidoRow[];
  totalVencidos: number;
  proximosVencer: ProximoVencerRow[];
  distribucion: DistribucionRow[];
  porAsesor: AsesorOpRow[];
  filterOptions: FilterOptions;
}

// ── /api/ot-seguimiento/reportes ─────────────────────────────────────────────

export interface SucursalReportRow {
  sucursal: string;
  total: number;
  abiertas: number;
  vencidas: number;
  diasPromedio: number;
  montoTotal: number;
}

export interface AsesorReportRow {
  asesor: string;
  sucursal: string;
  totalOts: number;
  finalizadas: number;
  abiertas: number;
  diasPromedioCierre: number;
  montoTotal: number;
}

export interface AsesorDetail {
  asesores: string[];
  totalOts: number;
  finalizadas: number;
  abiertas: number;
  tasaCierre: number;
  diasPromedioCierre: number;
  montoTotal: number;
  bySucursal: { sucursal: string; count: number }[];
  byState:    { estado: string; count: number }[];
  byAge:      { bucket: string; count: number }[];
  topOldest:  { ot: number; dias: number; cliente: string; estado: string; asesor: string; sucursal: string; modelo: string; montoTotal: number }[];
  monthlyIn:  { month: string; ingresos: number; finalizadas: number }[];
}

export interface SucursalDetail {
  sucursal: string;
  byState:    { estado: string; count: number }[];
  byAge:      { bucket: string; count: number }[];
  topOldest:  { ot: number; dias: number; cliente: string; estado: string; asesor: string; modelo: string; montoTotal: number }[];
  monthlyIn:  { month: string; ingresos: number; finalizadas: number }[];
}

// ── /api/ot-seguimiento/reportes/dashboard ───────────────────────────────────

export interface DashboardPayload {
  filters: { days: number; dateFrom: string | null; dateTo: string | null; sucursal: string; tipo: string };
  generatedAt: string;
  kpi: {
    totalAbiertas: number;
    vencidas: number;
    atrasoCritico: number;
    montoTotal: number;
    tasaCierre30d: number;
    diasPromedio: number;
    facturadasPendientes: number;
    facturadasMonto: number;
  };
  porEstado:    { estado: string; total: number; vencidas: number }[];
  porSucursal:  { sucursal: string; total: number; abiertas: number; vencidas: number; criticas: number; facturadas: number }[];
  porTipo:      { tipo: string; total: number; monto: number; avgDaysOpen: number; tasaCierre: number }[];
  antiguedad:   { bucket: string; total: number; monto: number }[];
  tendencia:    { mes: string; ingresos: number; finalizadas: number }[];
  vencidasTop:  { ot: number; cliente: string; modelo: string; sucursal: string; estadoOt: string; tipoServicio: string; fechaCompromiso: string; diasRetraso: number; monto: number }[];
  criticasTop:  { ot: number; cliente: string; modelo: string; sucursal: string; estadoOt: string; tipoServicio: string; fechaIngreso: string; fechaCompromiso: string | null; diasIngreso: number; diasRetraso: number; criticidad: number; razon: string; monto: number }[];
  facturadasTop: { ot: number; cliente: string; modelo: string; sucursal: string; estadoOt: string; tipoServicio: string; fechaIngreso: string; horaIngreso: string | null; diasIngreso: number; monto: number }[];
  topAsesores:  { asesor: string; total: number; finalizadas: number; tasaCierre: number; monto: number }[];
}

// ── /api/ot-seguimiento/reportes/dashboard/detail ────────────────────────────

export type KpiKind =
  | 'abiertas'
  | 'vencidas'
  | 'atrasoCritico'
  | 'diasPromedio'
  | 'montoTotal'
  | 'tasaCierre30d'
  | 'antiguedad'
  | 'facturadas'
;

export type AntiguedadBucket =
  | 'Reciente · 0-7 d'
  | 'Normal · 8-14 d'
  | 'Demora · 15-30 d'
  | 'Atraso alto · 31-60 d'
  | 'Atraso crítico · 61-90 d'
  | 'Congelada · +90 d';

export interface DetailRow {
  ot:              number;
  cliente:         string;
  modelo:          string;
  chasis:          string;
  sucursal:        string;
  estadoOt:        string;
  tipoServicio:    string;
  asesor:          string;
  fechaIngreso:    string | null;
  horaIngreso:     string | null;
  fechaCompromiso: string | null;
  fechaFinalizado: string | null;
  diasIngreso:     number;
  diasRetraso:     number;
  monto:           number;
}

export interface DetailPayload {
  kpi:         KpiKind;
  title:       string;
  total:       number;
  rows:        DetailRow[];
  filters:     { days: number; sucursal: string; tipo: string };
  generatedAt: string;
}
