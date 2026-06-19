import { NextRequest, NextResponse } from 'next/server';
import type { Connection } from 'mysql2/promise';
import { getDmsConnection } from '@/lib/dms-connection';
import { OT_ESTADOS_QUERY_KEYS } from '@/lib/ot-estados';

const CACHE_TTL_MS         = 60_000;
const FILTER_CACHE_TTL_MS  = 5 * 60_000;

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

const ABIERTOS    = OT_ESTADOS_QUERY_KEYS.filter(k => k !== 'Finalizado');
const PH_ABIERTOS = ABIERTOS.map(() => '?').join(', ');

function startOfWeek(): string {
  const d   = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function buildFilters(sucursal: string, asesor: string, estado: string, opts?: { skipEstado?: boolean; tableAlias?: string }) {
  const alias = opts?.tableAlias ? `${opts.tableAlias}.` : '';
  const parts: string[] = [];
  const params: string[] = [];
  if (sucursal) { parts.push(`AND TRIM(CONVERT(${alias}SUCURSAL USING utf8mb4)) = ?`); params.push(sucursal); }
  if (asesor)   { parts.push(`AND TRIM(CONVERT(${alias}ASESOR USING utf8mb4)) = ?`);   params.push(asesor); }
  if (estado && !opts?.skipEstado) {
    parts.push(`AND TRIM(CONVERT(${alias}ESTADOOT USING utf8mb4)) = ?`);
    params.push(estado);
  }
  return { sql: parts.join(' '), params };
}


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

  const startDate = periodo === 'hoy' ? 'CURDATE()' : `'${startOfWeek()}'`;

  // ── Drill-down: devuelve lista de OTs para una métrica ────────────────────
  if (drill) {
    const conn = await getDmsConnection();
    try {
      const f = buildFilters(sucursal, asesor, estado, { skipEstado: drill === 'ingresos' || drill === 'cerrados' });
      const COLS = `
        OT,
        TRIM(CONVERT(NOMBRECLIENTE USING utf8mb4)) AS cliente,
        TRIM(CONVERT(MODELO        USING utf8mb4)) AS modelo,
        TRIM(CONVERT(ASESOR        USING utf8mb4)) AS asesor,
        TRIM(CONVERT(ESTADOOT      USING utf8mb4)) AS estado,
        TRIM(CONVERT(SUCURSAL      USING utf8mb4)) AS sucursal,
        DATE(fechaingreso)                          AS fecha_ingreso,
        DATEDIFF(CURDATE(), DATE(fechaingreso))      AS dias_en_taller,
        DATE(FechaCompromisoClienteMaster)          AS fecha_compromiso,
        DATE(FechaFinalizado)                       AS fecha_cierre
      `;

      let sql = '';
      let params: any[] = [];
      let label = '';

      if (drill === 'abiertas') {
        label = 'Total OTs abiertas';
        sql = `SELECT ${COLS} FROM v_maestro_ot_condor
               WHERE CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS}) ${f.sql}
               ORDER BY fechaingreso ASC LIMIT 300`;
        params = [...ABIERTOS, ...f.params];

      } else if (drill === 'criticas') {
        label = 'OTs críticas (+30 días)';
        sql = `SELECT ${COLS} FROM v_maestro_ot_condor
               WHERE CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS})
                 AND DATEDIFF(CURDATE(), DATE(fechaingreso)) > 30 ${f.sql}
               ORDER BY dias_en_taller DESC LIMIT 300`;
        params = [...ABIERTOS, ...f.params];

      } else if (drill === 'atraso') {
        label = 'OTs en atraso (14–30 días)';
        sql = `SELECT ${COLS} FROM v_maestro_ot_condor
               WHERE CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS})
                 AND DATEDIFF(CURDATE(), DATE(fechaingreso)) > 14
                 AND DATEDIFF(CURDATE(), DATE(fechaingreso)) <= 30 ${f.sql}
               ORDER BY dias_en_taller DESC LIMIT 300`;
        params = [...ABIERTOS, ...f.params];

      } else if (drill === 'ingresos') {
        label = periodo === 'hoy' ? 'Ingresos de hoy' : 'Ingresos de la semana';
        sql = `SELECT ${COLS} FROM v_maestro_ot_condor
               WHERE DATE(fechaingreso) >= ${startDate} ${f.sql}
               ORDER BY fechaingreso DESC LIMIT 300`;
        params = f.params;

      } else if (drill === 'cerrados') {
        label = periodo === 'hoy' ? 'Cerrados hoy' : 'Cerrados esta semana';
        sql = `SELECT ${COLS} FROM v_maestro_ot_condor
               WHERE DATE(FechaFinalizado) >= ${startDate} ${f.sql}
               ORDER BY FechaFinalizado DESC LIMIT 300`;
        params = f.params;

      } else if (drill === 'vencidos') {
        label = 'Compromisos vencidos';
        sql = `SELECT ${COLS} FROM v_maestro_ot_condor
               WHERE FechaCompromisoClienteMaster IS NOT NULL
                 AND DATE(FechaCompromisoClienteMaster) < CURDATE()
                 AND FechaFinalizado IS NULL
                 AND CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS}) ${f.sql}
               ORDER BY dias_en_taller DESC LIMIT 300`;
        params = [...ABIERTOS, ...f.params];
      }

      const [rows] = await conn.execute<any[]>(sql, params);
      const result: DrillResult = {
        metric: drill,
        label,
        rows: (rows as any[]).map((r: any) => ({
          ot:              Number(r.OT),
          cliente:         String(r.cliente ?? '').trim(),
          modelo:          String(r.modelo  ?? '').trim(),
          asesor:          String(r.asesor  ?? '').trim(),
          estado:          String(r.estado  ?? '').trim(),
          sucursal:        String(r.sucursal ?? '').trim(),
          fechaIngreso:    String(r.fecha_ingreso ?? '').split('T')[0],
          diasEnTaller:    Number(r.dias_en_taller ?? 0),
          fechaCompromiso: r.fecha_compromiso ? String(r.fecha_compromiso).split('T')[0] : undefined,
          fechaCierre:     r.fecha_cierre     ? String(r.fecha_cierre).split('T')[0]     : undefined,
        })),
        total: 0,
      };
      result.total = result.rows.length;
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err: any) {
      console.error('[operativo/drill]', err.message);
      return NextResponse.json({ error: 'Error al consultar DMS' }, { status: 500 });
    } finally {
      await conn.end().catch(() => {});
    }
  }

  // Todas las conexiones se abrirán en paralelo, una por grupo de consulta.
  // En el finally cerramos TODAS para no dejar conexiones colgadas.
  const connections: (Connection | null)[] = [];
  const openConn = async () => {
    const c = await getDmsConnection();
    connections.push(c);
    return c;
  };

  try {
    // ── 0. Opciones de filtro (cacheadas 5 min) ────────────────────────────
    let filterOptions: FilterOptions;
    if (!force && filterCache.payload && Date.now() - filterCache.ts < FILTER_CACHE_TTL_MS) {
      filterOptions = filterCache.payload;
    } else {
      const [cSuc, cAse] = await Promise.all([openConn(), openConn()]);
      const [sucursalesRows, asesoresRows] = await Promise.all([
        cSuc.execute<any[]>(
          `SELECT DISTINCT TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS suc
           FROM v_maestro_ot_condor
           WHERE CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS})
             AND SUCURSAL IS NOT NULL AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) <> ''
           ORDER BY suc`,
          ABIERTOS,
        ),
        cAse.execute<any[]>(
          `SELECT DISTINCT TRIM(CONVERT(ASESOR USING utf8mb4)) AS asesor
           FROM v_maestro_ot_condor
           WHERE CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS})
             AND ASESOR IS NOT NULL AND TRIM(ASESOR) <> ''
           ORDER BY asesor
           LIMIT 300`,
          ABIERTOS,
        ),
      ]);
      filterOptions = {
        sucursales: sucursalesRows[0].map((r: any) => String(r.suc ?? '').trim()).filter(Boolean),
        asesores:   asesoresRows[0].map((r: any) => String(r.asesor ?? '').trim()).filter(Boolean),
      };
      filterCache.ts      = Date.now();
      filterCache.payload = filterOptions;
    }

    // ── 1-7. Queries principales en paralelo ──────────────────────────────
    const f1 = buildFilters(sucursal, asesor, estado);
    const f2 = buildFilters(sucursal, asesor, estado);
    const f3 = buildFilters(sucursal, asesor, '');
    const f4 = buildFilters(sucursal, asesor, estado);
    const f5 = buildFilters(sucursal, asesor, estado);
    const f6h = buildFilters(sucursal, asesor, estado, { tableAlias: 'c' });
    const f6s = buildFilters(sucursal, asesor, estado);
    const f7  = buildFilters(sucursal, asesor, estado);

    const [c1, c2, c3, c4, c5, c6, c7] = await Promise.all([
      openConn(), openConn(), openConn(), openConn(),
      openConn(), openConn(), openConn(),
    ]);

    const [
      [snapRows],
      [ingrRows],
      [cerrRows],
      [vencidosRows],
      [proximosRows],
      [distRows],
      [asesorRows],
    ] = await Promise.all([
      // 1. Snapshot taller
      c1.execute<any[]>(
        `SELECT
          COUNT(*) AS abiertas,
          SUM(CASE WHEN DATEDIFF(CURDATE(), fechaingreso) > 30 THEN 1 ELSE 0 END) AS criticas,
          SUM(CASE WHEN DATEDIFF(CURDATE(), fechaingreso) > 14
                    AND DATEDIFF(CURDATE(), fechaingreso) <= 30 THEN 1 ELSE 0 END) AS en_atraso,
          AVG(DATEDIFF(CURDATE(), fechaingreso)) AS dias_prom
        FROM v_maestro_ot_condor
        WHERE CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS})
          ${f1.sql}`,
        [...ABIERTOS, ...f1.params],
      ),
      // 2. Ingresos del período
      c2.execute<any[]>(
        `SELECT COUNT(*) AS ingresados
         FROM v_maestro_ot_condor
         WHERE DATE(fechaingreso) >= ${startDate}
           ${f2.sql}`,
        f2.params,
      ),
      // 3. Cerrados en el período
      c3.execute<any[]>(
        `SELECT COUNT(*) AS cerrados
         FROM v_maestro_ot_condor
         WHERE DATE(FechaFinalizado) >= ${startDate}
           ${f3.sql}`,
        f3.params,
      ),
      // 4. Vencidos
      c4.execute<any[]>(
        `SELECT
          OT,
          TRIM(NOMBRECLIENTE)                                     AS cliente,
          TRIM(MODELO)                                            AS modelo,
          TRIM(ASESOR)                                            AS asesor,
          TRIM(SUCURSAL)                                          AS sucursal,
          DATE(FechaCompromisoClienteMaster)                      AS fecha_compromiso,
          DATEDIFF(CURDATE(), DATE(FechaCompromisoClienteMaster)) AS dias_vencido,
          DATEDIFF(CURDATE(), DATE(fechaingreso))                 AS dias_en_taller
        FROM v_maestro_ot_condor
        WHERE FechaCompromisoClienteMaster IS NOT NULL
          AND DATE(FechaCompromisoClienteMaster) < CURDATE()
          AND FechaFinalizado IS NULL
          AND CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS})
          ${f4.sql}
        ORDER BY dias_vencido DESC
        LIMIT 100`,
        [...ABIERTOS, ...f4.params],
      ),
      // 5. Próximos a vencer
      c5.execute<any[]>(
        `SELECT
          OT,
          TRIM(NOMBRECLIENTE)                                          AS cliente,
          TRIM(MODELO)                                                 AS modelo,
          TRIM(ASESOR)                                                 AS asesor,
          DATE(FechaCompromisoClienteMaster)                           AS fecha_compromiso,
          DATEDIFF(DATE(FechaCompromisoClienteMaster), CURDATE())      AS dias_restantes
        FROM v_maestro_ot_condor
        WHERE FechaCompromisoClienteMaster IS NOT NULL
          AND DATE(FechaCompromisoClienteMaster) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
          AND FechaFinalizado IS NULL
          AND CONVERT(ESTADOOT USING utf8mb4) IN (${PH_ABIERTOS})
          ${f5.sql}
        ORDER BY dias_restantes ASC
        LIMIT 30`,
        [...ABIERTOS, ...f5.params],
      ),
      // 6. Distribución
      periodo === 'hoy'
        ? c6.execute<any[]>(
            `SELECT
              SUBSTRING(f.horaingreso, 1, 2) AS hora,
              COUNT(*) AS cnt
            FROM v_maestro_ot_condor c
            JOIN (
              SELECT nroot, MIN(horaingreso) AS horaingreso
              FROM v_maestro_ot_filtros
              WHERE horaingreso IS NOT NULL AND TRIM(horaingreso) <> ''
              GROUP BY nroot
            ) f ON f.nroot = c.OT
            WHERE DATE(c.fechaingreso) = CURDATE()
              AND f.horaingreso IS NOT NULL
              AND f.horaingreso <> ''
              ${f6h.sql}
            GROUP BY hora
            ORDER BY hora`,
            f6h.params,
          )
        : c6.execute<any[]>(
            `SELECT
              DAYOFWEEK(fechaingreso) AS dow,
              DATE(fechaingreso)      AS fecha,
              COUNT(*)                AS cnt
            FROM v_maestro_ot_condor
            WHERE DATE(fechaingreso) >= ${startDate}
              ${f6s.sql}
            GROUP BY dow, fecha
            ORDER BY fecha`,
            f6s.params,
          ),
      // 7. Por asesor
      c7.execute<any[]>(
        `SELECT
          TRIM(CONVERT(ASESOR USING utf8mb4)) AS asesor,
          SUM(CASE WHEN DATE(fechaingreso)    >= ${startDate} THEN 1 ELSE 0 END) AS ingresados,
          SUM(CASE WHEN DATE(FechaFinalizado) >= ${startDate} THEN 1 ELSE 0 END) AS cerrados,
          SUM(CASE
                WHEN FechaCompromisoClienteMaster IS NOT NULL
                 AND DATE(FechaCompromisoClienteMaster) < CURDATE()
                 AND FechaFinalizado IS NULL THEN 1 ELSE 0 END) AS vencidos,
          AVG(CASE
                WHEN DATE(FechaFinalizado) >= ${startDate} AND fechaingreso IS NOT NULL
                THEN DATEDIFF(FechaFinalizado, fechaingreso) END) AS dias_prom
        FROM v_maestro_ot_condor
        WHERE (DATE(fechaingreso) >= ${startDate} OR DATE(FechaFinalizado) >= ${startDate}
               OR (FechaCompromisoClienteMaster IS NOT NULL
                   AND DATE(FechaCompromisoClienteMaster) < CURDATE()
                   AND FechaFinalizado IS NULL))
          AND TRIM(CONVERT(ASESOR USING utf8mb4)) <> ''
          ${f7.sql}
        GROUP BY asesor
        HAVING (ingresados + cerrados + vencidos) > 0
        ORDER BY vencidos DESC, ingresados DESC
        LIMIT 30`,
        f7.params,
      ),
    ]);

    // ── Distribución ─────────────────────────────────────────────────────
    let distribucion: DistribucionRow[];
    if (periodo === 'hoy') {
      distribucion = distRows.map((r: any) => ({
        label: `${String(r.hora).padStart(2, '0')}:00`,
        count: Number(r.cnt),
      }));
    } else {
      const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      distribucion = distRows.map((r: any) => ({
        label: `${dias[Number(r.dow) - 1]} ${String(r.fecha).slice(5)}`,
        count: Number(r.cnt),
      }));
    }

    // ── Respuesta ────────────────────────────────────────────────────────
    const snap        = snapRows[0]    ?? {};
    const ingresados  = Number(ingrRows[0]?.ingresados ?? 0);
    const cerradosEnP = Number(cerrRows[0]?.cerrados   ?? 0);

    const payload: OperativoData = {
      periodo,
      generatedAt:       new Date().toISOString(),
      otsAbiertas:       Number(snap.abiertas  ?? 0),
      otsCriticas:       Number(snap.criticas  ?? 0),
      otsEnAtraso:       Number(snap.en_atraso ?? 0),
      diasPromedio:      Math.round(Number(snap.dias_prom ?? 0)),
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
    // Cerrar todas las conexiones en paralelo, ignorando errores individuales
    await Promise.allSettled(connections.map(c => c?.end()));
  }
}
