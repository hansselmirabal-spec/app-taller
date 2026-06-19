import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import { OT_ESTADOS_QUERY_KEYS } from '@/lib/ot-estados';
import { getDmsConnection } from '@/lib/dms-connection';

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 30;
const cache = new Map<string, { ts: number; payload: unknown }>();

function cacheSet(key: string, payload: unknown) {
  cache.set(key, { ts: Date.now(), payload });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

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

// Detalle profundo cuando se filtra por uno o más asesores: el listado pierde
// sentido y mostramos un dashboard ejecutivo de esos asesores.
export interface AsesorDetail {
  asesores: string[];
  totalOts: number;
  finalizadas: number;
  abiertas: number;
  tasaCierre: number;        // 0-100
  diasPromedioCierre: number;
  montoTotal: number;
  bySucursal: { sucursal: string; count: number }[];
  byState:    { estado: string; count: number }[];
  byAge:      { bucket: string; count: number }[];
  topOldest:  { ot: number; dias: number; cliente: string; estado: string; asesor: string; sucursal: string; modelo: string; montoTotal: number }[];
  monthlyIn:  { month: string; ingresos: number; finalizadas: number }[];
}

// Detalle profundo cuando se filtra por una sola sucursal: el listado por sucursal
// pierde sentido (1 fila), entonces mostramos un dashboard rico de esa sucursal.
export interface SucursalDetail {
  sucursal: string;
  byState:    { estado: string; count: number }[];
  byAge:      { bucket: string; count: number }[];
  topOldest:  { ot: number; dias: number; cliente: string; estado: string; asesor: string; modelo: string; montoTotal: number }[];
  monthlyIn:  { month: string; ingresos: number; finalizadas: number }[];
}

export async function GET(req: NextRequest) {
  const force    = req.nextUrl.searchParams.get('force') === '1';
  const sucursal = req.nextUrl.searchParams.get('sucursal')?.trim() ?? '';
  // `asesor` ahora acepta múltiples valores en CSV: ?asesor=PA,BV,GH
  const asesorRaw = req.nextUrl.searchParams.get('asesor')?.trim() ?? '';
  const asesores = asesorRaw
    ? Array.from(new Set(asesorRaw.split(',').map(s => s.trim()).filter(Boolean))).sort()
    : [];

  const cacheKey = `${sucursal}|${asesores.join(',')}`;
  if (!force) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload);
    }
  }

  const estadosAbiertos = OT_ESTADOS_QUERY_KEYS.filter(k => k !== 'Finalizado');
  const placeholders = estadosAbiertos.map(() => '?').join(', ');

  // Filtros opcionales sobre la vista. Construimos cláusulas reusables.
  const sucursalCond = sucursal ? `AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?` : '';
  const asesorCond   = asesores.length > 0
    ? `AND TRIM(CONVERT(ASESOR USING utf8mb4)) IN (${asesores.map(() => '?').join(',')})`
    : '';
  const filterParams: string[] = [];
  if (sucursal) filterParams.push(sucursal);
  if (asesores.length) filterParams.push(...asesores);

  let connection: mysql.Connection | null = null;
  try {
    connection = await getDmsConnection();

    // Listas de opciones — sin aplicar filtros (siempre completas para los selectores).
    // 365 días de ventana para acotar el universo.
    const [optionsRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
         GROUP_CONCAT(DISTINCT NULLIF(TRIM(CONVERT(SUCURSAL USING utf8mb4)), '') ORDER BY 1 SEPARATOR '||') AS sucursales,
         GROUP_CONCAT(DISTINCT NULLIF(TRIM(CONVERT(ASESOR   USING utf8mb4)), '') ORDER BY 1 SEPARATOR '||') AS asesores
       FROM v_maestro_ot_condor
       WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)`,
    );
    const splitOpts = (s: any): string[] =>
      String(s ?? '').split('||').map(x => x.trim()).filter(Boolean);
    const availableSucursales = splitOpts(optionsRows[0]?.sucursales);
    const availableAsesores   = splitOpts(optionsRows[0]?.asesores);

    // Reporte 1: OTs abiertas por sucursal (snapshot actual, todas las abiertas).
    // Si hay filtro de sucursal, devuelve esa única fila; si hay filtro de asesor,
    // las filas se restringen a OTs gestionadas por ese asesor (distribuidas por sucursal).
    const [sucursalesRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal,
        COUNT(*) AS total,
        SUM(CASE WHEN CONVERT(ESTADOOT USING utf8mb4) IN (${placeholders}) THEN 1 ELSE 0 END) AS abiertas,
        SUM(CASE
              WHEN FechaCompromisoClienteMaster IS NOT NULL
                AND FechaCompromisoClienteMaster < CURDATE()
                AND FechaFinalizado IS NULL
              THEN 1 ELSE 0 END) AS vencidas,
        AVG(DIASINGRESO) AS dias_promedio,
        SUM(MONTOTOTAL) AS monto_total
      FROM v_maestro_ot_condor
      WHERE CONVERT(ESTADOOT USING utf8mb4) IN (${placeholders})
        AND fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
        ${sucursalCond}
        ${asesorCond}
      GROUP BY TRIM(CONVERT(SUCURSAL USING utf8mb4))
      HAVING sucursal <> ''
      ORDER BY abiertas DESC`,
      [...estadosAbiertos, ...estadosAbiertos, ...filterParams],
    );

    // Reporte 2: Productividad de asesores en el último mes.
    const [asesoresRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        TRIM(CONVERT(ASESOR USING utf8mb4)) AS asesor,
        TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal,
        COUNT(*) AS total_ots,
        SUM(CASE WHEN FechaFinalizado IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas,
        SUM(CASE WHEN FechaFinalizado IS NULL THEN 1 ELSE 0 END) AS abiertas,
        AVG(CASE WHEN FechaFinalizado IS NOT NULL AND fechaingreso IS NOT NULL
                 THEN DATEDIFF(FechaFinalizado, fechaingreso) END) AS dias_promedio_cierre,
        SUM(MONTOTOTAL) AS monto_total
      FROM v_maestro_ot_condor
      WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND TRIM(CONVERT(ASESOR USING utf8mb4)) <> ''
        ${sucursalCond}
        ${asesorCond}
      GROUP BY TRIM(CONVERT(ASESOR USING utf8mb4)), TRIM(CONVERT(SUCURSAL USING utf8mb4))
      ORDER BY total_ots DESC
      LIMIT 50`,
      filterParams,
    );

    const sucursales: SucursalReportRow[] = sucursalesRows.map(r => ({
      sucursal:     String(r.sucursal),
      total:        Number(r.total ?? 0),
      abiertas:     Number(r.abiertas ?? 0),
      vencidas:     Number(r.vencidas ?? 0),
      diasPromedio: Math.round(Number(r.dias_promedio ?? 0)),
      montoTotal:   Number(r.monto_total ?? 0),
    }));

    // Renombrado a asesoresReport para no chocar con el array del filtro CSV.
    const asesoresReport: AsesorReportRow[] = asesoresRows.map(r => ({
      asesor:             String(r.asesor),
      sucursal:           String(r.sucursal ?? ''),
      totalOts:           Number(r.total_ots ?? 0),
      finalizadas:        Number(r.finalizadas ?? 0),
      abiertas:           Number(r.abiertas ?? 0),
      diasPromedioCierre: Math.round(Number(r.dias_promedio_cierre ?? 0)),
      montoTotal:         Number(r.monto_total ?? 0),
    }));

    // Detalle de sucursal: solo cuando se filtra por UNA sucursal específica.
    // 4 queries en paralelo para no penalizar el load time.
    let sucursalDetail: SucursalDetail | null = null;
    if (sucursal) {
      const sucursalParams = [sucursal];
      const [byStateRows, byAgeRows, oldestRows, monthlyRows] = await Promise.all([
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT TRIM(CONVERT(ESTADOOT USING utf8mb4)) AS estado, COUNT(*) AS cnt
           FROM v_maestro_ot_condor
           WHERE FechaFinalizado IS NULL
             AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?
             ${asesorCond}
           GROUP BY TRIM(CONVERT(ESTADOOT USING utf8mb4))
           ORDER BY cnt DESC`,
          asesores.length ? [...sucursalParams, ...asesores] : sucursalParams,
        ),
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT
              CASE
                WHEN DATEDIFF(CURDATE(), fechaingreso) <= 7   THEN '0-7 días'
                WHEN DATEDIFF(CURDATE(), fechaingreso) <= 30  THEN '8-30 días'
                WHEN DATEDIFF(CURDATE(), fechaingreso) <= 90  THEN '1-3 meses'
                WHEN DATEDIFF(CURDATE(), fechaingreso) <= 180 THEN '3-6 meses'
                ELSE '+6 meses'
              END AS bucket,
              COUNT(*) AS cnt
           FROM v_maestro_ot_condor
           WHERE FechaFinalizado IS NULL
             AND fechaingreso IS NOT NULL
             AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?
             ${asesorCond}
           GROUP BY bucket
           ORDER BY MIN(DATEDIFF(CURDATE(), fechaingreso))`,
          asesores.length ? [...sucursalParams, ...asesores] : sucursalParams,
        ),
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT OT, DATEDIFF(CURDATE(), fechaingreso) AS dias,
                  TRIM(CONVERT(NOMBRECLIENTE USING utf8mb4)) AS cliente,
                  TRIM(CONVERT(ESTADOOT USING utf8mb4))      AS estado,
                  TRIM(CONVERT(ASESOR USING utf8mb4))        AS asesor,
                  TRIM(CONVERT(MODELO USING utf8mb4))        AS modelo,
                  MONTOTOTAL
           FROM v_maestro_ot_condor
           WHERE FechaFinalizado IS NULL
             AND fechaingreso IS NOT NULL
             AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?
             ${asesorCond}
           ORDER BY fechaingreso ASC
           LIMIT 10`,
          asesores.length ? [...sucursalParams, ...asesores] : sucursalParams,
        ),
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT DATE_FORMAT(fechaingreso, '%Y-%m') AS month,
                  COUNT(*) AS ingresos,
                  SUM(CASE WHEN FechaFinalizado IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
           FROM v_maestro_ot_condor
           WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
             AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?
             ${asesorCond}
           GROUP BY DATE_FORMAT(fechaingreso, '%Y-%m')
           ORDER BY month ASC`,
          asesores.length ? [...sucursalParams, ...asesores] : sucursalParams,
        ),
      ]);

      sucursalDetail = {
        sucursal,
        byState: byStateRows[0].map(r => ({ estado: String(r.estado), count: Number(r.cnt) })),
        byAge:   byAgeRows[0].map(r => ({ bucket: String(r.bucket), count: Number(r.cnt) })),
        topOldest: oldestRows[0].map(r => ({
          ot: Number(r.OT), dias: Number(r.dias),
          cliente: String(r.cliente ?? '').trim(),
          estado:  String(r.estado ?? '').trim(),
          asesor:  String(r.asesor ?? '').trim(),
          modelo:  String(r.modelo ?? '').trim(),
          montoTotal: Number(r.MONTOTOTAL ?? 0),
        })),
        monthlyIn: monthlyRows[0].map(r => ({
          month: String(r.month),
          ingresos: Number(r.ingresos),
          finalizadas: Number(r.finalizadas),
        })),
      };
    }

    // Detalle de asesor(es): cuando hay 1+ asesores filtrados.
    // El listado tabular pierde sentido; mostramos un dashboard ejecutivo.
    let asesorDetail: AsesorDetail | null = null;
    if (asesores.length > 0) {
      const aPlaceholders = asesores.map(() => '?').join(',');
      const baseAsesoresParams = [...asesores];
      const withSucursalParams = sucursal ? [...baseAsesoresParams, sucursal] : baseAsesoresParams;
      const sucursalCondInner = sucursal ? `AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?` : '';

      const [resumenRows, bySucursalRows, byStateRows, byAgeRows, oldestRows, monthlyRows] = await Promise.all([
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT
              COUNT(*) AS total_ots,
              SUM(CASE WHEN FechaFinalizado IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas,
              SUM(CASE WHEN FechaFinalizado IS NULL     THEN 1 ELSE 0 END) AS abiertas,
              AVG(CASE WHEN FechaFinalizado IS NOT NULL AND fechaingreso IS NOT NULL
                       THEN DATEDIFF(FechaFinalizado, fechaingreso) END) AS dias_cierre,
              SUM(MONTOTOTAL) AS monto_total
           FROM v_maestro_ot_condor
           WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
             AND TRIM(CONVERT(ASESOR USING utf8mb4)) IN (${aPlaceholders})
             ${sucursalCondInner}`,
          withSucursalParams,
        ),
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal, COUNT(*) AS cnt
           FROM v_maestro_ot_condor
           WHERE FechaFinalizado IS NULL
             AND TRIM(CONVERT(ASESOR USING utf8mb4)) IN (${aPlaceholders})
             ${sucursalCondInner}
           GROUP BY TRIM(CONVERT(SUCURSAL USING utf8mb4))
           HAVING sucursal <> ''
           ORDER BY cnt DESC`,
          withSucursalParams,
        ),
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT TRIM(CONVERT(ESTADOOT USING utf8mb4)) AS estado, COUNT(*) AS cnt
           FROM v_maestro_ot_condor
           WHERE FechaFinalizado IS NULL
             AND TRIM(CONVERT(ASESOR USING utf8mb4)) IN (${aPlaceholders})
             ${sucursalCondInner}
           GROUP BY TRIM(CONVERT(ESTADOOT USING utf8mb4))
           ORDER BY cnt DESC`,
          withSucursalParams,
        ),
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT
              CASE
                WHEN DATEDIFF(CURDATE(), fechaingreso) <= 7   THEN '0-7 días'
                WHEN DATEDIFF(CURDATE(), fechaingreso) <= 30  THEN '8-30 días'
                WHEN DATEDIFF(CURDATE(), fechaingreso) <= 90  THEN '1-3 meses'
                WHEN DATEDIFF(CURDATE(), fechaingreso) <= 180 THEN '3-6 meses'
                ELSE '+6 meses'
              END AS bucket,
              COUNT(*) AS cnt
           FROM v_maestro_ot_condor
           WHERE FechaFinalizado IS NULL
             AND fechaingreso IS NOT NULL
             AND TRIM(CONVERT(ASESOR USING utf8mb4)) IN (${aPlaceholders})
             ${sucursalCondInner}
           GROUP BY bucket
           ORDER BY MIN(DATEDIFF(CURDATE(), fechaingreso))`,
          withSucursalParams,
        ),
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT OT, DATEDIFF(CURDATE(), fechaingreso) AS dias,
                  TRIM(CONVERT(NOMBRECLIENTE USING utf8mb4)) AS cliente,
                  TRIM(CONVERT(ESTADOOT USING utf8mb4))      AS estado,
                  TRIM(CONVERT(ASESOR USING utf8mb4))        AS asesor,
                  TRIM(CONVERT(SUCURSAL USING utf8mb4))      AS sucursal,
                  TRIM(CONVERT(MODELO USING utf8mb4))        AS modelo,
                  MONTOTOTAL
           FROM v_maestro_ot_condor
           WHERE FechaFinalizado IS NULL
             AND fechaingreso IS NOT NULL
             AND TRIM(CONVERT(ASESOR USING utf8mb4)) IN (${aPlaceholders})
             ${sucursalCondInner}
           ORDER BY fechaingreso ASC
           LIMIT 10`,
          withSucursalParams,
        ),
        connection.execute<mysql.RowDataPacket[]>(
          `SELECT DATE_FORMAT(fechaingreso, '%Y-%m') AS month,
                  COUNT(*) AS ingresos,
                  SUM(CASE WHEN FechaFinalizado IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
           FROM v_maestro_ot_condor
           WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
             AND TRIM(CONVERT(ASESOR USING utf8mb4)) IN (${aPlaceholders})
             ${sucursalCondInner}
           GROUP BY DATE_FORMAT(fechaingreso, '%Y-%m')
           ORDER BY month ASC`,
          withSucursalParams,
        ),
      ]);

      const r0 = resumenRows[0][0] ?? {};
      const totalOts    = Number(r0.total_ots ?? 0);
      const finalizadas = Number(r0.finalizadas ?? 0);
      asesorDetail = {
        asesores,
        totalOts,
        finalizadas,
        abiertas:           Number(r0.abiertas ?? 0),
        tasaCierre:         totalOts > 0 ? (finalizadas / totalOts) * 100 : 0,
        diasPromedioCierre: Math.round(Number(r0.dias_cierre ?? 0)),
        montoTotal:         Number(r0.monto_total ?? 0),
        bySucursal: bySucursalRows[0].map(r => ({ sucursal: String(r.sucursal), count: Number(r.cnt) })),
        byState:    byStateRows[0].map(r => ({ estado: String(r.estado), count: Number(r.cnt) })),
        byAge:      byAgeRows[0].map(r => ({ bucket: String(r.bucket), count: Number(r.cnt) })),
        topOldest:  oldestRows[0].map(r => ({
          ot: Number(r.OT), dias: Number(r.dias),
          cliente: String(r.cliente ?? '').trim(),
          estado:  String(r.estado ?? '').trim(),
          asesor:  String(r.asesor ?? '').trim(),
          sucursal: String(r.sucursal ?? '').trim(),
          modelo:  String(r.modelo ?? '').trim(),
          montoTotal: Number(r.MONTOTOTAL ?? 0),
        })),
        monthlyIn: monthlyRows[0].map(r => ({
          month: String(r.month),
          ingresos: Number(r.ingresos),
          finalizadas: Number(r.finalizadas),
        })),
      };
    }

    const payload = {
      sucursales,
      asesores: asesoresReport,
      sucursalDetail,
      asesorDetail,
      availableSucursales,
      availableAsesores,
      filtros: { sucursal, asesores },
      generatedAt: new Date().toISOString(),
    };

    cacheSet(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('[ot-seguimiento/reportes]', err.message);
    return NextResponse.json({ error: 'Error al generar el reporte' }, { status: 500 });
  } finally {
    await connection?.end();
  }
}
