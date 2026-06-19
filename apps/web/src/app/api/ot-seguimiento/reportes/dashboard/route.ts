import { NextRequest, NextResponse } from 'next/server';
import * as sql from 'mssql';
import { getDmsPool } from '@/lib/dms-connection';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ts: number; payload: unknown }>();

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Helper: add common filter inputs and return the WHERE/AND snippets
function addCommonInputs(
  r: sql.Request,
  { days, dateFrom, dateTo, sucursal, tipo, useRange }: {
    days: number; dateFrom: string; dateTo: string;
    sucursal: string; tipo: string; useRange: boolean;
  },
) {
  if (useRange) {
    r.input('dateFrom', sql.Date, new Date(dateFrom));
    r.input('dateTo',   sql.Date, new Date(dateTo));
  } else {
    r.input('days', sql.Int, days);
  }
  if (sucursal) r.input('sucursal', sql.NVarChar(255), sucursal);
  if (tipo)     r.input('tipo',     sql.NVarChar(255), tipo);
}

export async function GET(req: NextRequest) {
  const days     = Math.max(1, Math.min(720, Number(req.nextUrl.searchParams.get('days') ?? 365)));
  const dateFrom = req.nextUrl.searchParams.get('dateFrom')?.trim() ?? '';
  const dateTo   = req.nextUrl.searchParams.get('dateTo')?.trim()   ?? '';
  const sucursal = req.nextUrl.searchParams.get('sucursal')?.trim() ?? '';
  const tipo     = req.nextUrl.searchParams.get('tipo')?.trim()     ?? '';
  const force    = req.nextUrl.searchParams.get('force') === '1';

  const useRange = DATE_RE.test(dateFrom) && DATE_RE.test(dateTo) && dateFrom <= dateTo;

  const cacheKey = useRange
    ? `r=${dateFrom}:${dateTo}|s=${sucursal}|t=${tipo}`
    : `d=${days}|s=${sucursal}|t=${tipo}`;
  if (!force) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return NextResponse.json(hit.payload);
  }

  const opts = { days, dateFrom, dateTo, sucursal, tipo, useRange };

  // SQL Server reusable fragments
  const dateFilter  = useRange
    ? 'm.fechaingreso BETWEEN @dateFrom AND @dateTo'
    : 'm.fechaingreso >= DATEADD(DAY, -@days, GETDATE())';
  const sucFilter   = sucursal ? 'AND d.Descripcion = @sucursal' : '';
  const tipoFilter  = tipo     ? 'AND ISNULL(ts.descripcion, \'\') = @tipo' : '';
  const extraFilter = `${sucFilter} ${tipoFilter}`;

  // Shared condition blocks
  const abierta        = `m.EstadoOT = 'Abierto'`;
  const facturada      = `UPPER(LTRIM(RTRIM(ISNULL(m.Estadofinanciero, '')))) = 'FACTURADO'`;
  const noFacturada    = `(m.Estadofinanciero IS NULL OR UPPER(LTRIM(RTRIM(m.Estadofinanciero))) <> 'FACTURADO')`;
  const operativaAb    = `${abierta} AND ${noFacturada}`;
  const facturadaAb    = `${abierta} AND ${facturada}`;
  const dias           = `DATEDIFF(DAY, m.fechaingreso, GETDATE())`;
  const vencidaCond    = `(m.fechacompromisoCliente IS NOT NULL AND m.fechacompromisoCliente < CAST(GETDATE() AS DATE) AND m.fecha_cierre_ot IS NULL AND ${noFacturada})`;

  const baseJoin = `
    INNER JOIN MYSQL_DW.dbo.controltiempo_DimSucursal d ON d.IdSucursal = m.taller
    LEFT  JOIN MYSQL_DW.dbo.controltiempo_DimTipoServicio ts ON ts.idtipo_servicio = m.idtiposervicio
  `;

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await getDmsPool();
    const mk = () => {
      const r = pool!.request();
      addCommonInputs(r, opts);
      return r;
    };

    // Run all queries in parallel
    const [
      kpiR, tasaR, estadoR, sucursalR, tipoR,
      antR, tendR, vencidasR, criticasR, factR, asesorR,
    ] = await Promise.all([

      // 1. KPIs
      mk().query(`
        SELECT
          SUM(CASE WHEN ${operativaAb} THEN 1 ELSE 0 END) AS abiertas,
          SUM(CASE WHEN ${vencidaCond} THEN 1 ELSE 0 END) AS vencidas,
          SUM(CASE WHEN ${operativaAb} AND ${dias} > 30 THEN 1 ELSE 0 END) AS atraso_critico,
          SUM(CASE WHEN ${operativaAb} THEN ISNULL(CAST(m.monto AS FLOAT), 0) ELSE 0 END) AS monto_total,
          AVG(CASE WHEN ${operativaAb} THEN CAST(${dias} AS FLOAT) END) AS dias_promedio,
          SUM(CASE WHEN ${facturadaAb} THEN 1 ELSE 0 END) AS facturadas_pendientes,
          SUM(CASE WHEN ${facturadaAb} THEN ISNULL(CAST(m.monto AS FLOAT), 0) ELSE 0 END) AS facturadas_monto
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter}
      `),

      // Tasa cierre 30d
      (() => {
        const r = pool!.request();
        if (sucursal) r.input('sucursal', sql.NVarChar(255), sucursal);
        if (tipo)     r.input('tipo',     sql.NVarChar(255), tipo);
        if (useRange) {
          r.input('dateFrom', sql.Date, new Date(dateFrom));
          r.input('dateTo',   sql.Date, new Date(dateTo));
        }
        const tWhere = useRange
          ? `m.fechaingreso BETWEEN @dateFrom AND @dateTo`
          : `m.fechaingreso >= DATEADD(DAY, -30, GETDATE())`;
        return r.query(`
          SELECT
            COUNT(*) AS total_30d,
            SUM(CASE WHEN m.fecha_cierre_ot IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas_30d
          FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
          WHERE ${tWhere} ${extraFilter}
        `);
      })(),

      // 2. Por estado (EstadoTaller)
      mk().query(`
        SELECT
          ISNULL(m.EstadoTaller, 'Sin estado') AS estado,
          COUNT(*) AS total,
          SUM(CASE WHEN ${vencidaCond} THEN 1 ELSE 0 END) AS vencidas
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter}
        GROUP BY m.EstadoTaller
        HAVING ISNULL(m.EstadoTaller, '') <> ''
        ORDER BY total DESC
      `),

      // 3. Por sucursal
      mk().query(`
        SELECT
          d.Descripcion AS sucursal,
          COUNT(*) AS total,
          SUM(CASE WHEN ${operativaAb} THEN 1 ELSE 0 END) AS abiertas,
          SUM(CASE WHEN ${vencidaCond} THEN 1 ELSE 0 END) AS vencidas,
          SUM(CASE WHEN ${operativaAb} AND ${dias} > 30 THEN 1 ELSE 0 END) AS criticas,
          SUM(CASE WHEN ${facturadaAb} THEN 1 ELSE 0 END) AS facturadas
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter}
        GROUP BY d.Descripcion
        HAVING d.Descripcion <> ''
        ORDER BY abiertas DESC
      `),

      // 4. Por tipo de servicio
      mk().query(`
        SELECT
          ISNULL(ts.descripcion, 'Sin tipo') AS tipo,
          COUNT(*) AS total,
          SUM(ISNULL(CAST(m.monto AS FLOAT), 0)) AS monto,
          AVG(CASE WHEN ${abierta} THEN CAST(${dias} AS FLOAT) END) AS avg_days_open,
          SUM(CASE WHEN m.fecha_cierre_ot IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter}
        GROUP BY ISNULL(ts.descripcion, 'Sin tipo')
        HAVING ISNULL(ts.descripcion, 'Sin tipo') <> 'Sin tipo'
        ORDER BY total DESC
      `),

      // 5. Antigüedad (solo operativas abiertas)
      mk().query(`
        SELECT
          CASE
            WHEN ${dias} <= 7  THEN 'Reciente · 0-7 d'
            WHEN ${dias} <= 14 THEN 'Normal · 8-14 d'
            WHEN ${dias} <= 30 THEN 'Demora · 15-30 d'
            WHEN ${dias} <= 60 THEN 'Atraso alto · 31-60 d'
            WHEN ${dias} <= 90 THEN 'Atraso crítico · 61-90 d'
            ELSE 'Congelada · +90 d'
          END AS bucket,
          COUNT(*) AS total,
          SUM(ISNULL(CAST(m.monto AS FLOAT), 0)) AS monto
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter} AND ${operativaAb}
        GROUP BY
          CASE
            WHEN ${dias} <= 7  THEN 'Reciente · 0-7 d'
            WHEN ${dias} <= 14 THEN 'Normal · 8-14 d'
            WHEN ${dias} <= 30 THEN 'Demora · 15-30 d'
            WHEN ${dias} <= 60 THEN 'Atraso alto · 31-60 d'
            WHEN ${dias} <= 90 THEN 'Atraso crítico · 61-90 d'
            ELSE 'Congelada · +90 d'
          END
      `),

      // 6. Tendencia mensual 12 meses fijos
      (() => {
        const r = pool!.request();
        if (sucursal) r.input('sucursal', sql.NVarChar(255), sucursal);
        if (tipo)     r.input('tipo',     sql.NVarChar(255), tipo);
        return r.query(`
          SELECT
            FORMAT(m.fechaingreso, 'yyyy-MM') AS mes,
            COUNT(*) AS ingresos,
            SUM(CASE WHEN m.fecha_cierre_ot IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
          FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
          WHERE m.fechaingreso >= DATEADD(MONTH, -12, GETDATE()) ${extraFilter}
          GROUP BY FORMAT(m.fechaingreso, 'yyyy-MM')
          ORDER BY mes ASC
        `);
      })(),

      // 7. TOP 20 vencidas
      mk().query(`
        SELECT TOP 20
          m.nroot AS OT,
          m.nombrecliente AS cliente,
          m.modelo,
          d.Descripcion AS sucursal,
          m.EstadoTaller AS estado_ot,
          ISNULL(ts.descripcion, '') AS tipo_servicio,
          m.fechacompromisoCliente AS fecha_compromiso,
          DATEDIFF(DAY, m.fechacompromisoCliente, GETDATE()) AS dias_retraso,
          ISNULL(CAST(m.monto AS FLOAT), 0) AS MONTOTOTAL
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter}
          AND m.fechacompromisoCliente IS NOT NULL
          AND m.fechacompromisoCliente < CAST(GETDATE() AS DATE)
          AND m.fecha_cierre_ot IS NULL
          AND ${noFacturada}
        ORDER BY dias_retraso DESC
      `),

      // 7b. TOP 30 críticas (vencidas o +30 días en taller, no facturadas)
      mk().query(`
        SELECT TOP 30
          m.nroot AS OT,
          m.nombrecliente AS cliente,
          m.modelo,
          d.Descripcion AS sucursal,
          m.EstadoTaller AS estado_ot,
          ISNULL(ts.descripcion, '') AS tipo_servicio,
          m.fechaingreso AS fecha_ingreso,
          m.fechacompromisoCliente AS fecha_compromiso,
          ${dias} AS dias_ingreso,
          CASE WHEN m.fechacompromisoCliente IS NOT NULL AND m.fechacompromisoCliente < CAST(GETDATE() AS DATE)
               THEN DATEDIFF(DAY, m.fechacompromisoCliente, GETDATE()) ELSE 0 END AS dias_retraso,
          ISNULL(CAST(m.monto AS FLOAT), 0) AS MONTOTOTAL,
          CASE
            WHEN ISNULL(${dias}, 0) >=
                 ISNULL(CASE WHEN m.fechacompromisoCliente < CAST(GETDATE() AS DATE)
                             THEN DATEDIFF(DAY, m.fechacompromisoCliente, GETDATE()) ELSE 0 END, 0)
            THEN ISNULL(${dias}, 0)
            ELSE ISNULL(CASE WHEN m.fechacompromisoCliente < CAST(GETDATE() AS DATE)
                             THEN DATEDIFF(DAY, m.fechacompromisoCliente, GETDATE()) ELSE 0 END, 0)
          END AS criticidad
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter}
          AND ${operativaAb}
          AND (
            ${dias} > 30
            OR (m.fechacompromisoCliente IS NOT NULL AND m.fechacompromisoCliente < CAST(GETDATE() AS DATE))
          )
        ORDER BY criticidad DESC
      `),

      // 7c. TOP 30 facturadas pendientes de cierre
      mk().query(`
        SELECT TOP 30
          m.nroot AS OT,
          m.nombrecliente AS cliente,
          m.modelo,
          d.Descripcion AS sucursal,
          m.EstadoTaller AS estado_ot,
          ISNULL(ts.descripcion, '') AS tipo_servicio,
          m.fechaingreso AS fecha_ingreso,
          m.horaingreso AS hora_ingreso,
          ${dias} AS dias_ingreso,
          ISNULL(CAST(m.monto AS FLOAT), 0) AS MONTOTOTAL
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter} AND ${facturadaAb}
        ORDER BY ${dias} DESC
      `),

      // 8. Top 10 asesores
      mk().query(`
        SELECT TOP 10
          m.asesor,
          COUNT(*) AS total,
          SUM(CASE WHEN m.fecha_cierre_ot IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas,
          SUM(ISNULL(CAST(m.monto AS FLOAT), 0)) AS monto
        FROM MYSQL_DW.dbo.MasterOT_Condor m ${baseJoin}
        WHERE ${dateFilter} ${extraFilter}
          AND m.asesor IS NOT NULL AND m.asesor <> ''
        GROUP BY m.asesor
        ORDER BY total DESC
      `),
    ]);

    const k = kpiR.recordset[0] ?? {};
    const t = tasaR.recordset[0] ?? {};
    const total30 = Number(t.total_30d ?? 0);
    const fin30   = Number(t.finalizadas_30d ?? 0);

    const payload: DashboardPayload = {
      filters: { days, dateFrom: useRange ? dateFrom : null, dateTo: useRange ? dateTo : null, sucursal, tipo },
      generatedAt: new Date().toISOString(),
      kpi: {
        totalAbiertas:        Number(k.abiertas ?? 0),
        vencidas:             Number(k.vencidas ?? 0),
        atrasoCritico:        Number(k.atraso_critico ?? 0),
        montoTotal:           Number(k.monto_total ?? 0),
        tasaCierre30d:        total30 > 0 ? Math.round((fin30 / total30) * 1000) / 10 : 0,
        diasPromedio:         Math.round(Number(k.dias_promedio ?? 0)),
        facturadasPendientes: Number(k.facturadas_pendientes ?? 0),
        facturadasMonto:      Number(k.facturadas_monto ?? 0),
      },
      porEstado:   estadoR.recordset.map(r => ({
        estado:   String(r.estado), total: Number(r.total ?? 0), vencidas: Number(r.vencidas ?? 0),
      })),
      porSucursal: sucursalR.recordset.map(r => ({
        sucursal:  String(r.sucursal), total: Number(r.total ?? 0), abiertas: Number(r.abiertas ?? 0),
        vencidas:  Number(r.vencidas ?? 0), criticas: Number(r.criticas ?? 0), facturadas: Number(r.facturadas ?? 0),
      })),
      porTipo: tipoR.recordset.map(r => {
        const total = Number(r.total ?? 0);
        const fin   = Number(r.finalizadas ?? 0);
        return {
          tipo: String(r.tipo), total,
          monto:       Number(r.monto ?? 0),
          avgDaysOpen: Math.round(Number(r.avg_days_open ?? 0)),
          tasaCierre:  total > 0 ? Math.round((fin / total) * 1000) / 10 : 0,
        };
      }),
      antiguedad: antR.recordset.map(r => ({
        bucket: String(r.bucket), total: Number(r.total ?? 0), monto: Number(r.monto ?? 0),
      })),
      tendencia: tendR.recordset.map(r => ({
        mes: String(r.mes), ingresos: Number(r.ingresos ?? 0), finalizadas: Number(r.finalizadas ?? 0),
      })),
      vencidasTop: vencidasR.recordset.map(r => ({
        ot: Number(r.OT), cliente: String(r.cliente ?? ''), modelo: String(r.modelo ?? ''),
        sucursal: String(r.sucursal ?? ''), estadoOt: String(r.estado_ot ?? ''),
        tipoServicio: String(r.tipo_servicio ?? ''),
        fechaCompromiso: r.fecha_compromiso ? new Date(r.fecha_compromiso).toISOString().split('T')[0] : '',
        diasRetraso: Number(r.dias_retraso ?? 0), monto: Number(r.MONTOTOTAL ?? 0),
      })),
      criticasTop: criticasR.recordset.map(r => {
        const dIng = Number(r.dias_ingreso ?? 0);
        const dRet = Number(r.dias_retraso ?? 0);
        let razon = '';
        if (dRet > 0 && dIng > 30)  razon = 'Vencido + atraso crítico';
        else if (dRet > 0)          razon = 'Compromiso vencido';
        else if (dIng > 90)         razon = 'Congelada (+90 d)';
        else if (dIng > 60)         razon = 'Atraso crítico (61-90 d)';
        else                        razon = 'Atraso alto (+30 d)';
        return {
          ot: Number(r.OT), cliente: String(r.cliente ?? ''), modelo: String(r.modelo ?? ''),
          sucursal: String(r.sucursal ?? ''), estadoOt: String(r.estado_ot ?? ''),
          tipoServicio: String(r.tipo_servicio ?? ''),
          fechaIngreso:    r.fecha_ingreso    ? new Date(r.fecha_ingreso).toISOString().split('T')[0]    : '',
          fechaCompromiso: r.fecha_compromiso ? new Date(r.fecha_compromiso).toISOString().split('T')[0] : null,
          diasIngreso: dIng, diasRetraso: dRet, criticidad: Number(r.criticidad ?? 0), razon,
          monto: Number(r.MONTOTOTAL ?? 0),
        };
      }),
      facturadasTop: factR.recordset.map(r => ({
        ot: Number(r.OT), cliente: String(r.cliente ?? ''), modelo: String(r.modelo ?? ''),
        sucursal: String(r.sucursal ?? ''), estadoOt: String(r.estado_ot ?? ''),
        tipoServicio: String(r.tipo_servicio ?? ''),
        fechaIngreso: r.fecha_ingreso ? new Date(r.fecha_ingreso).toISOString().split('T')[0] : '',
        horaIngreso:  r.hora_ingreso  ? String(r.hora_ingreso).trim() || null : null,
        diasIngreso:  Number(r.dias_ingreso ?? 0), monto: Number(r.MONTOTOTAL ?? 0),
      })),
      topAsesores: asesorR.recordset.map(r => {
        const total = Number(r.total ?? 0);
        const fin   = Number(r.finalizadas ?? 0);
        return {
          asesor: String(r.asesor), total, finalizadas: fin,
          tasaCierre: total > 0 ? Math.round((fin / total) * 1000) / 10 : 0,
          monto: Number(r.monto ?? 0),
        };
      }),
    };

    cache.set(cacheKey, { ts: Date.now(), payload });
    return NextResponse.json(payload);

  } catch (err: any) {
    console.error('[reportes/dashboard]', err.message);
    return NextResponse.json({ error: 'Error al generar el dashboard' }, { status: 500 });
  } finally {
    await pool?.close();
  }
}
