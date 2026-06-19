import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import { resolveEstado, isFacturada } from '@/lib/ot-estados';
import { getDmsConnection } from '@/lib/dms-connection';

// ── Mock data (solo dev) ──────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

const MOCK_ROWS: OtRow[] = [
  // ─── NORMAL (< 30 días) — sin alerta ─────────────────────────────────────
  { ot: 100001, codCliente: 'C001', nombreCliente: 'Martina Giménez',    chasis: 'VIN100001', modelo: 'Toyota Hilux 2023',    estadoOt: 'Abierto',              estadoIdis: '', estadoFinanciero: '',          asesor: 'Roberto Díaz',   sucursal: 'Central',   diasIngreso: 2,  diasEnEstado: 2,  fechaIngreso: daysAgo(2),  horaIngreso: '08:15', fechaCompromisoCliente: daysFromNow(3), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 450000, observaciones: 'Revisión general', tipoServicio: 'MC' },
  { ot: 100002, codCliente: 'C002', nombreCliente: 'Fernando Rojas',     chasis: 'VIN100002', modelo: 'Ford Ranger 2022',     estadoOt: 'En Mecánica',          estadoIdis: '', estadoFinanciero: '',          asesor: 'Laura Benítez',  sucursal: 'Central',   diasIngreso: 5,  diasEnEstado: 5,  fechaIngreso: daysAgo(5),  horaIngreso: '09:00', fechaCompromisoCliente: daysFromNow(2), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 820000, observaciones: 'Cambio frenos delanteros', tipoServicio: 'MC' },
  { ot: 100003, codCliente: 'C003', nombreCliente: 'Claudia Vera',       chasis: 'VIN100003', modelo: 'VW Amarok 2021',       estadoOt: 'En Diagnóstico',       estadoIdis: '', estadoFinanciero: '',          asesor: 'Miguel Cáceres', sucursal: 'Norte',     diasIngreso: 8,  diasEnEstado: 3,  fechaIngreso: daysAgo(8),  horaIngreso: '10:30', fechaCompromisoCliente: daysFromNow(5), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 150000, observaciones: 'Diagnóstico eléctrico', tipoServicio: 'SC' },
  { ot: 100004, codCliente: 'C004', nombreCliente: 'Diego Paredes',      chasis: 'VIN100004', modelo: 'Chevrolet S10 2023',   estadoOt: 'En proceso',           estadoIdis: '', estadoFinanciero: '',          asesor: 'Roberto Díaz',   sucursal: 'Norte',     diasIngreso: 12, diasEnEstado: 12, fechaIngreso: daysAgo(12), horaIngreso: '08:00', fechaCompromisoCliente: daysFromNow(1), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 600000, observaciones: 'Service completo', tipoServicio: 'SC' },
  { ot: 100005, codCliente: 'C005', nombreCliente: 'Patricia Almada',    chasis: 'VIN100005', modelo: 'Nissan Frontier 2022', estadoOt: 'Chapería',             estadoIdis: '', estadoFinanciero: '',          asesor: 'Ana Soria',      sucursal: 'Central',   diasIngreso: 18, diasEnEstado: 10, fechaIngreso: daysAgo(18), horaIngreso: '08:45', fechaCompromisoCliente: daysFromNow(4), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 1200000, observaciones: 'Choque lateral', tipoServicio: 'MC' },
  { ot: 100006, codCliente: 'C006', nombreCliente: 'Hernán Fleitas',     chasis: 'VIN100006', modelo: 'Mitsubishi L200 2023', estadoOt: 'Pintura',              estadoIdis: '', estadoFinanciero: '',          asesor: 'Ana Soria',      sucursal: 'Sur',       diasIngreso: 22, diasEnEstado: 8,  fechaIngreso: daysAgo(22), horaIngreso: '07:30', fechaCompromisoCliente: daysFromNow(2), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 980000, observaciones: 'Pintura completa capot', tipoServicio: 'MC' },
  { ot: 100007, codCliente: 'C007', nombreCliente: 'Silvia Insfrán',     chasis: 'VIN100007', modelo: 'Toyota Corolla 2022',  estadoOt: 'Control Final',        estadoIdis: '', estadoFinanciero: '',          asesor: 'Laura Benítez',  sucursal: 'Central',   diasIngreso: 25, diasEnEstado: 2,  fechaIngreso: daysAgo(25), horaIngreso: '09:15', fechaCompromisoCliente: daysFromNow(1), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 540000, observaciones: 'Revisión final', tipoServicio: 'GAR' },

  // ─── ATRASO (30–60 días) — borde ámbar ───────────────────────────────────
  { ot: 100008, codCliente: 'C008', nombreCliente: 'Ricardo Acuña',      chasis: 'VIN100008', modelo: 'Ford Ka 2021',         estadoOt: 'Pendiente de aprobación de cliente', estadoIdis: '', estadoFinanciero: '', asesor: 'Roberto Díaz', sucursal: 'Central', diasIngreso: 32, diasEnEstado: 20, fechaIngreso: daysAgo(32), horaIngreso: '08:00', fechaCompromisoCliente: daysAgo(2), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 320000, observaciones: 'Esperando aprobación de presupuesto', tipoServicio: 'MC' },
  { ot: 100009, codCliente: 'C009', nombreCliente: 'Valeria Cardozo',    chasis: 'VIN100009', modelo: 'Renault Duster 2022',  estadoOt: 'En Presupuesto',       estadoIdis: '', estadoFinanciero: '',          asesor: 'Miguel Cáceres', sucursal: 'Norte',   diasIngreso: 38, diasEnEstado: 38, fechaIngreso: daysAgo(38), horaIngreso: '10:00', fechaCompromisoCliente: null, fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 0, observaciones: 'Presupuesto en elaboración', tipoServicio: 'MC' },
  { ot: 100010, codCliente: 'C010', nombreCliente: 'Omar Villalba',      chasis: 'VIN100010', modelo: 'Honda Civic 2020',     estadoOt: 'Pendiente por repuesto externo', estadoIdis: '', estadoFinanciero: '', asesor: 'Ana Soria', sucursal: 'Sur', diasIngreso: 45, diasEnEstado: 30, fechaIngreso: daysAgo(45), horaIngreso: '08:30', fechaCompromisoCliente: daysAgo(5), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 750000, observaciones: 'Esperando repuesto importado', tipoServicio: 'GAR' },
  { ot: 100011, codCliente: 'C011', nombreCliente: 'Natalia Espínola',   chasis: 'VIN100011', modelo: 'Kia Sportage 2021',    estadoOt: 'En Chapería y Pintura',estadoIdis: '', estadoFinanciero: '',          asesor: 'Laura Benítez',  sucursal: 'Central', diasIngreso: 52, diasEnEstado: 40, fechaIngreso: daysAgo(52), horaIngreso: '09:00', fechaCompromisoCliente: daysFromNow(3), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 2100000, observaciones: 'Siniestro total parcial', tipoServicio: 'MC' },
  { ot: 100012, codCliente: 'C012', nombreCliente: 'Carlos Martínez',    chasis: 'VIN100012', modelo: 'Jeep Cherokee 2022',   estadoOt: 'Preparación',          estadoIdis: '', estadoFinanciero: '',          asesor: 'Roberto Díaz',   sucursal: 'Norte',   diasIngreso: 58, diasEnEstado: 15, fechaIngreso: daysAgo(58), horaIngreso: '07:45', fechaCompromisoCliente: daysFromNow(7), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 890000, observaciones: 'Preparación para pintura', tipoServicio: 'MC' },

  // ─── CRÍTICO (> 60 días) — borde rojo ────────────────────────────────────
  { ot: 100013, codCliente: 'C013', nombreCliente: 'Gustavo Benítez',    chasis: 'VIN100013', modelo: 'Toyota RAV4 2020',     estadoOt: 'Pendiente por repuesto interno', estadoIdis: '', estadoFinanciero: '', asesor: 'Ana Soria', sucursal: 'Sur', diasIngreso: 65, diasEnEstado: 50, fechaIngreso: daysAgo(65), horaIngreso: '08:00', fechaCompromisoCliente: daysAgo(10), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 480000, observaciones: 'Repuesto en pedido — sin fecha estimada', tipoServicio: 'SC' },
  { ot: 100014, codCliente: 'C014', nombreCliente: 'Irene Morales',      chasis: 'VIN100014', modelo: 'Hyundai Tucson 2021',  estadoOt: 'Pendiente trabajo externo',     estadoIdis: '', estadoFinanciero: '', asesor: 'Miguel Cáceres', sucursal: 'Central', diasIngreso: 78, diasEnEstado: 60, fechaIngreso: daysAgo(78), horaIngreso: '09:30', fechaCompromisoCliente: daysAgo(18), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 1350000, observaciones: 'Trabajo externo de electrónica avanzada', tipoServicio: 'INT' },
  { ot: 100015, codCliente: 'C015', nombreCliente: 'Jorge Riquelme',     chasis: 'VIN100015', modelo: 'Ford Explorer 2019',   estadoOt: 'Pendiente de aprobación garantía', estadoIdis: '', estadoFinanciero: '', asesor: 'Laura Benítez', sucursal: 'Norte', diasIngreso: 92, diasEnEstado: 80, fechaIngreso: daysAgo(92), horaIngreso: '08:15', fechaCompromisoCliente: daysAgo(22), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 0, observaciones: 'Garantía pendiente respuesta de casa matriz', tipoServicio: 'GAR' },
  { ot: 100016, codCliente: 'C016', nombreCliente: 'Liliana Cáceres',    chasis: 'VIN100016', modelo: 'Nissan Sentra 2021',   estadoOt: 'En proceso',            estadoIdis: '', estadoFinanciero: '',          asesor: 'Roberto Díaz',   sucursal: 'Sur',   diasIngreso: 110, diasEnEstado: 90, fechaIngreso: daysAgo(110), horaIngreso: '10:00', fechaCompromisoCliente: daysAgo(40), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 670000, observaciones: 'Problema complejo de transmisión', tipoServicio: 'MC' },

  // ─── FACTURADA (cliente OK, cierre operativo pendiente) — borde verde ────
  { ot: 100017, codCliente: 'C017', nombreCliente: 'Beatriz Sotelo',     chasis: 'VIN100017', modelo: 'Honda HR-V 2022',      estadoOt: 'Finalizado con repuesto a colocar', estadoIdis: '', estadoFinanciero: 'FACTURADO', asesor: 'Ana Soria', sucursal: 'Central', diasIngreso: 15, diasEnEstado: 5, fechaIngreso: daysAgo(15), horaIngreso: '08:00', fechaCompromisoCliente: daysFromNow(2), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 360000, observaciones: 'Facturado — falta colocar moldura', tipoServicio: 'SC' },
  { ot: 100018, codCliente: 'C018', nombreCliente: 'Marcos Duarte',      chasis: 'VIN100018', modelo: 'Suzuki Vitara 2023',   estadoOt: 'Montaje',               estadoIdis: '', estadoFinanciero: 'FACTURADO', asesor: 'Miguel Cáceres', sucursal: 'Norte', diasIngreso: 45, diasEnEstado: 20, fechaIngreso: daysAgo(45), horaIngreso: '09:00', fechaCompromisoCliente: daysAgo(3), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 1800000, observaciones: 'Facturado — en montaje final', tipoServicio: 'MC' },
  { ot: 100019, codCliente: 'C019', nombreCliente: 'Rosalba Ferreira',   chasis: 'VIN100019', modelo: 'Mazda CX-5 2021',      estadoOt: 'Procesamiento',         estadoIdis: '', estadoFinanciero: 'FACTURADO', asesor: 'Laura Benítez', sucursal: 'Sur', diasIngreso: 72, diasEnEstado: 5, fechaIngreso: daysAgo(72), horaIngreso: '10:30', fechaCompromisoCliente: daysAgo(12), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 920000, observaciones: 'Facturado — cierre administrativo', tipoServicio: 'INT' },

  // ─── VARIOS estados con compromiso vencido ────────────────────────────────
  { ot: 100020, codCliente: 'C020', nombreCliente: 'Alejandro Sosa',     chasis: 'VIN100020', modelo: 'Toyota Yaris 2022',    estadoOt: 'Completa repuestos',    estadoIdis: '', estadoFinanciero: '',          asesor: 'Roberto Díaz',   sucursal: 'Central', diasIngreso: 10, diasEnEstado: 10, fechaIngreso: daysAgo(10), horaIngreso: '08:00', fechaCompromisoCliente: daysAgo(2), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 290000, observaciones: 'Compromiso vencido — normal en días', tipoServicio: 'SC' },
  { ot: 100021, codCliente: 'C021', nombreCliente: 'Carmen Lugo',        chasis: 'VIN100021', modelo: 'Peugeot 3008 2022',    estadoOt: 'Pulida',                estadoIdis: '', estadoFinanciero: '',          asesor: 'Ana Soria',      sucursal: 'Norte', diasIngreso: 20, diasEnEstado: 7,  fechaIngreso: daysAgo(20), horaIngreso: '11:00', fechaCompromisoCliente: null, fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 680000, observaciones: 'Pulido post pintura', tipoServicio: 'MC' },
  { ot: 100022, codCliente: 'C022', nombreCliente: 'Walter Cabral',      chasis: 'VIN100022', modelo: 'Renault Logan 2021',   estadoOt: 'Reparación de llantas', estadoIdis: '', estadoFinanciero: '',          asesor: 'Miguel Cáceres', sucursal: 'Sur', diasIngreso: 3, diasEnEstado: 3, fechaIngreso: daysAgo(3), horaIngreso: '09:30', fechaCompromisoCliente: daysFromNow(1), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 85000, observaciones: 'Reparación llanta trasera', tipoServicio: 'MC' },
  { ot: 100023, codCliente: 'C023', nombreCliente: 'Estela Portillo',    chasis: 'VIN100023', modelo: 'Citroën C4 2023',      estadoOt: 'Pendiente de ingreso al taller', estadoIdis: '', estadoFinanciero: '', asesor: 'Laura Benítez', sucursal: 'Central', diasIngreso: 1, diasEnEstado: 1, fechaIngreso: daysAgo(1), horaIngreso: '14:00', fechaCompromisoCliente: daysFromNow(5), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 0, observaciones: 'Agendado, aún no ingresó', tipoServicio: 'SC' },
  { ot: 100024, codCliente: 'C024', nombreCliente: 'Rubén Salas',        chasis: 'VIN100024', modelo: 'Hyundai i30 2022',     estadoOt: 'Pendiente por cambio de prioridad', estadoIdis: '', estadoFinanciero: '', asesor: 'Roberto Díaz', sucursal: 'Norte', diasIngreso: 48, diasEnEstado: 10, fechaIngreso: daysAgo(48), horaIngreso: '08:00', fechaCompromisoCliente: daysAgo(8), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 430000, observaciones: 'Prioridad cambiada por garantía urgente', tipoServicio: 'GAR' },
  { ot: 100025, codCliente: 'C025', nombreCliente: 'Delia Ayala',        chasis: 'VIN100025', modelo: 'Fiat Cronos 2023',     estadoOt: 'Pendiente por cotización de repuestos', estadoIdis: '', estadoFinanciero: '', asesor: 'Ana Soria', sucursal: 'Sur', diasIngreso: 35, diasEnEstado: 20, fechaIngreso: daysAgo(35), horaIngreso: '10:15', fechaCompromisoCliente: daysAgo(5), fechaCompromisoTaller: null, fechaFinalizado: null, montoTotal: 0, observaciones: 'Cotizando repuesto de suspensión', tipoServicio: 'MC' },
];

