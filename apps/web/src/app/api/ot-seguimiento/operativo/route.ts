import { NextRequest, NextResponse } from 'next/server';
import * as sql from 'mssql';
import { getDmsPool } from '@/lib/dms-connection';

const CACHE_TTL_MS        = 60_000;
const FILTER_CACHE_TTL_MS = 5 * 60_000;

const cache       = new Map<string, { ts: number; payload: unknown }>();
const filterCache = { ts: 0, payload: null as { sucursales: string[]; asesores: string[] } | null };

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

function startOfWeek(): string {
  const d   = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

/**
 * Builds optional T-SQL filter fragments and binds named @params on a request.
 * Column refs: sucursal → s.Descripcion, asesor → m.asesor, estado → m.EstadoTaller
 */
function buildFilters(
  sucursal: string,
  asesor: string,
  estado: string,
  opts?: { skipEstado?: boolean },
) {
  const parts: string[] = [];
  const bindings: Array<{ name: string; type: sql.ISqlType; value: string }> = [];

  if (sucursal) {
    parts.push('AND LTRIM(RTRIM(s.Descripcion)) = @sucursal');
    bindings.push({ name: 'sucursal', type: sql.NVarChar(255), value: sucursal });
  }
  if (asesor) {
    parts.push('AND LTRIM(RTRIM(m.asesor)) = @asesor');
    bindings.push({ name: 'asesor', type: sql.NVarChar(255), value: asesor });
  }
  if (estado && !opts?.skipEstado) {
    parts.push('AND LTRIM(RTRIM(m.EstadoTaller)) = @estado');
    bindings.push({ name: 'estado', type: sql.NVarChar(255), value: estado });
  }

  return {
    sql: parts.join(' '),
    bind(req: sql.Request) {
      for (const b of bindings) {
        try { req.input(b.name, b.type, b.value); } catch { /* already bound */ }
      }
    },
  };
}

const JOIN_SUCURSAL = `
  LEFT JOIN dbo.controltiempo_DimSucursal s ON s.IdSucursal = m.taller
`;

const DRILL_COLS = `
  m.nroot                                AS OT,
  LTRIM(RTRIM(m.nombrecliente))          AS cliente,
  LTRIM(RTRIM(m.modelo))                 AS modelo,
  LTRIM(RTRIM(m.asesor))                 AS asesor,
  LTRIM(RTRIM(m.EstadoTaller))           AS estado,
  LTRIM(RTRIM(s.Descripcion))            AS sucursal,
  CAST(m.fechaingreso AS DATE)           AS fecha_ingreso,
  DATEDIFF(DAY, m.fechaingreso, GETDATE()) AS dias_en_taller,
  CAST(m.fechacompromisoCliente AS DATE) AS fecha_compromiso,
  CAST(COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller) AS DATE) AS fecha_cierre
`;

export async function GET(req: NextRequest) {
  const periodo  = (req.nextUrl.searchParams.get('periodo') ?? 'hoy') as Periodo;
  const force    = req.nextUrl.searchParams.get('force') === '1';
  const sucursal = req.nextUrl.searchParams.get('sucursal')?.trim() ?? '';
  const asesor   = req.nextUrl.searchParams.get('asesor')?.trim()   ?? '';
  const estado   = req.nextUrl.searchParams.get('estado')?.trim()   ?? '';
  const drill    = req.nextUrl.searchParams.get('drill') as DrillMetric | null;

  const cacheKey = `${periodo}|s=${sucursal}|a=${asesor}|e=${estado}`;
  if (!force && !drill) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload);
    }
  }

  // startDate passed as @startDate parameter — never string-interpolated into SQL
  const startDateValue = periodo === 'hoy'
    ? new Date().toISOString().split('T')[0]
    : startOfWeek();

  // ── Drill-down ────────────────────────────────────────────────────────────────
  if (drill) {
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = await getDmsPool();
      const f = buildFilters(sucursal, asesor, estado, {
        skipEstado: drill === 'ingresos' || drill === 'cerrados',
      });

      let querySql = '';
      let label    = '';

      if (drill === 'abiertas') {
        label = 'Total OTs abiertas';
        querySql = `
          SELECT TOP (300) ${DRILL_COLS}
          FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
          WHERE m.EstadoOT = 'Abierto' ${f.sql}
          ORDER BY m.fechaingreso ASC`;

      } else if (drill === 'criticas') {
        label = 'OTs críticas (+30 días)';
        querySql = `
          SELECT TOP (300) ${DRILL_COLS}
          FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
          WHERE m.EstadoOT = 'Abierto'
            AND DATEDIFF(DAY, m.fechaingreso, GETDATE()) > 30 ${f.sql}
          ORDER BY dias_en_taller DESC`;

      } else if (drill === 'atraso') {
        label = 'OTs en atraso (14–30 días)';
        querySql = `
          SELECT TOP (300) ${DRILL_COLS}
          FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
          WHERE m.EstadoOT = 'Abierto'
            AND DATEDIFF(DAY, m.fechaingreso, GETDATE()) > 14
            AND DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 30 ${f.sql}
          ORDER BY dias_en_taller DESC`;

      } else if (drill === 'ingresos') {
        label = periodo === 'hoy' ? 'Ingresos de hoy' : 'Ingresos de la semana';
        querySql = `
          SELECT TOP (300) ${DRILL_COLS}
          FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
          WHERE CAST(m.fechaingreso AS DATE) >= @startDate ${f.sql}
          ORDER BY m.fechaingreso DESC`;

      } else if (drill === 'cerrados') {
        label = periodo === 'hoy' ? 'Cerrados hoy' : 'Cerrados esta semana';
        querySql = `
          SELECT TOP (300) ${DRILL_COLS}
          FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
          WHERE CAST(COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller) AS DATE) >= @startDate ${f.sql}
          ORDER BY m.fecha_cierre_ot DESC`;

      } else if (drill === 'vencidos') {
        label = 'Compromisos vencidos';
        querySql = `
          SELECT TOP (300) ${DRILL_COLS}
          FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
          WHERE m.fechacompromisoCliente IS NOT NULL
            AND CAST(m.fechacompromisoCliente AS DATE) < CAST(GETDATE() AS DATE)
            AND m.fecha_cierre_ot IS NULL
            AND m.EstadoOT = 'Abierto' ${f.sql}
          ORDER BY dias_en_taller DESC`;
      }

      const request = pool.request();
      request.input('startDate', sql.Date, startDateValue);
      f.bind(request);

      const result = await request.query(querySql);
      const rows   = result.recordset as any[];

      const drillResult: DrillResult = {
        metric: drill,
        label,
        rows: rows.map((r: any) => ({
          ot:              Number(r.OT),
          cliente:         String(r.cliente  ?? '').trim(),
          modelo:          String(r.modelo   ?? '').trim(),
          asesor:          String(r.asesor   ?? '').trim(),
          estado:          String(r.estado   ?? '').trim(),
          sucursal:        String(r.sucursal ?? '').trim(),
          fechaIngreso:    r.fecha_ingreso  ? String(r.fecha_ingreso).split('T')[0]  : '',
          diasEnTaller:    Number(r.dias_en_taller ?? 0),
          fechaCompromiso: r.fecha_compromiso ? String(r.fecha_compromiso).split('T')[0] : undefined,
          fechaCierre:     r.fecha_cierre     ? String(r.fecha_cierre).split('T')[0]     : undefined,
        })),
        total: 0,
      };
      drillResult.total = drillResult.rows.length;
      return NextResponse.json(drillResult, { headers: { 'Cache-Control': 'no-store' } });

    } catch (err: any) {
      console.error('[operativo/drill]', err.message);
      return NextResponse.json({ error: 'Error al consultar DMS' }, { status: 500 });
    } finally {
      await pool?.close();
    }
  }

  // ── Main dashboard queries ────────────────────────────────────────────────────
  const pools: sql.ConnectionPool[] = [];
  const openPool = async () => {
    const p = await getDmsPool();
    pools.push(p);
    return p;
  };

  try {
    // ── 0. Filter options (cached 5 min) ─────────────────────────────────────
    let filterOptions: FilterOptions;
    if (!force && filterCache.payload && Date.now() - filterCache.ts < FILTER_CACHE_TTL_MS) {
      filterOptions = filterCache.payload;
    } else {
      const [pSuc, pAse] = await Promise.all([openPool(), openPool()]);
      const [sucResult, aseResult] = await Promise.all([
        pSuc.request().query(`
          SELECT DISTINCT LTRIM(RTRIM(s.Descripcion)) AS suc
          FROM dbo.MasterOT_Condor m
          ${JOIN_SUCURSAL}
          WHERE m.EstadoOT = 'Abierto'
            AND s.Descripcion IS NOT NULL
            AND LTRIM(RTRIM(s.Descripcion)) <> ''
          ORDER BY suc
        `),
        pAse.request().query(`
          SELECT TOP (300) DISTINCT LTRIM(RTRIM(m.asesor)) AS asesor
          FROM dbo.MasterOT_Condor m
          ${JOIN_SUCURSAL}
          WHERE m.EstadoOT = 'Abierto'
            AND m.asesor IS NOT NULL
            AND LTRIM(RTRIM(m.asesor)) <> ''
          ORDER BY asesor
        `),
      ]);
      filterOptions = {
        sucursales: (sucResult.recordset as any[]).map(r => String(r.suc ?? '').trim()).filter(Boolean),
        asesores:   (aseResult.recordset as any[]).map(r => String(r.asesor ?? '').trim()).filter(Boolean),
      };
      filterCache.ts      = Date.now();
      filterCache.payload = filterOptions;
    }

    // ── 1–7. Main queries in parallel ────────────────────────────────────────
    const f1 = buildFilters(sucursal, asesor, estado);
    const f2 = buildFilters(sucursal, asesor, estado);
    const f3 = buildFilters(sucursal, asesor, '');
    const f4 = buildFilters(sucursal, asesor, estado);
    const f5 = buildFilters(sucursal, asesor, estado);
    const f6 = buildFilters(sucursal, asesor, estado);
    const f7 = buildFilters(sucursal, asesor, estado);

    const [p1, p2, p3, p4, p5, p6, p7] = await Promise.all([
      openPool(), openPool(), openPool(), openPool(),
      openPool(), openPool(), openPool(),
    ]);

    const [snap, ingrResult, cerrResult, vencResult, proxResult, distResult, asesorResult] =
      await Promise.all([
        // 1. Snapshot
        (() => {
          const r = p1.request();
          r.input('startDate', sql.Date, startDateValue);
          f1.bind(r);
          return r.query(`
            SELECT
              COUNT(*)                                                                       AS abiertas,
              SUM(CASE WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) > 30 THEN 1 ELSE 0 END) AS criticas,
              SUM(CASE WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) > 14
                        AND DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 30 THEN 1 ELSE 0 END) AS en_atraso,
              AVG(CAST(DATEDIFF(DAY, m.fechaingreso, GETDATE()) AS FLOAT))                   AS dias_prom
            FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
            WHERE m.EstadoOT = 'Abierto' ${f1.sql}
          `);
        })(),

        // 2. Ingresos del período
        (() => {
          const r = p2.request();
          r.input('startDate', sql.Date, startDateValue);
          f2.bind(r);
          return r.query(`
            SELECT COUNT(*) AS ingresados
            FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
            WHERE CAST(m.fechaingreso AS DATE) >= @startDate ${f2.sql}
          `);
        })(),

        // 3. Cerrados en el período
        (() => {
          const r = p3.request();
          r.input('startDate', sql.Date, startDateValue);
          f3.bind(r);
          return r.query(`
            SELECT COUNT(*) AS cerrados
            FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
            WHERE CAST(COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller) AS DATE) >= @startDate ${f3.sql}
          `);
        })(),

        // 4. Vencidos
        (() => {
          const r = p4.request();
          f4.bind(r);
          return r.query(`
            SELECT TOP (100)
              m.nroot                                                                             AS OT,
              LTRIM(RTRIM(m.nombrecliente))                                                       AS cliente,
              LTRIM(RTRIM(m.modelo))                                                              AS modelo,
              LTRIM(RTRIM(m.asesor))                                                              AS asesor,
              LTRIM(RTRIM(s.Descripcion))                                                         AS sucursal,
              CAST(m.fechacompromisoCliente AS DATE)                                              AS fecha_compromiso,
              DATEDIFF(DAY, m.fechacompromisoCliente, GETDATE())                                  AS dias_vencido,
              DATEDIFF(DAY, m.fechaingreso, GETDATE())                                            AS dias_en_taller
            FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
            WHERE m.fechacompromisoCliente IS NOT NULL
              AND CAST(m.fechacompromisoCliente AS DATE) < CAST(GETDATE() AS DATE)
              AND m.fecha_cierre_ot IS NULL
              AND m.EstadoOT = 'Abierto' ${f4.sql}
            ORDER BY dias_vencido DESC
          `);
        })(),

        // 5. Próximos a vencer
        (() => {
          const r = p5.request();
          f5.bind(r);
          return r.query(`
            SELECT TOP (30)
              m.nroot                                                                     AS OT,
              LTRIM(RTRIM(m.nombrecliente))                                               AS cliente,
              LTRIM(RTRIM(m.modelo))                                                      AS modelo,
              LTRIM(RTRIM(m.asesor))                                                      AS asesor,
              CAST(m.fechacompromisoCliente AS DATE)                                      AS fecha_compromiso,
              DATEDIFF(DAY, GETDATE(), m.fechacompromisoCliente)                          AS dias_restantes
            FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
            WHERE m.fechacompromisoCliente IS NOT NULL
              AND CAST(m.fechacompromisoCliente AS DATE)
                  BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, 3, CAST(GETDATE() AS DATE))
              AND m.fecha_cierre_ot IS NULL
              AND m.EstadoOT = 'Abierto' ${f5.sql}
            ORDER BY dias_restantes ASC
          `);
        })(),

        // 6. Distribución (hora del día o día de la semana)
        (() => {
          const r = p6.request();
          r.input('startDate', sql.Date, startDateValue);
          f6.bind(r);
          if (periodo === 'hoy') {
            return r.query(`
              SELECT
                SUBSTRING(m.horaingreso, 1, 2) AS hora,
                COUNT(*)                        AS cnt
              FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
              WHERE CAST(m.fechaingreso AS DATE) = CAST(GETDATE() AS DATE)
                AND m.horaingreso IS NOT NULL
                AND LTRIM(RTRIM(m.horaingreso)) <> '' ${f6.sql}
              GROUP BY SUBSTRING(m.horaingreso, 1, 2)
              ORDER BY hora
            `);
          } else {
            return r.query(`
              SELECT
                DATEPART(WEEKDAY, m.fechaingreso) AS dow,
                CAST(m.fechaingreso AS DATE)        AS fecha,
                COUNT(*)                            AS cnt
              FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
              WHERE CAST(m.fechaingreso AS DATE) >= @startDate ${f6.sql}
              GROUP BY DATEPART(WEEKDAY, m.fechaingreso), CAST(m.fechaingreso AS DATE)
              ORDER BY fecha
            `);
          }
        })(),

        // 7. Por asesor
        (() => {
          const r = p7.request();
          r.input('startDate', sql.Date, startDateValue);
          f7.bind(r);
          return r.query(`
            SELECT TOP (30)
              LTRIM(RTRIM(m.asesor))                AS asesor,
              SUM(CASE WHEN CAST(m.fechaingreso AS DATE) >= @startDate THEN 1 ELSE 0 END) AS ingresados,
              SUM(CASE WHEN CAST(COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller) AS DATE) >= @startDate THEN 1 ELSE 0 END) AS cerrados,
              SUM(CASE
                    WHEN m.fechacompromisoCliente IS NOT NULL
                     AND CAST(m.fechacompromisoCliente AS DATE) < CAST(GETDATE() AS DATE)
                     AND m.fecha_cierre_ot IS NULL THEN 1 ELSE 0 END)                     AS vencidos,
              AVG(CASE
                    WHEN CAST(COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller) AS DATE) >= @startDate
                     AND m.fechaingreso IS NOT NULL
                    THEN CAST(DATEDIFF(DAY, m.fechaingreso, COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller)) AS FLOAT)
                  END)                                                                     AS dias_prom
            FROM dbo.MasterOT_Condor m ${JOIN_SUCURSAL}
            WHERE (
              CAST(m.fechaingreso AS DATE) >= @startDate
              OR CAST(COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller) AS DATE) >= @startDate
              OR (
                m.fechacompromisoCliente IS NOT NULL
                AND CAST(m.fechacompromisoCliente AS DATE) < CAST(GETDATE() AS DATE)
                AND m.fecha_cierre_ot IS NULL
              )
            )
            AND LTRIM(RTRIM(m.asesor)) <> '' ${f7.sql}
            GROUP BY LTRIM(RTRIM(m.asesor))
            HAVING (
              SUM(CASE WHEN CAST(m.fechaingreso AS DATE) >= @startDate THEN 1 ELSE 0 END) +
              SUM(CASE WHEN CAST(COALESCE(m.fecha_cierre_ot, m.fecha_fin_taller) AS DATE) >= @startDate THEN 1 ELSE 0 END) +
              SUM(CASE
                    WHEN m.fechacompromisoCliente IS NOT NULL
                     AND CAST(m.fechacompromisoCliente AS DATE) < CAST(GETDATE() AS DATE)
                     AND m.fecha_cierre_ot IS NULL THEN 1 ELSE 0 END)
            ) > 0
            ORDER BY vencidos DESC, ingresados DESC
          `);
        })(),
      ]);

    // ── Distribución ──────────────────────────────────────────────────────────
    const distRows = distResult.recordset as any[];
    let distribucion: DistribucionRow[];
    if (periodo === 'hoy') {
      distribucion = distRows.map((r: any) => ({
        label: `${String(r.hora ?? '00').padStart(2, '0')}:00`,
        count: Number(r.cnt),
      }));
    } else {
      const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      distribucion = distRows.map((r: any) => ({
        label: `${dias[Number(r.dow) - 1]} ${String(r.fecha).slice(5)}`,
        count: Number(r.cnt),
      }));
    }

    // ── Build payload ─────────────────────────────────────────────────────────
    const snapRow      = (snap.recordset as any[])[0] ?? {};
    const ingresados   = Number((ingrResult.recordset as any[])[0]?.ingresados ?? 0);
    const cerradosEnP  = Number((cerrResult.recordset as any[])[0]?.cerrados   ?? 0);
    const vencidosRows = vencResult.recordset  as any[];
    const proximosRows = proxResult.recordset  as any[];
    const asesorRows   = asesorResult.recordset as any[];

    const payload: OperativoData = {
      periodo,
      generatedAt:       new Date().toISOString(),
      otsAbiertas:       Number(snapRow.abiertas  ?? 0),
      otsCriticas:       Number(snapRow.criticas  ?? 0),
      otsEnAtraso:       Number(snapRow.en_atraso ?? 0),
      diasPromedio:      Math.round(Number(snapRow.dias_prom ?? 0)),
      ingresados,
      cerradosEnPeriodo: cerradosEnP,
      tasaCierre:        ingresados > 0 ? Math.round((cerradosEnP / ingresados) * 100) : 0,
      totalVencidos:     vencidosRows.length,
      vencidos: vencidosRows.map((r: any) => ({
        ot:              Number(r.OT),
        cliente:         String(r.cliente          ?? '').trim(),
        modelo:          String(r.modelo           ?? '').trim(),
        asesor:          String(r.asesor           ?? '').trim(),
        sucursal:        String(r.sucursal         ?? '').trim(),
        fechaCompromiso: String(r.fecha_compromiso ?? '').split('T')[0],
        diasVencido:     Number(r.dias_vencido     ?? 0),
        diasEnTaller:    Number(r.dias_en_taller   ?? 0),
      })),
      proximosVencer: proximosRows.map((r: any) => ({
        ot:              Number(r.OT),
        cliente:         String(r.cliente          ?? '').trim(),
        modelo:          String(r.modelo           ?? '').trim(),
        asesor:          String(r.asesor           ?? '').trim(),
        fechaCompromiso: String(r.fecha_compromiso ?? '').split('T')[0],
        diasRestantes:   Number(r.dias_restantes   ?? 0),
      })),
      distribucion,
      porAsesor: asesorRows.map((r: any) => ({
        asesor:         String(r.asesor     ?? '').trim(),
        ingresados:     Number(r.ingresados ?? 0),
        cerrados:       Number(r.cerrados   ?? 0),
        vencidos:       Number(r.vencidos   ?? 0),
        diasPromCierre: Math.round(Number(r.dias_prom ?? 0)),
      })),
      filterOptions,
    };

    cache.set(cacheKey, { ts: Date.now(), payload });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err: any) {
    console.error('[operativo]', err.message, err.stack);
    return NextResponse.json({ error: 'Error al consultar DMS' }, { status: 500 });
  } finally {
    await Promise.allSettled(pools.map(p => p.close()));
  }
}
