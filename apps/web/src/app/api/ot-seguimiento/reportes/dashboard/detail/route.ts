import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const DMS_CONFIG = {
  host:           process.env.DMS_HOST,
  port:    Number(process.env.DMS_PORT ?? 3306),
  user:           process.env.DMS_USER,
  password:       process.env.DMS_PASSWORD,
  database:       process.env.DMS_DATABASE ?? 'controltiempo',
  connectTimeout: 20000,
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ts: number; payload: unknown }>();

export type KpiKind =
  | 'abiertas'        // todas las OTs abiertas (excluye facturadas)
  | 'vencidas'        // compromiso vencido y abiertas
  | 'atrasoCritico'   // > 30 días en taller, abiertas
  | 'diasPromedio'    // mismo set que abiertas pero ordenado por días desc
  | 'montoTotal'      // abiertas, ordenadas por monto desc
  | 'tasaCierre30d'   // todas las del último mes
  | 'antiguedad'      // OTs abiertas filtradas por bucket de DIASINGRESO (param bucket=...)
  | 'facturadas'      // OTs abiertas y facturadas (cliente OK · solo cierre operativo pendiente)
;

const KPI_TITLES: Record<KpiKind, string> = {
  abiertas:       'OTs abiertas',
  vencidas:       'Compromisos vencidos',
  atrasoCritico:  'OTs con atraso crítico (+30 días)',
  diasPromedio:   'OTs ordenadas por días en taller',
  montoTotal:     'OTs por monto en taller',
  tasaCierre30d:  'OTs últimos 30 días — tasa de cierre',
  antiguedad:     'OTs por antigüedad',
  facturadas:     'OTs facturadas · cliente OK · cierre operativo pendiente',
};

// Buckets de antigüedad → predicado SQL sobre DIASINGRESO
export type AntiguedadBucket =
  | 'Reciente · 0-7 d'
  | 'Normal · 8-14 d'
  | 'Demora · 15-30 d'
  | 'Atraso alto · 31-60 d'
  | 'Atraso crítico · 61-90 d'
  | 'Congelada · +90 d';

const ANTIGUEDAD_PREDICATE: Record<AntiguedadBucket, string> = {
  'Reciente · 0-7 d':         'DIASINGRESO BETWEEN 0 AND 7',
  'Normal · 8-14 d':          'DIASINGRESO BETWEEN 8 AND 14',
  'Demora · 15-30 d':         'DIASINGRESO BETWEEN 15 AND 30',
  'Atraso alto · 31-60 d':    'DIASINGRESO BETWEEN 31 AND 60',
  'Atraso crítico · 61-90 d': 'DIASINGRESO BETWEEN 61 AND 90',
  'Congelada · +90 d':        'DIASINGRESO > 90',
};

export interface DetailRow {
  ot: number;
  cliente: string;
  modelo: string;
  chasis: string;
  sucursal: string;
  estadoOt: string;
  tipoServicio: string;
  asesor: string;
  fechaIngreso: string | null;
  horaIngreso: string | null;
  fechaCompromiso: string | null;
  fechaFinalizado: string | null;
  diasIngreso: number;
  diasRetraso: number;
  monto: number;
}

export interface DetailPayload {
  kpi:     KpiKind;
  title:   string;
  total:   number;
  rows:    DetailRow[];
  filters: { days: number; sucursal: string; tipo: string };
  generatedAt: string;
}

