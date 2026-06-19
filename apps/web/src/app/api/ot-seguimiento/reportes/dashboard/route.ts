import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import { getDmsConnection } from '@/lib/dms-connection';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ts: number; payload: unknown }>();

export interface DashboardPayload {
  filters: { days: number; dateFrom: string | null; dateTo: string | null; sucursal: string; tipo: string };
  generatedAt: string;
  kpi: {
    // OTs abiertas operativamente y NO facturadas (las que realmente requieren acción).
    totalAbiertas: number;
    vencidas: number;
    atrasoCritico: number;     // > 30 días en taller
    montoTotal: number;
    tasaCierre30d: number;     // % finalizadas / total últimos 30 días
    diasPromedio: number;
    // OTs ya facturadas pero todavía abiertas operativamente. El cliente está
    // conforme; solo falta cierre interno del taller. Widget independiente.
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

export async function GET(req: NextRequest) {
  const days      = Math.max(1, Math.min(720, Number(req.nextUrl.searchParams.get('days') ?? 365)));
  const dateFrom  = req.nextUrl.searchParams.get('dateFrom')?.trim() ?? '';
  const dateTo    = req.nextUrl.searchParams.get('dateTo')?.trim() ?? '';
  const sucursal  = req.nextUrl.searchParams.get('sucursal')?.trim() ?? '';
  const tipo      = req.nextUrl.searchParams.get('tipo')?.trim() ?? '';
  const force     = req.nextUrl.searchParams.get('force') === '1';

  const useRange = DATE_RE.test(dateFrom) && DATE_RE.test(dateTo) && dateFrom <= dateTo;

  const cacheKey = useRange
    ? `r=${dateFrom}:${dateTo}|s=${sucursal}|t=${tipo}`
    : `d=${days}|s=${sucursal}|t=${tipo}`;
  if (!force) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload);
    }
  }

  // Predicates compartidos
  let whereExtra = '';
  const extraParams: any[] = [];
  if (sucursal) { whereExtra += ' AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?'; extraParams.push(sucursal); }
  if (tipo)     { whereExtra += ' AND TRIM(CONVERT(TipoServicio USING utf8mb4)) = ?'; extraParams.push(tipo); }

  const params: any[] = useRange ? [dateFrom, dateTo, ...extraParams] : [days, ...extraParams];
  const baseWhere = useRange
    ? `WHERE fechaingreso BETWEEN ? AND ?${whereExtra}`
    : `WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL ? DAY)${whereExtra}`;
  const abiertaCond = `CONVERT(ESTADOOT USING utf8mb4) <> 'Finalizado' AND FechaFinalizado IS NULL`;
  // Una OT facturada al cliente, aunque siga abierta operativamente, se considera
  // OK desde el negocio (cliente conforme, solo falta cierre interno del taller).
  // Las métricas de "abiertas / vencidas / atrasos" la EXCLUYEN para no inflar
  // el indicador con casos que ya no requieren acción comercial.
  const noFacturadaCond = `(ESTADOFINANCIERO IS NULL OR TRIM(UPPER(CONVERT(ESTADOFINANCIERO USING utf8mb4))) <> 'FACTURADO')`;
  const facturadaCond   = `TRIM(UPPER(CONVERT(ESTADOFINANCIERO USING utf8mb4))) = 'FACTURADO'`;
  const operativaAbierta = `(${abiertaCond}) AND ${noFacturadaCond}`;
  const facturadaAbierta = `(${abiertaCond}) AND ${facturadaCond}`;

  let connection: mysql.Connection | null = null;
  try {
    connection = await getDmsConnection();

    // 1. KPIs globales — excluyendo facturadas (cliente OK · no requiere acción)
    const [kpiRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        SUM(CASE WHEN ${operativaAbierta} THEN 1 ELSE 0 END) AS abiertas,
        SUM(CASE WHEN FechaCompromisoClienteMaster IS NOT NULL
                  AND FechaCompromisoClienteMaster < CURDATE()
                  AND FechaFinalizado IS NULL
                  AND ${noFacturadaCond} THEN 1 ELSE 0 END) AS vencidas,
        SUM(CASE WHEN ${operativaAbierta} AND DIASINGRESO > 30 THEN 1 ELSE 0 END) AS atraso_critico,
        SUM(CASE WHEN ${operativaAbierta} THEN MONTOTOTAL ELSE 0 END) AS monto_total,
        AVG(CASE WHEN ${operativaAbierta} THEN DIASINGRESO END) AS dias_promedio,
        SUM(CASE WHEN ${facturadaAbierta} THEN 1 ELSE 0 END) AS facturadas_pendientes,
        SUM(CASE WHEN ${facturadaAbierta} THEN MONTOTOTAL ELSE 0 END) AS facturadas_monto
      FROM v_maestro_ot_condor ${baseWhere}`,
      params,
    );

    // Tasa de cierre: usa el mismo rango si es custom, si no siempre 30d fijos
    const tasaWhere = useRange
      ? `WHERE fechaingreso BETWEEN ? AND ?${whereExtra}`
      : `WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)${whereExtra}`;
    const tasaParams = useRange ? [dateFrom, dateTo, ...extraParams] : extraParams;
    const [tasaRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        COUNT(*) AS total_30d,
        SUM(CASE WHEN FechaFinalizado IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas_30d
      FROM v_maestro_ot_condor ${tasaWhere}`,
      tasaParams,
    );

    // 2. Distribución por estado (para todas las OTs en el período)
    const [estadoRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        TRIM(CONVERT(ESTADOOT USING utf8mb4)) AS estado,
        COUNT(*) AS total,
        SUM(CASE WHEN FechaCompromisoClienteMaster IS NOT NULL
                  AND FechaCompromisoClienteMaster < CURDATE()
                  AND FechaFinalizado IS NULL THEN 1 ELSE 0 END) AS vencidas
      FROM v_maestro_ot_condor ${baseWhere}
      GROUP BY estado
      HAVING estado <> ''
      ORDER BY total DESC`,
      params,
    );

    // 3. Por sucursal — abiertas (operativa real) + facturadas (cierre interno) por separado
    const [sucursalRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal,
        COUNT(*) AS total,
        SUM(CASE WHEN ${operativaAbierta} THEN 1 ELSE 0 END) AS abiertas,
        SUM(CASE WHEN FechaCompromisoClienteMaster IS NOT NULL
                  AND FechaCompromisoClienteMaster < CURDATE()
                  AND FechaFinalizado IS NULL
                  AND ${noFacturadaCond} THEN 1 ELSE 0 END) AS vencidas,
        SUM(CASE WHEN ${operativaAbierta} AND DIASINGRESO > 30 THEN 1 ELSE 0 END) AS criticas,
        SUM(CASE WHEN ${facturadaAbierta} THEN 1 ELSE 0 END) AS facturadas
      FROM v_maestro_ot_condor ${baseWhere}
      GROUP BY sucursal
      HAVING sucursal <> ''
      ORDER BY abiertas DESC`,
      params,
    );

    // 4. Por tipo de servicio (con métricas operativas: días promedio en taller y tasa de cierre)
    const [tipoRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        TRIM(CONVERT(TipoServicio USING utf8mb4)) AS tipo,
        COUNT(*) AS total,
        SUM(MONTOTOTAL) AS monto,
        AVG(CASE WHEN ${abiertaCond} THEN DIASINGRESO END) AS avg_days_open,
        SUM(CASE WHEN FechaFinalizado IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
      FROM v_maestro_ot_condor ${baseWhere}
      GROUP BY tipo
      HAVING tipo <> ''
      ORDER BY total DESC`,
      params,
    );

    // 5. Antigüedad en taller (solo abiertas operativas, sin facturadas) - bucketizado
    const [antRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        CASE
          WHEN DIASINGRESO <= 7 THEN 'Reciente · 0-7 d'
          WHEN DIASINGRESO <= 14 THEN 'Normal · 8-14 d'
          WHEN DIASINGRESO <= 30 THEN 'Demora · 15-30 d'
          WHEN DIASINGRESO <= 60 THEN 'Atraso alto · 31-60 d'
          WHEN DIASINGRESO <= 90 THEN 'Atraso crítico · 61-90 d'
          ELSE 'Congelada · +90 d'
        END AS bucket,
        COUNT(*) AS total,
        SUM(MONTOTOTAL) AS monto
      FROM v_maestro_ot_condor
      ${baseWhere} AND ${operativaAbierta}
      GROUP BY bucket`,
      params,
    );

    // 6. Tendencia mensual (últimos 12 meses, ignora filtro days para tener serie completa)
    const tendParams: any[] = [];
    let tendWhere = '';
    if (sucursal) { tendWhere += ' AND TRIM(CONVERT(SUCURSAL USING utf8mb4)) = ?'; tendParams.push(sucursal); }
    if (tipo)     { tendWhere += ' AND TRIM(CONVERT(TipoServicio USING utf8mb4)) = ?'; tendParams.push(tipo); }
    const [tendRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        DATE_FORMAT(fechaingreso, '%Y-%m') AS mes,
        COUNT(*) AS ingresos,
        SUM(CASE WHEN FechaFinalizado IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas
      FROM v_maestro_ot_condor
      WHERE fechaingreso >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)${tendWhere}
      GROUP BY mes
      ORDER BY mes ASC`,
      tendParams,
    );

    // 7. TOP 20 OTs vencidas con más días de retraso (excluye facturadas — el cliente ya está OK)
    const [vencidasRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        OT, TRIM(CONVERT(NOMBRECLIENTE USING utf8mb4)) AS cliente,
        TRIM(CONVERT(MODELO USING utf8mb4)) AS modelo,
        TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal,
        TRIM(CONVERT(ESTADOOT USING utf8mb4)) AS estado_ot,
        TRIM(CONVERT(TipoServicio USING utf8mb4)) AS tipo_servicio,
        FechaCompromisoClienteMaster AS fecha_compromiso,
        DATEDIFF(CURDATE(), FechaCompromisoClienteMaster) AS dias_retraso,
        MONTOTOTAL
      FROM v_maestro_ot_condor
      ${baseWhere}
        AND FechaCompromisoClienteMaster IS NOT NULL
        AND FechaCompromisoClienteMaster < CURDATE()
        AND FechaFinalizado IS NULL
        AND ${noFacturadaCond}
      ORDER BY dias_retraso DESC
      LIMIT 20`,
      params,
    );

    // 7b. TOP 30 OTs MÁS CRÍTICAS — combina compromiso vencido + atraso crítico (>30 d en taller)
    // Score de criticidad = max(días de retraso, días en taller) — la más urgente sube al top.
    const [criticasRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        OT, TRIM(CONVERT(NOMBRECLIENTE USING utf8mb4)) AS cliente,
        TRIM(CONVERT(MODELO USING utf8mb4)) AS modelo,
        TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal,
        TRIM(CONVERT(ESTADOOT USING utf8mb4)) AS estado_ot,
        TRIM(CONVERT(TipoServicio USING utf8mb4)) AS tipo_servicio,
        fechaingreso                              AS fecha_ingreso,
        FechaCompromisoClienteMaster              AS fecha_compromiso,
        DIASINGRESO                                AS dias_ingreso,
        CASE
          WHEN FechaCompromisoClienteMaster IS NOT NULL AND FechaCompromisoClienteMaster < CURDATE()
            THEN DATEDIFF(CURDATE(), FechaCompromisoClienteMaster)
          ELSE 0
        END AS dias_retraso,
        MONTOTOTAL,
        GREATEST(
          IFNULL(DIASINGRESO, 0),
          CASE WHEN FechaCompromisoClienteMaster < CURDATE()
            THEN DATEDIFF(CURDATE(), FechaCompromisoClienteMaster) ELSE 0 END
        ) AS criticidad
      FROM v_maestro_ot_condor
      ${baseWhere}
        AND ${operativaAbierta}
        AND (
          DIASINGRESO > 30
          OR (FechaCompromisoClienteMaster IS NOT NULL AND FechaCompromisoClienteMaster < CURDATE())
        )
      ORDER BY criticidad DESC
      LIMIT 30`,
      params,
    );

    // 7c. TOP 30 OTs FACTURADAS pendientes de cierre operativo
    // Cliente conforme · acción interna del taller (cerrar el ticket).
    // Se ordenan por días en taller para detectar las más rezagadas en el cierre.
    const [facturadasRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        OT, TRIM(CONVERT(NOMBRECLIENTE USING utf8mb4)) AS cliente,
        TRIM(CONVERT(MODELO USING utf8mb4)) AS modelo,
        TRIM(CONVERT(SUCURSAL USING utf8mb4)) AS sucursal,
        TRIM(CONVERT(ESTADOOT USING utf8mb4)) AS estado_ot,
        TRIM(CONVERT(TipoServicio USING utf8mb4)) AS tipo_servicio,
        fechaingreso AS fecha_ingreso,
        TRIM(f.horaingreso) AS hora_ingreso,
        DIASINGRESO  AS dias_ingreso,
        MONTOTOTAL
      FROM v_maestro_ot_condor
      LEFT JOIN (SELECT nroot, MIN(horaingreso) AS horaingreso FROM v_maestro_ot_filtros WHERE horaingreso IS NOT NULL AND TRIM(horaingreso) <> '' GROUP BY nroot) f ON f.nroot = OT
      ${baseWhere}
        AND ${facturadaAbierta}
      ORDER BY DIASINGRESO DESC
      LIMIT 30`,
      params,
    );

    // 8. Top 10 asesores
    const [asesorRows] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT
        TRIM(CONVERT(ASESOR USING utf8mb4)) AS asesor,
        COUNT(*) AS total,
        SUM(CASE WHEN FechaFinalizado IS NOT NULL THEN 1 ELSE 0 END) AS finalizadas,
        SUM(MONTOTOTAL) AS monto
      FROM v_maestro_ot_condor
      ${baseWhere} AND TRIM(CONVERT(ASESOR USING utf8mb4)) <> ''
      GROUP BY asesor
      ORDER BY total DESC
      LIMIT 10`,
      params,
    );

    // Armado del payload
    const k = kpiRows[0] ?? {};
    const t = tasaRows[0] ?? {};
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
      porEstado:   estadoRows.map(r => ({
        estado:    String(r.estado),
        total:     Number(r.total ?? 0),
        vencidas:  Number(r.vencidas ?? 0),
      })),
      porSucursal: sucursalRows.map(r => ({
        sucursal:    String(r.sucursal),
        total:       Number(r.total ?? 0),
        abiertas:    Number(r.abiertas ?? 0),
        vencidas:    Number(r.vencidas ?? 0),
        criticas:    Number(r.criticas ?? 0),
        facturadas:  Number(r.facturadas ?? 0),
      })),
      porTipo:     tipoRows.map(r => {
        const total       = Number(r.total ?? 0);
        const finalizadas = Number(r.finalizadas ?? 0);
        return {
          tipo:        String(r.tipo),
          total,
          monto:       Number(r.monto ?? 0),
          avgDaysOpen: Math.round(Number(r.avg_days_open ?? 0)),
          tasaCierre:  total > 0 ? Math.round((finalizadas / total) * 1000) / 10 : 0,
        };
      }),
      antiguedad:  antRows.map(r => ({
        bucket:    String(r.bucket),
        total:     Number(r.total ?? 0),
        monto:     Number(r.monto ?? 0),
      })),
      tendencia:   tendRows.map(r => ({
        mes:         String(r.mes),
        ingresos:    Number(r.ingresos ?? 0),
        finalizadas: Number(r.finalizadas ?? 0),
      })),
      vencidasTop: vencidasRows.map(r => ({
        ot:              Number(r.OT),
        cliente:         String(r.cliente ?? ''),
        modelo:          String(r.modelo ?? ''),
        sucursal:        String(r.sucursal ?? ''),
        estadoOt:        String(r.estado_ot ?? ''),
        tipoServicio:    String(r.tipo_servicio ?? ''),
        fechaCompromiso: r.fecha_compromiso ? new Date(r.fecha_compromiso).toISOString().split('T')[0] : '',
        diasRetraso:     Number(r.dias_retraso ?? 0),
        monto:           Number(r.MONTOTOTAL ?? 0),
      })),
      criticasTop: criticasRows.map(r => {
        const dIng = Number(r.dias_ingreso ?? 0);
        const dRet = Number(r.dias_retraso ?? 0);
        // Razón más relevante: si hay vencimiento, lo priorizamos.
        let razon = '';
        if (dRet > 0 && dIng > 30)      razon = 'Vencido + atraso crítico';
        else if (dRet > 0)              razon = 'Compromiso vencido';
        else if (dIng > 90)             razon = 'Congelada (+90 d)';
        else if (dIng > 60)             razon = 'Atraso crítico (61-90 d)';
        else                            razon = 'Atraso alto (+30 d)';
        return {
          ot:              Number(r.OT),
          cliente:         String(r.cliente ?? ''),
          modelo:          String(r.modelo ?? ''),
          sucursal:        String(r.sucursal ?? ''),
          estadoOt:        String(r.estado_ot ?? ''),
          tipoServicio:    String(r.tipo_servicio ?? ''),
          fechaIngreso:    r.fecha_ingreso ? new Date(r.fecha_ingreso).toISOString().split('T')[0] : '',
          fechaCompromiso: r.fecha_compromiso ? new Date(r.fecha_compromiso).toISOString().split('T')[0] : null,
          diasIngreso:     dIng,
          diasRetraso:     dRet,
          criticidad:      Number(r.criticidad ?? 0),
          razon,
          monto:           Number(r.MONTOTOTAL ?? 0),
        };
      }),
      facturadasTop: facturadasRows.map(r => ({
        ot:          Number(r.OT),
        cliente:     String(r.cliente ?? ''),
        modelo:      String(r.modelo ?? ''),
        sucursal:    String(r.sucursal ?? ''),
        estadoOt:    String(r.estado_ot ?? ''),
        tipoServicio: String(r.tipo_servicio ?? ''),
        fechaIngreso: r.fecha_ingreso ? new Date(r.fecha_ingreso).toISOString().split('T')[0] : '',
        horaIngreso:  r.hora_ingreso ? String(r.hora_ingreso).trim() || null : null,
        diasIngreso:  Number(r.dias_ingreso ?? 0),
        monto:        Number(r.MONTOTOTAL ?? 0),
      })),
      topAsesores: asesorRows.map(r => {
        const total = Number(r.total ?? 0);
        const fin   = Number(r.finalizadas ?? 0);
        return {
          asesor:      String(r.asesor),
          total,
          finalizadas: fin,
          tasaCierre:  total > 0 ? Math.round((fin / total) * 1000) / 10 : 0,
          monto:       Number(r.monto ?? 0),
        };
      }),
    };

    cache.set(cacheKey, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('[reportes/dashboard]', err.message);
    return NextResponse.json({ error: 'Error al generar el dashboard' }, { status: 500 });
  } finally {
    await connection?.end();
  }
}
