import { NextRequest, NextResponse } from 'next/server';
import * as sql from 'mssql';
import { getDmsPool } from '@/lib/dms-connection';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ts: number; payload: unknown }>();

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

export type AntiguedadBucket =
  | 'Reciente · 0-7 d'
  | 'Normal · 8-14 d'
  | 'Demora · 15-30 d'
  | 'Atraso alto · 31-60 d'
  | 'Atraso crítico · 61-90 d'
  | 'Congelada · +90 d';

const DIAS = `DATEDIFF(DAY, m.fechaingreso, GETDATE())`;

const ANTIGUEDAD_PREDICATE: Record<AntiguedadBucket, string> = {
  'Reciente · 0-7 d':         `${DIAS} BETWEEN 0 AND 7`,
  'Normal · 8-14 d':          `${DIAS} BETWEEN 8 AND 14`,
  'Demora · 15-30 d':         `${DIAS} BETWEEN 15 AND 30`,
  'Atraso alto · 31-60 d':    `${DIAS} BETWEEN 31 AND 60`,
  'Atraso crítico · 61-90 d': `${DIAS} BETWEEN 61 AND 90`,
  'Congelada · +90 d':        `${DIAS} > 90`,
};

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

const baseJoin = `
  INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
  LEFT  JOIN MYSQL_DW.dbo.controltiempo_DimTipoServicio ts ON ts.idtipo_servicio = m.idtiposervicio
`;

const abierta     = `m.EstadoOT = 'Abierto'`;
const noFacturada = `(m.Estadofinanciero IS NULL OR UPPER(LTRIM(RTRIM(m.Estadofinanciero))) <> 'FACTURADO')`;
const facturada   = `UPPER(LTRIM(RTRIM(ISNULL(m.Estadofinanciero, '')))) = 'FACTURADO'`;