export async function GET(req: NextRequest) {
  const kpi         = (req.nextUrl.searchParams.get('kpi') ?? 'abiertas') as KpiKind;
  const days        = Math.max(1, Math.min(720, Number(req.nextUrl.searchParams.get('days') ?? 365)));
  const sucursal    = req.nextUrl.searchParams.get('sucursal')?.trim() ?? '';
  const tipo        = req.nextUrl.searchParams.get('tipo')?.trim() ?? '';
  const bucket      = (req.nextUrl.searchParams.get('bucket')?.trim() ?? '') as AntiguedadBucket | '';
  const estadoDrill = req.nextUrl.searchParams.get('estadoDrill')?.trim() ?? '';
  const force       = req.nextUrl.searchParams.get('force') === '1';

  if (!KPI_TITLES[kpi]) {
    return NextResponse.json({ error: 'KPI inválido' }, { status: 400 });
  }
  if (kpi === 'antiguedad' && (!bucket || !ANTIGUEDAD_PREDICATE[bucket])) {
    return NextResponse.json({ error: 'Bucket de antigüedad inválido' }, { status: 400 });
  }

  const cacheKey = `${kpi}|d=${days}|s=${sucursal}|t=${tipo}|b=${bucket}|e=${estadoDrill}`;
  if (!force) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload);
    }
  }

  const params: any[] = [];
  let baseWhere = '';
  const abiertaCond     = `(CONVERT(ESTADOOT USING utf8mb4) <> 'Finalizado' AND FechaFinalizado IS NULL)`;
  const noFacturadaCond = `(ESTADOFINANCIERO IS NULL OR TRIM(UPPER(CONVERT(ESTADOFINANCIERO USING utf8mb4))) <> 'FACTURADO')`;
  const facturadaCond   = `TRIM(UPPER(CONVERT(ESTADOFINANCIERO USING utf8mb4))) = 'FACTURADO'`;

  // Construir WHERE según el KPI
  let kpiWhere = '';
  let orderBy  = 'fechaingreso DESC';
  let limit    = 500;

  if (kpi === 'tasaCierre30d') {
    baseWhere = 'WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    orderBy   = 'fechaingreso DESC';
  } else {
    baseWhere = 'WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL ? DAY)';
    params.push(days);

    if (kpi === 'abiertas')      { kpiWhere = ` AND ${abiertaCond} AND ${noFacturadaCond}`; }
    if (kpi === 'vencidas')      { kpiWhere = ` AND FechaCompromisoClienteMaster IS NOT NULL AND FechaCompromisoClienteMaster < CURDATE() AND FechaFinalizado IS NULL AND ${noFacturadaCond}`; }
    if (kpi === 'atrasoCritico') { kpiWhere = ` AND ${abiertaCond} AND DIASINGRESO > 30 AND ${noFacturadaCond}`; }
    if (kpi === 'diasPromedio')  { kpiWhere = ` AND ${abiertaCond} AND ${noFacturadaCond}`; orderBy = 'DIASINGRESO DESC'; }
    if (kpi === 'montoTotal')    { kpiWhere = ` AND ${abiertaCond} AND ${noFacturadaCond}`; orderBy = 'MONTOTOTAL DESC'; }
    if (kpi === 'facturadas')    { kpiWhere = ` AND ${abiertaCond} AND ${facturadaCond}`;   orderBy = 'DIASINGRESO DESC'; }
    if (kpi === 'antiguedad' && bucket) {
      kpiWhere = ` AND ${abiertaCond} AND ${noFacturadaCond} AND ${ANTIGUEDAD_PREDICATE[bucket]}`;
      orderBy  = 'DIASINGRESO DESC';
    }
  }

  if (sucursal)    { baseWhere += ' AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?';     params.push(sucursal); }
  if (tipo)        { baseWhere += ' AND TRIM(CONVERT(TipoServicio USING utf8mb4)) = ?'; params.push(tipo); }
  if (estadoDrill) { kpiWhere  += ' AND TRIM(CONVERT(ESTADOOT USING utf8mb4)) = ?';     params.push(estadoDrill); }

  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection(DMS_CONFIG);

    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        OT,
        TRIM(CONVERT(NOMBRECLIENTE USING utf8mb4)) AS cliente,
        TRIM(CONVERT(MODELO USING utf8mb4))        AS modelo,
        TRIM(CONVERT(CHASIS USING utf8mb4))        AS chasis,
        TRIM(CONVERT(SUCURSAL USING utf8mb4))      AS sucursal,
        TRIM(CONVERT(ESTADOOT USING utf8mb4))      AS estado_ot,
        TRIM(CONVERT(TipoServicio USING utf8mb4))  AS tipo_servicio,
        TRIM(CONVERT(ASESOR USING utf8mb4))        AS asesor,
        fechaingreso,
        TRIM(f.horaingreso)          AS hora_ingreso,
        FechaCompromisoClienteMaster AS fecha_compromiso,
        FechaFinalizado              AS fecha_finalizado,
        DIASINGRESO                   AS dias_ingreso,
        CASE
          WHEN FechaCompromisoClienteMaster IS NOT NULL AND FechaFinalizado IS NULL
            THEN DATEDIFF(CURDATE(), FechaCompromisoClienteMaster)
          ELSE 0
        END AS dias_retraso,
        MONTOTOTAL AS monto
      FROM v_maestro_ot_condor
      LEFT JOIN (SELECT nroot, MIN(horaingreso) AS horaingreso FROM v_maestro_ot_filtros WHERE horaingreso IS NOT NULL AND TRIM(horaingreso) <> '' GROUP BY nroot) f ON f.nroot = OT
      ${baseWhere}${kpiWhere}
      ORDER BY ${orderBy}
      LIMIT ${limit}`,
      params,
    );

    const detailRows: DetailRow[] = rows.map(r => ({
      ot:              Number(r.OT),
      cliente:         String(r.cliente ?? ''),
      modelo:          String(r.modelo ?? ''),
      chasis:          String(r.chasis ?? ''),
      sucursal:        String(r.sucursal ?? ''),
      estadoOt:        String(r.estado_ot ?? ''),
      tipoServicio:    String(r.tipo_servicio ?? ''),
      asesor:          String(r.asesor ?? ''),
      fechaIngreso:    r.fechaingreso     ? new Date(r.fechaingreso).toISOString().split('T')[0]     : null,
      horaIngreso:     r.hora_ingreso     ? String(r.hora_ingreso).trim() || null : null,
      fechaCompromiso: r.fecha_compromiso ? new Date(r.fecha_compromiso).toISOString().split('T')[0] : null,
      fechaFinalizado: r.fecha_finalizado ? new Date(r.fecha_finalizado).toISOString().split('T')[0] : null,
      diasIngreso:     Number(r.dias_ingreso ?? 0),
      diasRetraso:     Number(r.dias_retraso ?? 0),
      monto:           Number(r.monto ?? 0),
    }));

    const title = kpi === 'antiguedad' && bucket
      ? `OTs en bucket "${bucket}"`
      : estadoDrill
      ? `OTs abiertas — estado "${estadoDrill}"`
      : KPI_TITLES[kpi];

    const payload: DetailPayload = {
      kpi,
      title,
      total:       detailRows.length,
      rows:        detailRows,
      filters:     { days, sucursal, tipo },
      generatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('[reportes/dashboard/detail]', err.message);
    return NextResponse.json({ error: 'Error al cargar el detalle del KPI' }, { status: 500 });
  } finally {
    await connection?.end();
  }
}
