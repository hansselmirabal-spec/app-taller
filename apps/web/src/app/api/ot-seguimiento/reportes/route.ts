import { NextRequest, NextResponse } from 'next/server';
import * as sql from 'mssql';
import { getDmsPool } from '@/lib/dms-connection';

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

function addOptionalFilters(
  req: sql.Request,
  sucursal: string,
  asesores: string[],
): { sucursalCond: string; asesorCond: string } {
  let sucursalCond = '';
  let asesorCond   = '';
  if (sucursal) {
    req.input('sucursal', sql.NVarChar(255), sucursal);
    sucursalCond = 'AND d.Descripcion = @sucursal';
  }
  if (asesores.length > 0) {
    asesores.forEach((a, i) => req.input(`asesor${i}`, sql.NVarChar(255), a));
    const inList = asesores.map((_, i) => `@asesor${i}`).join(',');
    asesorCond = `AND m.asesor IN (${inList})`;
  }
  return { sucursalCond, asesorCond };
}

export async function GET(req: NextRequest) {
  const force     = req.nextUrl.searchParams.get('force') === '1';
  const sucursal  = req.nextUrl.searchParams.get('sucursal')?.trim() ?? '';
  const asesorRaw = req.nextUrl.searchParams.get('asesor')?.trim() ?? '';
  const asesores  = asesorRaw
    ? Array.from(new Set(asesorRaw.split(',').map(s => s.trim()).filter(Boolean))).sort()
    : [];

  const cacheKey = `${sucursal}|${asesores.join(',')}`;
  if (!force) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload);
    }
  }

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await getDmsPool();

    // Options: distinct sucursales and asesores for dropdowns (last 365 days)
    const [sucOpts, aseOpts] = await Promise.all([
      pool.request().query<{ sucursal: string }>(`
        SELECT DISTINCT d.Descripcion AS sucursal
        FROM MYSQL_DW.dbo.MasterOT_Condor m
        INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
        WHERE m.fechaingreso >= DATEADD(DAY, -365, GETDATE())
          AND d.Descripcion IS NOT NULL AND d.Descripcion <> ''
        ORDER BY d.Descripcion
      `),
      pool.request().query<{ asesor: string }>(`
        SELECT DISTINCT m.asesor
        FROM MYSQL_DW.dbo.MasterOT_Condor m
        WHERE m.fechaingreso >= DATEADD(DAY, -365, GETDATE())
          AND m.asesor IS NOT NULL AND m.asesor <> ''
        ORDER BY m.asesor
      `),
    ]);
    const availableSucursales = sucOpts.recordset.map(r => r.sucursal);
    const availableAsesores   = aseOpts.recordset.map(r => r.asesor);

    // Report 1: open OTs by sucursal
    const rSucursal = pool.request();
    const { sucursalCond: scS, asesorCond: acS } = addOptionalFilters(rSucursal, sucursal, asesores);
    const sucursalesResult = await rSucursal.query(`
      SELECT
        d.Descripcion AS sucursal,
        COUNT(*) AS total,
        SUM(CASE WHEN m.EstadoOT = 'Abierto' THEN 1 ELSE 0 END) AS abiertas,
        SUM(CASE
              WHEN m.fechacompromisoCliente < CAST(GETDATE() AS DATE)
               AND m.fecha_cierre_ot IS NULL
              THEN 1 ELSE 0 END) AS vencidas,
        AVG(CAST(DATEDIFF(DAY, m.fechaingreso, GETDATE()) AS FLOAT)) AS dias_promedio,
        SUM(ISNULL(CAST(m.monto AS FLOAT), 0)) AS monto_total
      FROM MYSQL_DW.dbo.MasterOT_Condor m
      INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
      WHERE m.EstadoOT = 'Abierto'
        AND m.fechaingreso >= DATEADD(DAY, -365, GETDATE())
        ${scS} ${acS}
      GROUP BY d.Descripcion
      HAVING d.Descripcion <> ''
      ORDER BY abiertas DESC
    `);

    // Report 2: advisor productivity last 30 days
    const rAsesor = pool.request();
    const { sucursalCond: scA, asesorCond: acA } = addOptionalFilters(rAsesor, sucursal, asesores);
    const asesoresResult = await rAsesor.query(`
      SELECT TOP 50
        m.asesor,
        d.Descripcion AS sucursal,
        COUNT(*) AS total_ots,
        SUM(CASE WHEN m.fecha_cierre_ot IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas,
        SUM(CASE WHEN m.fecha_cierre_ot IS NULL THEN 1 ELSE 0 END) AS abiertas,
        AVG(CASE WHEN m.fecha_cierre_ot IS NOT NULL AND m.fechaingreso IS NOT NULL
                 THEN CAST(DATEDIFF(DAY, m.fechaingreso, m.fecha_cierre_ot) AS FLOAT) END) AS dias_promedio_cierre,
        SUM(ISNULL(CAST(m.monto AS FLOAT), 0)) AS monto_total
      FROM MYSQL_DW.dbo.MasterOT_Condor m
      INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
      WHERE m.fechaingreso >= DATEADD(DAY, -30, GETDATE())
        AND m.asesor IS NOT NULL AND m.asesor <> ''
        ${scA} ${acA}
      GROUP BY m.asesor, d.Descripcion
      ORDER BY total_ots DESC
    `);

    const sucursales: SucursalReportRow[] = sucursalesResult.recordset.map(r => ({
      sucursal:     String(r.sucursal ?? ''),
      total:        Number(r.total ?? 0),
      abiertas:     Number(r.abiertas ?? 0),
      vencidas:     Number(r.vencidas ?? 0),
      diasPromedio: Math.round(Number(r.dias_promedio ?? 0)),
      montoTotal:   Number(r.monto_total ?? 0),
    }));

    const asesoresReport: AsesorReportRow[] = asesoresResult.recordset.map(r => ({
      asesor:             String(r.asesor ?? ''),
      sucursal:           String(r.sucursal ?? ''),
      totalOts:           Number(r.total_ots ?? 0),
      finalizadas:        Number(r.finalizadas ?? 0),
      abiertas:           Number(r.abiertas ?? 0),
      diasPromedioCierre: Math.round(Number(r.dias_promedio_cierre ?? 0)),
      montoTotal:         Number(r.monto_total ?? 0),
    }));

    // Sucursal detail (only when filtering by a single sucursal)
    let sucursalDetail: SucursalDetail | null = null;
    if (sucursal) {
      const mkReq = () => {
        const r = pool!.request();
        r.input('sucursal', sql.NVarChar(255), sucursal);
        if (asesores.length) asesores.forEach((a, i) => r.input(`asesor${i}`, sql.NVarChar(255), a));
        return r;
      };
      const aeFilter = asesores.length
        ? `AND m.asesor IN (${asesores.map((_, i) => `@asesor${i}`).join(',')})`
        : '';

      const [byStateR, byAgeR, oldestR, monthlyR] = await Promise.all([
        mkReq().query(`
          SELECT m.EstadoTaller AS estado, COUNT(*) AS cnt
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fecha_cierre_ot IS NULL
            AND d.Descripcion = @sucursal ${aeFilter}
          GROUP BY m.EstadoTaller ORDER BY cnt DESC
        `),
        mkReq().query(`
          SELECT
            CASE
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 7   THEN '0-7 días'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 30  THEN '8-30 días'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 90  THEN '1-3 meses'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 180 THEN '3-6 meses'
              ELSE '+6 meses'
            END AS bucket, COUNT(*) AS cnt
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fecha_cierre_ot IS NULL AND m.fechaingreso IS NOT NULL
            AND d.Descripcion = @sucursal ${aeFilter}
          GROUP BY
            CASE
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 7   THEN '0-7 días'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 30  THEN '8-30 días'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 90  THEN '1-3 meses'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 180 THEN '3-6 meses'
              ELSE '+6 meses'
            END
        `),
        mkReq().query(`
          SELECT TOP 10
            m.nroot AS OT,
            DATEDIFF(DAY, m.fechaingreso, GETDATE()) AS dias,
            m.nombrecliente AS cliente,
            m.EstadoTaller AS estado,
            m.asesor,
            m.modelo,
            ISNULL(CAST(m.monto AS FLOAT), 0) AS MONTOTOTAL
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fecha_cierre_ot IS NULL AND m.fechaingreso IS NOT NULL
            AND d.Descripcion = @sucursal ${aeFilter}
          ORDER BY m.fechaingreso ASC
        `),
        mkReq().query(`
          SELECT
            FORMAT(m.fechaingreso, 'yyyy-MM') AS month,
            COUNT(*) AS ingresos,
            SUM(CASE WHEN m.fecha_cierre_ot IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fechaingreso >= DATEADD(MONTH, -12, GETDATE())
            AND d.Descripcion = @sucursal ${aeFilter}
          GROUP BY FORMAT(m.fechaingreso, 'yyyy-MM')
          ORDER BY month ASC
        `),
      ]);

      sucursalDetail = {
        sucursal,
        byState:   byStateR.recordset.map(r => ({ estado: String(r.estado ?? ''), count: Number(r.cnt) })),
        byAge:     byAgeR.recordset.map(r => ({ bucket: String(r.bucket), count: Number(r.cnt) })),
        topOldest: oldestR.recordset.map(r => ({
          ot: Number(r.OT), dias: Number(r.dias),
          cliente: String(r.cliente ?? '').trim(),
          estado:  String(r.estado ?? '').trim(),
          asesor:  String(r.asesor ?? '').trim(),
          modelo:  String(r.modelo ?? '').trim(),
          montoTotal: Number(r.MONTOTOTAL ?? 0),
        })),
        monthlyIn: monthlyR.recordset.map(r => ({
          month: String(r.month),
          ingresos: Number(r.ingresos),
          finalizadas: Number(r.finalizadas),
        })),
      };
    }

    // Asesor detail (when one or more asesores filtered)
    let asesorDetail: AsesorDetail | null = null;
    if (asesores.length > 0) {
      const mkReqA = () => {
        const r = pool!.request();
        asesores.forEach((a, i) => r.input(`asesor${i}`, sql.NVarChar(255), a));
        if (sucursal) r.input('sucursal', sql.NVarChar(255), sucursal);
        return r;
      };
      const inList     = asesores.map((_, i) => `@asesor${i}`).join(',');
      const sucFilter  = sucursal ? 'AND d.Descripcion = @sucursal' : '';

      const [resumenR, bySucursalR, byStateR, byAgeR, oldestR, monthlyR] = await Promise.all([
        mkReqA().query(`
          SELECT
            COUNT(*) AS total_ots,
            SUM(CASE WHEN m.fecha_cierre_ot IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas,
            SUM(CASE WHEN m.fecha_cierre_ot IS NULL THEN 1 ELSE 0 END) AS abiertas,
            AVG(CASE WHEN m.fecha_cierre_ot IS NOT NULL AND m.fechaingreso IS NOT NULL
                     THEN CAST(DATEDIFF(DAY, m.fechaingreso, m.fecha_cierre_ot) AS FLOAT) END) AS dias_cierre,
            SUM(ISNULL(CAST(m.monto AS FLOAT), 0)) AS monto_total
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fechaingreso >= DATEADD(DAY, -365, GETDATE())
            AND m.asesor IN (${inList}) ${sucFilter}
        `),
        mkReqA().query(`
          SELECT d.Descripcion AS sucursal, COUNT(*) AS cnt
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fecha_cierre_ot IS NULL
            AND m.asesor IN (${inList}) ${sucFilter}
            AND d.Descripcion <> ''
          GROUP BY d.Descripcion ORDER BY cnt DESC
        `),
        mkReqA().query(`
          SELECT m.EstadoTaller AS estado, COUNT(*) AS cnt
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fecha_cierre_ot IS NULL
            AND m.asesor IN (${inList}) ${sucFilter}
          GROUP BY m.EstadoTaller ORDER BY cnt DESC
        `),
        mkReqA().query(`
          SELECT
            CASE
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 7   THEN '0-7 días'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 30  THEN '8-30 días'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 90  THEN '1-3 meses'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 180 THEN '3-6 meses'
              ELSE '+6 meses'
            END AS bucket, COUNT(*) AS cnt
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fecha_cierre_ot IS NULL AND m.fechaingreso IS NOT NULL
            AND m.asesor IN (${inList}) ${sucFilter}
          GROUP BY
            CASE
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 7   THEN '0-7 días'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 30  THEN '8-30 días'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 90  THEN '1-3 meses'
              WHEN DATEDIFF(DAY, m.fechaingreso, GETDATE()) <= 180 THEN '3-6 meses'
              ELSE '+6 meses'
            END
        `),
        mkReqA().query(`
          SELECT TOP 10
            m.nroot AS OT,
            DATEDIFF(DAY, m.fechaingreso, GETDATE()) AS dias,
            m.nombrecliente AS cliente,
            m.EstadoTaller AS estado,
            m.asesor,
            d.Descripcion AS sucursal,
            m.modelo,
            ISNULL(CAST(m.monto AS FLOAT), 0) AS MONTOTOTAL
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fecha_cierre_ot IS NULL AND m.fechaingreso IS NOT NULL
            AND m.asesor IN (${inList}) ${sucFilter}
          ORDER BY m.fechaingreso ASC
        `),
        mkReqA().query(`
          SELECT
            FORMAT(m.fechaingreso, 'yyyy-MM') AS month,
            COUNT(*) AS ingresos,
            SUM(CASE WHEN m.fecha_cierre_ot IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
          FROM MYSQL_DW.dbo.MasterOT_Condor m
          INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
          WHERE m.fechaingreso >= DATEADD(MONTH, -12, GETDATE())
            AND m.asesor IN (${inList}) ${sucFilter}
          GROUP BY FORMAT(m.fechaingreso, 'yyyy-MM')
          ORDER BY month ASC
        `),
      ]);

      const r0        = resumenR.recordset[0] ?? {};
      const totalOts  = Number(r0.total_ots ?? 0);
      const finalizadas = Number(r0.finalizadas ?? 0);
      asesorDetail = {
        asesores,
        totalOts,
        finalizadas,
        abiertas:           Number(r0.abiertas ?? 0),
        tasaCierre:         totalOts > 0 ? (finalizadas / totalOts) * 100 : 0,
        diasPromedioCierre: Math.round(Number(r0.dias_cierre ?? 0)),
        montoTotal:         Number(r0.monto_total ?? 0),
        bySucursal: bySucursalR.recordset.map(r => ({ sucursal: String(r.sucursal), count: Number(r.cnt) })),
        byState:    byStateR.recordset.map(r => ({ estado: String(r.estado ?? ''), count: Number(r.cnt) })),
        byAge:      byAgeR.recordset.map(r => ({ bucket: String(r.bucket), count: Number(r.cnt) })),
        topOldest:  oldestR.recordset.map(r => ({
          ot: Number(r.OT), dias: Number(r.dias),
          cliente:  String(r.cliente ?? '').trim(),
          estado:   String(r.estado ?? '').trim(),
          asesor:   String(r.asesor ?? '').trim(),
          sucursal: String(r.sucursal ?? '').trim(),
          modelo:   String(r.modelo ?? '').trim(),
          montoTotal: Number(r.MONTOTOTAL ?? 0),
        })),
        monthlyIn: monthlyR.recordset.map(r => ({
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
    await pool?.close();
  }
}