export async function GET(req: NextRequest) {
  const kpi         = (req.nextUrl.searchParams.get('kpi') ?? 'abiertas') as KpiKind;
  const days        = Math.max(1, Math.min(720, Number(req.nextUrl.searchParams.get('days') ?? 365)));
  const sucursal    = req.nextUrl.searchParams.get('sucursal')?.trim() ?? '';
  const tipo        = req.nextUrl.searchParams.get('tipo')?.trim()     ?? '';
  const bucket      = (req.nextUrl.searchParams.get('bucket')?.trim() ?? '') as AntiguedadBucket | '';
  const estadoDrill = req.nextUrl.searchParams.get('estadoDrill')?.trim() ?? '';
  const force       = req.nextUrl.searchParams.get('force') === '1';

  if (!KPI_TITLES[kpi]) {
    return NextResponse.json({ error: 'KPI inválido' }, { status: 400 });
  }
  if (kpi === 'antiguedad' && (!bucket || !ANTIGUEDAD_PREDICATE[bucket as AntiguedadBucket])) {
    return NextResponse.json({ error: 'Bucket de antigüedad inválido' }, { status: 400 });
  }

  const cacheKey = `${kpi}|d=${days}|s=${sucursal}|t=${tipo}|b=${bucket}|e=${estadoDrill}`;
  if (!force) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return NextResponse.json(hit.payload);
  }

  const limit = 500;
  const andConditions: string[] = [];
  let dateWhere = '';
  let orderBy   = 'm.fechaingreso DESC';

  if (kpi === 'tasaCierre30d') {
    dateWhere = `m.fechaingreso >= DATEADD(DAY, -30, GETDATE())`;
  } else {
    dateWhere = `m.fechaingreso >= DATEADD(DAY, -@days, GETDATE())`;

    if (kpi === 'abiertas')      { andConditions.push(abierta, noFacturada); }
    if (kpi === 'vencidas')      {
      andConditions.push(
        `m.fechacompromisoCliente IS NOT NULL`,
        `m.fechacompromisoCliente < CAST(GETDATE() AS DATE)`,
        `m.fecha_cierre_ot IS NULL`,
        noFacturada,
      );
    }
    if (kpi === 'atrasoCritico') { andConditions.push(abierta, `${DIAS} > 30`, noFacturada); }
    if (kpi === 'diasPromedio')  { andConditions.push(abierta, noFacturada); orderBy = `${DIAS} DESC`; }
    if (kpi === 'montoTotal')    { andConditions.push(abierta, noFacturada); orderBy = `ISNULL(CAST(m.monto AS FLOAT), 0) DESC`; }
    if (kpi === 'facturadas')    { andConditions.push(abierta, facturada);   orderBy = `${DIAS} DESC`; }
    if (kpi === 'antiguedad' && bucket) {
      andConditions.push(abierta, noFacturada, ANTIGUEDAD_PREDICATE[bucket as AntiguedadBucket]);
      orderBy = `${DIAS} DESC`;
    }
  }

  if (sucursal)    andConditions.push(`d.Descripcion = @sucursal`);
  if (tipo)        andConditions.push(`ISNULL(ts.descripcion, '') = @tipo`);
  if (estadoDrill) andConditions.push(`LTRIM(RTRIM(ISNULL(m.EstadoTaller, ''))) = @estadoDrill`);

  const whereClause = [dateWhere, ...andConditions].filter(Boolean).join(' AND ');

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await getDmsPool();
    const r = pool.request();
    if (kpi !== 'tasaCierre30d') r.input('days',        sql.Int,         days);
    if (sucursal)                r.input('sucursal',    sql.NVarChar(255), sucursal);
    if (tipo)                    r.input('tipo',        sql.NVarChar(255), tipo);
    if (estadoDrill)             r.input('estadoDrill', sql.NVarChar(255), estadoDrill);

    const result = await r.query<any>(`
      SELECT TOP ${limit}
        m.nroot                                       AS OT,
        ISNULL(m.nombrecliente, '')                   AS cliente,
        ISNULL(m.modelo, '')                          AS modelo,
        ISNULL(m.chasis, '')                          AS chasis,
        d.Descripcion                                 AS sucursal,
        ISNULL(m.EstadoTaller, '')                    AS estado_ot,
        ISNULL(ts.descripcion, '')                    AS tipo_servicio,
        ISNULL(m.asesor, '')                          AS asesor,
        m.fechaingreso,
        m.horaingreso                                 AS hora_ingreso,
        m.fechacompromisoCliente                      AS fecha_compromiso,
        m.fecha_cierre_ot                             AS fecha_finalizado,
        ${DIAS}                                       AS dias_ingreso,
        CASE
          WHEN m.fechacompromisoCliente IS NOT NULL AND m.fecha_cierre_ot IS NULL
            THEN DATEDIFF(DAY, m.fechacompromisoCliente, GETDATE())
          ELSE 0
        END                                           AS dias_retraso,
        ISNULL(CAST(m.monto AS FLOAT), 0)             AS MONTOTOTAL
      FROM MYSQL_DW.dbo.MasterOT_Condor m
      ${baseJoin}
      WHERE ${whereClause}
      ORDER BY ${orderBy}
    `);

    const detailRows: DetailRow[] = result.recordset.map((row: any) => ({
      ot:              Number(row.OT),
      cliente:         String(row.cliente ?? ''),
      modelo:          String(row.modelo ?? ''),
      chasis:          String(row.chasis ?? ''),
      sucursal:        String(row.sucursal ?? ''),
      estadoOt:        String(row.estado_ot ?? ''),
      tipoServicio:    String(row.tipo_servicio ?? ''),
      asesor:          String(row.asesor ?? ''),
      fechaIngreso:    row.fechaingreso     ? new Date(row.fechaingreso).toISOString().split('T')[0]     : null,
      horaIngreso:     row.hora_ingreso     ? String(row.hora_ingreso).trim() || null : null,
      fechaCompromiso: row.fecha_compromiso ? new Date(row.fecha_compromiso).toISOString().split('T')[0] : null,
      fechaFinalizado: row.fecha_finalizado ? new Date(row.fecha_finalizado).toISOString().split('T')[0] : null,
      diasIngreso:     Number(row.dias_ingreso ?? 0),
      diasRetraso:     Number(row.dias_retraso ?? 0),
      monto:           Number(row.MONTOTOTAL ?? 0),
    }));

    const title = kpi === 'antiguedad' && bucket
      ? `OTs en bucket "${bucket}"`
      : estadoDrill
      ? `OTs abiertas — estado "${estadoDrill}"`
      : KPI_TITLES[kpi];

    const payload: DetailPayload = {
      kpi, title,
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
    await pool?.close();
  }
}