function buildMockResponse(soloAbiertas: boolean, estado: string) {
  let rows = MOCK_ROWS;
  if (estado) rows = rows.filter(r => r.estadoOt === estado);
  if (soloAbiertas) rows = rows.filter(r => r.estadoOt !== 'Finalizado');
  const summary: Record<string, number> = {};
  for (const r of rows) summary[r.estadoOt] = (summary[r.estadoOt] ?? 0) + 1;
  return { data: rows, summary, facturadas: rows.filter(r => isFacturada(r.estadoFinanciero)).length, total: rows.length, truncated: false, days: 365, cachedAt: new Date().toISOString(), source: 'mock' };
}

const HARD_LIMIT = 10000;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 20;
const ALLOWED_DAYS = new Set([30, 90, 180, 365, 0]);

// El cache guarda la PROMESA en curso (single-flight). Si dos requests llegan
// simultáneos con la misma key, la 2da espera al resultado de la 1ra en lugar
// de abrir una segunda conexión MySQL.
type CacheEntry = { ts: number; payload: Promise<unknown> };
const cache = new Map<string, CacheEntry>();

function cacheSet(key: string, payload: Promise<unknown>) {
  cache.set(key, { ts: Date.now(), payload });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

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

async function fetchFromDms(estado: string, soloAbiertas: boolean, days: number) {
  let connection: mysql.Connection | null = null;
  try {
    connection = await getDmsConnection();

    const conditions: string[] = [];
    const params: any[] = [];

    if (estado) {
      conditions.push('CONVERT(c.ESTADOOT USING utf8mb4) = ?');
      params.push(estado);
    } else if (soloAbiertas) {
      conditions.push("CONVERT(c.ESTADOOT USING utf8mb4) != 'Finalizado'");
    }

    if (days > 0) {
      conditions.push('c.fechaingreso >= DATE_SUB(CURDATE(), INTERVAL ? DAY)');
      params.push(days);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        c.OT, c.CODCLIENTE, TRIM(c.NOMBRECLIENTE) AS NOMBRECLIENTE,
        TRIM(c.CHASIS) AS CHASIS, TRIM(c.MODELO) AS MODELO,
        c.ESTADOOT, c.ESTADOIDIS, c.ESTADOFINANCIERO,
        TRIM(c.ASESOR) AS ASESOR, TRIM(c.SUCURSAL) AS SUCURSAL,
        c.DIASINGRESO, c.fechaingreso,
        c.FechaCompromisoClienteMaster, c.FechaCompromisoTaller,
        c.FechaFinalizado, c.MONTOTOTAL,
        TRIM(c.OBSERVACIONES) AS OBSERVACIONES,
        TRIM(c.TipoServicio) AS TipoServicio,
        f.horaingreso
      FROM v_maestro_ot_condor c
      LEFT JOIN (SELECT nroot, MIN(horaingreso) AS horaingreso FROM v_maestro_ot_filtros WHERE horaingreso IS NOT NULL AND TRIM(horaingreso) <> '' GROUP BY nroot) f ON f.nroot = c.OT
      ${whereClause}
      ORDER BY c.fechaingreso DESC
      LIMIT ${HARD_LIMIT}`,
      params,
    );

    const data: OtRow[] = rows.map(r => {
      // Calculamos los días desde fechaingreso. NO confiamos en DIASINGRESO del DMS:
      // se ha visto inconsistencia (ej. OT 437251 ingresó 2026-02-02 pero DMS dice 0).
      // Probablemente DIASINGRESO mide días desde el último cambio de estado, no desde
      // el ingreso real al taller — engañoso para la operación.
      const fechaIngresoIso = r.fechaingreso
        ? new Date(r.fechaingreso).toISOString().split('T')[0]
        : null;
      const diasCalc = fechaIngresoIso
        ? Math.floor((Date.now() - new Date(fechaIngresoIso + 'T00:00:00Z').getTime()) / 86_400_000)
        : 0;

      return {
        ot:                    Number(r.OT),
        codCliente:            String(r.CODCLIENTE ?? '').trim(),
        nombreCliente:         String(r.NOMBRECLIENTE ?? '').trim(),
        chasis:                String(r.CHASIS ?? '').trim(),
        modelo:                String(r.MODELO ?? '').trim(),
        estadoOt:              resolveEstado(String(r.ESTADOOT ?? '').trim()),
        estadoIdis:            String(r.ESTADOIDIS ?? '').trim(),
        estadoFinanciero:      String(r.ESTADOFINANCIERO ?? '').trim(),
        asesor:                String(r.ASESOR ?? '').trim(),
        sucursal:              String(r.SUCURSAL ?? '').trim(),
        diasIngreso:           Math.max(0, diasCalc),
        diasEnEstado:          Number(r.DIASINGRESO ?? 0),
        fechaIngreso:          fechaIngresoIso,
        horaIngreso:           r.horaingreso ? String(r.horaingreso).trim() : null,
        fechaCompromisoCliente: r.FechaCompromisoClienteMaster ? new Date(r.FechaCompromisoClienteMaster).toISOString().split('T')[0] : null,
        fechaCompromisoTaller:  r.FechaCompromisoTaller ? new Date(r.FechaCompromisoTaller).toISOString().split('T')[0] : null,
        fechaFinalizado:        r.FechaFinalizado ? new Date(r.FechaFinalizado).toISOString().split('T')[0] : null,
        montoTotal:            Number(r.MONTOTOTAL ?? 0),
        observaciones:         String(r.OBSERVACIONES ?? '').trim(),
        tipoServicio:          String(r.TipoServicio ?? '').trim(),
      };
    });

    const summary: Record<string, number> = {};
    for (const row of data) {
      const k = row.estadoOt;
      summary[k] = (summary[k] ?? 0) + 1;
    }

    // Cuántas de las abiertas ya están facturadas — el cliente no presiona, son
    // "OK financiero · pendiente operativa". Sirve para diferenciarlas en la UI.
    const facturadas = data.filter(r => isFacturada(r.estadoFinanciero)).length;

    const truncated = data.length === HARD_LIMIT;
    return { data, summary, facturadas, total: data.length, truncated, days, cachedAt: new Date().toISOString() };
  } finally {
    await connection?.end();
  }
}

// Snapshot cacheado por el worker NestJS. Si está disponible y fresco, lo usamos
// y evitamos pegarle al DMS. Si falla o no existe, caemos al MySQL directo.
const NESTJS_API   = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const STALE_AFTER_MS = 15 * 60_000; // si el snapshot tiene > 15 min, mejor refetch directo
const PRESET_DAYS    = new Set([90, 365]); // los scopes que el worker pre-genera

interface SnapshotResponse {
  available: boolean;
  scope: string;
  ageSeconds?: number;
  fetchedAt?: string;
  payload?: any;
  lastError?: string | null;
}

async function tryReadSnapshot(days: number, soloAbiertas: boolean): Promise<SnapshotResponse | null> {
  if (!soloAbiertas || !PRESET_DAYS.has(days)) return null; // no hay preset para este scope
  try {
    const url = `${NESTJS_API}/dms-sync/ot-seguimiento?days=${days}&soloAbiertas=${soloAbiertas}`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const json = (await res.json()) as SnapshotResponse;
    if (!json.available || !json.payload) return null;
    if ((json.ageSeconds ?? 0) * 1000 > STALE_AFTER_MS) return null; // snapshot demasiado viejo
    return json;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const estado = req.nextUrl.searchParams.get('estado')?.trim() ?? '';
  const soloAbiertas = req.nextUrl.searchParams.get('soloAbiertas') !== 'false';

  if (req.nextUrl.searchParams.get('mock') === '1' && process.env.NODE_ENV !== 'production') {
    return NextResponse.json(buildMockResponse(soloAbiertas, estado), { headers: { 'X-Source': 'mock' } });
  }

  const daysParam = Number(req.nextUrl.searchParams.get('days') ?? '90');
  const days = ALLOWED_DAYS.has(daysParam) ? daysParam : 90;

  // ── Camino A: snapshot del worker (cuando aplica) ──
  const forceA   = req.nextUrl.searchParams.get('force') === '1';
  const snapshot = forceA ? null : await tryReadSnapshot(days, soloAbiertas);
  if (snapshot && snapshot.payload?.data) {
    let data = (snapshot.payload.data as any[]).map(r => {
      // Recalculamos diasIngreso siempre desde fechaIngreso para evitar datos congelados del snapshot.
      const diasCalc = r.fechaIngreso
        ? Math.floor((Date.now() - new Date(r.fechaIngreso + 'T00:00:00Z').getTime()) / 86_400_000)
        : 0;
      return { ...r, diasIngreso: Math.max(0, diasCalc) };
    });
    // Filtro de estado client-side sobre el snapshot (que trae todas las abiertas).
    if (estado) {
      data = data.filter(r => r.estadoOt === estado);
    }
    const summary: Record<string, number> = {};
    for (const row of data) {
      const k = row.estadoOt;
      summary[k] = (summary[k] ?? 0) + 1;
    }
    const facturadas = data.filter(r => isFacturada(r.estadoFinanciero)).length;
    return NextResponse.json(
      {
        data,
        summary,
        facturadas,
        total: data.length,
        truncated: !!snapshot.payload.truncated,
        days,
        cachedAt: snapshot.fetchedAt,
        source: 'worker-snapshot',
        ageSeconds: snapshot.ageSeconds,
      },
      {
        headers: {
          'X-Source':            'worker-snapshot',
          'X-Snapshot-Age-Seconds': String(snapshot.ageSeconds ?? 0),
        },
      },
    );
  }

  // ── Camino B: fallback al DMS directo (lo que hacía antes) ──
  const force     = req.nextUrl.searchParams.get('force') === '1';
  const cacheKey  = `${estado}|${soloAbiertas ? 1 : 0}|${days}`;
  const hit       = cache.get(cacheKey);

  if (!force && hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    try {
      const payload = await hit.payload;
      return NextResponse.json(payload, { headers: { 'X-Source': 'direct-cache' } });
    } catch {
      // Si la promise cacheada falló, caemos al fetch normal.
    }
  }

  const inflight = fetchFromDms(estado, soloAbiertas, days);
  cacheSet(cacheKey, inflight);

  try {
    const payload = await inflight;
    return NextResponse.json(payload, { headers: { 'X-Source': 'direct-fresh' } });
  } catch (err: any) {
    console.error('[ot-seguimiento]', err.message);
    cache.delete(cacheKey);
    return NextResponse.json({ error: 'Error al conectar con DMS' }, { status: 500 });
  }
}
