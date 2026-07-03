import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmsOtRow } from './dms-ot-row.entity';
import { DmsSyncState } from './dms-sync-state.entity';

export interface OtFilters {
  estadoOt?: string;
  sucursal?: string;
  asesor?: string;
  tipo?: string;
  taller?: number;
  days?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
}

@Injectable()
export class DmsOtService {
  constructor(
    @InjectRepository(DmsOtRow)
    private readonly otRepo: Repository<DmsOtRow>,
    @InjectRepository(DmsSyncState)
    private readonly stateRepo: Repository<DmsSyncState>,
  ) {}

  // ── GET /dms/ot-seguimiento ───────────────────────────────────────────────────
  async findOtSeguimiento(filters: OtFilters): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    syncStatus: any;
    summary: Record<string, number>;
    truncated: boolean;
    source: string;
    ageSeconds: null;
  }> {
    const page  = Math.max(1, Number(filters.page  ?? 1));
    const limit = Math.min(5000, Math.max(1, Number(filters.limit ?? 50)));
    const skip  = (page - 1) * limit;
    const sortBy  = filters.sortBy  ?? 'fechaIngreso';
    const sortDir = (filters.sortDir ?? 'DESC') as 'ASC' | 'DESC';

    const qb = this.otRepo
      .createQueryBuilder('ot')
      .select([
        'ot.nroot AS nroot',
        'ot.nrocliente AS nrocliente',
        'ot.nombrecliente AS nombrecliente',
        'ot.chasis AS chasis',
        'ot.modelo AS modelo',
        'ot.estadoOt AS "estadoOt"',
        'ot.estadoTaller AS "estadoTaller"',
        'ot.estadoFinanciero AS "estadoFinanciero"',
        'ot.asesor AS asesor',
        'ot.taller AS taller',
        'ot.sucursalDesc AS "sucursalDesc"',
        'ot.fechaIngreso AS "fechaIngreso"',
        'ot.horaIngreso AS "horaIngreso"',
        'ot.fechaCompromisoCliente AS "fechaCompromisoCliente"',
        'ot.fechaCierreOt AS "fechaCierreOt"',
        'ot.fechaFinTaller AS "fechaFinTaller"',
        'ot.monto AS monto',
        'ot.tipoDesc AS "tipoDesc"',
        'ot.tipoAbrev AS "tipoAbrev"',
        'ot.codcliente AS codcliente',
        'ot.syncedAt AS "syncedAt"',
        // diasIngreso computed at query time for freshness
        `EXTRACT(EPOCH FROM (NOW() - ot.fechaIngreso)) / 86400 AS "diasIngreso"`,
      ]);

    this.applyCommonFilters(qb, filters);

    const total = await qb.getCount();

    // Apply sort and pagination after count
    const validSortColumns: Record<string, string> = {
      fechaIngreso: 'ot.fechaIngreso',
      asesor: 'ot.asesor',
      sucursalDesc: 'ot.sucursalDesc',
      estadoOt: 'ot.estadoOt',
      monto: 'ot.monto',
      nroot: 'ot.nroot',
    };
    const sortCol = validSortColumns[sortBy] ?? 'ot.fechaIngreso';

    qb.orderBy(sortCol, sortDir).skip(skip).take(limit);

    const raw = await qb.getRawMany();
    const data = raw.map(r => ({
      ot:                     Number(r.nroot),
      codCliente:             String(r.codcliente ?? r.nrocliente ?? '').trim(),
      nombreCliente:          String(r.nombrecliente ?? '').trim(),
      chasis:                 String(r.chasis ?? '').trim(),
      modelo:                 String(r.modelo ?? '').trim(),
      estadoOt:               String(r.estadoOt ?? '').trim(),
      estadoIdis:             String(r.estadoTaller ?? r.estadoOt ?? '').trim(),
      estadoFinanciero:       String(r.estadoFinanciero ?? '').trim(),
      asesor:                 String(r.asesor ?? '').trim(),
      sucursal:               String(r.sucursalDesc ?? '').trim(),
      diasIngreso:            r.diasIngreso != null ? Math.max(0, Math.floor(Number(r.diasIngreso))) : 0,
      diasEnEstado:           0,
      fechaIngreso:           r.fechaIngreso ? new Date(r.fechaIngreso).toISOString().split('T')[0] : null,
      horaIngreso:            r.horaIngreso ? String(r.horaIngreso).trim() || null : null,
      fechaCompromisoCliente: r.fechaCompromisoCliente ? new Date(r.fechaCompromisoCliente).toISOString().split('T')[0] : null,
      fechaCompromisoTaller:  null,
      fechaFinalizado:        r.fechaCierreOt ? new Date(r.fechaCierreOt).toISOString().split('T')[0] : null,
      montoTotal:             r.monto != null ? Number(r.monto) : 0,
      observaciones:          '',
      tipoServicio:           String(r.tipoAbrev ?? r.tipoDesc ?? '').trim(),
    }));

    // Summary: count by estadoIdis (taller workflow state, not the binary open/closed)
    const summary: Record<string, number> = {};
    for (const row of data) {
      const k = row.estadoIdis || row.estadoOt;
      summary[k] = (summary[k] ?? 0) + 1;
    }

    const syncStatus = await this.getSyncStatus();

    return { data, total, page, limit, syncStatus, summary, truncated: false, source: 'materialized', ageSeconds: null };
  }

  // ── GET /dms/ot-seguimiento/operativo ────────────────────────────────────────
  async getOperativo(periodo: string, filters?: OtFilters): Promise<any> {
    const isHoy = periodo === 'hoy';

    // KPI aggregates
    const kpiRows: any[] = await this.otRepo.query(`
      SELECT
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto')                                        AS "otsAbiertas",
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto'
                           AND (CURRENT_DATE - fecha_ingreso) > 30)                           AS "otsCriticas",
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto'
                           AND fecha_compromiso_cliente < NOW()
                           AND fecha_cierre_ot IS NULL)                                       AS "totalVencidos",
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto'
                           AND (CURRENT_DATE - fecha_ingreso) > 14)                           AS "otsEnAtraso",
        ROUND(AVG(
          CASE WHEN estado_ot = 'Abierto' THEN (CURRENT_DATE - fecha_ingreso) END
        )::NUMERIC, 1)                                                                        AS "diasPromedio",
        COUNT(*) FILTER (WHERE fecha_ingreso::DATE = CURRENT_DATE)                           AS "ingresados",
        COUNT(*) FILTER (WHERE fecha_cierre_ot::DATE = CURRENT_DATE)                         AS "cerradosEnPeriodo",
        ROUND(
          COUNT(*) FILTER (WHERE fecha_cierre_ot::DATE = CURRENT_DATE)::NUMERIC /
          NULLIF(COUNT(*) FILTER (WHERE fecha_ingreso::DATE = CURRENT_DATE), 0) * 100
        , 1)                                                                                   AS "tasaCierre"
      FROM dms_ot_rows
    `);

    const kpi = kpiRows[0] ?? {};

    // vencidos detail — top 20 overdue OTs
    const vencidos: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, chasis, modelo, asesor, sucursal_desc,
        fecha_ingreso, fecha_compromiso_cliente,
        (CURRENT_DATE - fecha_compromiso_cliente) AS "diasRetraso"
      FROM dms_ot_rows
      WHERE fecha_compromiso_cliente < NOW()
        AND fecha_cierre_ot IS NULL
        AND estado_ot = 'Abierto'
      ORDER BY "diasRetraso" DESC
      LIMIT 20
    `);

    // proximosVencer — OTs expiring in next 7 days
    const proximosVencer: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, chasis, modelo, asesor, sucursal_desc,
        fecha_ingreso, fecha_compromiso_cliente
      FROM dms_ot_rows
      WHERE fecha_compromiso_cliente BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND fecha_cierre_ot IS NULL
        AND estado_ot = 'Abierto'
      ORDER BY fecha_compromiso_cliente ASC
      LIMIT 10
    `);

    // distribucion por estado_taller
    const distribucion: any[] = await this.otRepo.query(`
      SELECT estado_taller AS estado, COUNT(*) AS count
      FROM dms_ot_rows
      WHERE estado_ot = 'Abierto'
        AND estado_taller IS NOT NULL
      GROUP BY estado_taller
      ORDER BY count DESC
    `);

    // porAsesor summary
    const porAsesor: any[] = await this.otRepo.query(`
      SELECT
        asesor,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto') AS abiertas,
        ROUND(AVG(CURRENT_DATE - fecha_ingreso)::NUMERIC, 1) AS "diasPromedio"
      FROM dms_ot_rows
      WHERE asesor IS NOT NULL
      GROUP BY asesor
      ORDER BY abiertas DESC
    `);

    // filter options for dropdowns
    const sucursalOpts: any[] = await this.otRepo.query(
      `SELECT DISTINCT sucursal_desc FROM dms_ot_rows WHERE sucursal_desc IS NOT NULL ORDER BY sucursal_desc`,
    );
    const asesorOpts: any[] = await this.otRepo.query(
      `SELECT DISTINCT asesor FROM dms_ot_rows WHERE asesor IS NOT NULL ORDER BY asesor`,
    );

    return {
      periodo:           isHoy ? 'hoy' : 'semana',
      generatedAt:       new Date().toISOString(),
      otsAbiertas:       Number(kpi.otsAbiertas       ?? 0),
      otsCriticas:       Number(kpi.otsCriticas       ?? 0),
      otsEnAtraso:       Number(kpi.otsEnAtraso       ?? 0),
      diasPromedio:      Number(kpi.diasPromedio       ?? 0),
      ingresados:        Number(kpi.ingresados         ?? 0),
      cerradosEnPeriodo: Number(kpi.cerradosEnPeriodo  ?? 0),
      tasaCierre:        Number(kpi.tasaCierre         ?? 0),
      totalVencidos:     Number(kpi.totalVencidos      ?? 0),
      vencidos,
      proximosVencer,
      distribucion: distribucion.map(d => ({ estado: d.estado, count: Number(d.count) })),
      porAsesor: porAsesor.map(a => ({
        asesor:       a.asesor,
        total:        Number(a.total),
        abiertas:     Number(a.abiertas),
        diasPromedio: Number(a.diasPromedio ?? 0),
      })),
      filterOptions: {
        sucursales: sucursalOpts.map(r => r.sucursal_desc),
        asesores:   asesorOpts.map(r => r.asesor),
      },
    };
  }

  // ── GET /dms/ot-seguimiento/reportes ─────────────────────────────────────────
  async getReportes(filters?: OtFilters): Promise<any> {
    const sucursalSummary: any[] = await this.otRepo.query(`
      SELECT
        sucursal_desc AS sucursal,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto')                      AS abiertas,
        COUNT(*) FILTER (WHERE fecha_cierre_ot IS NOT NULL)                AS finalizadas,
        COALESCE(SUM(monto), 0)                                             AS "montoTotal",
        ROUND(AVG(CURRENT_DATE - fecha_ingreso)::NUMERIC, 1) AS "diasPromedio"
      FROM dms_ot_rows
      WHERE sucursal_desc IS NOT NULL
      GROUP BY sucursal_desc
      ORDER BY abiertas DESC
    `);

    const asesorProductivity: any[] = await this.otRepo.query(`
      SELECT
        asesor,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto')       AS abiertas,
        COUNT(*) FILTER (WHERE fecha_cierre_ot IS NOT NULL) AS cerradas,
        COUNT(*)                                              AS total,
        ROUND(AVG(CURRENT_DATE - fecha_ingreso)::NUMERIC, 1) AS "diasPromedio"
      FROM dms_ot_rows
      WHERE asesor IS NOT NULL
      GROUP BY asesor
      ORDER BY total DESC
    `);

    const sucursalOptions: any[] = await this.otRepo.query(`
      SELECT DISTINCT sucursal_desc AS sucursal
      FROM dms_ot_rows
      WHERE sucursal_desc IS NOT NULL
      ORDER BY sucursal_desc
    `);

    const asesorOptions: any[] = await this.otRepo.query(`
      SELECT DISTINCT asesor
      FROM dms_ot_rows
      WHERE asesor IS NOT NULL
      ORDER BY asesor
    `);

    const tipoOptions: any[] = await this.otRepo.query(`
      SELECT DISTINCT tipo_desc AS tipo
      FROM dms_ot_rows
      WHERE tipo_desc IS NOT NULL
      ORDER BY tipo_desc
    `);

    const generatedAt = new Date().toISOString();
    return {
      sucursales: sucursalSummary.map(s => ({
        sucursal:     s.sucursal,
        abiertas:     Number(s.abiertas),
        finalizadas:  Number(s.finalizadas),
        vencidas:     0,
        montoTotal:   Number(s.montoTotal),
        diasPromedio: Number(s.diasPromedio ?? 0),
      })),
      asesores: asesorProductivity.map(a => ({
        asesor:       a.asesor,
        abiertas:     Number(a.abiertas),
        cerradas:     Number(a.cerradas),
        total:        Number(a.total),
        diasPromedio: Number(a.diasPromedio ?? 0),
        montoTotal:   0,
      })),
      sucursalDetail:      null,
      asesorDetail:        null,
      availableSucursales: sucursalOptions.map(r => r.sucursal),
      availableAsesores:   asesorOptions.map(r => r.asesor),
      filtros:             { sucursal: filters?.sucursal ?? '', asesores: filters?.asesor ? [filters.asesor] : [] },
      generatedAt,
    };
  }

  // ── GET /dms/ot-seguimiento/reportes/dashboard ───────────────────────────────
  async getReportesDashboard(filters?: OtFilters): Promise<any> {
    // KPIs
    const kpiRows: any[] = await this.otRepo.query(`
      SELECT
        COUNT(*)                                                            AS total,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto')                      AS abiertas,
        COUNT(*) FILTER (WHERE fecha_cierre_ot IS NOT NULL)                AS cerradas,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto'
                           AND fecha_compromiso_cliente < NOW()
                           AND fecha_cierre_ot IS NULL)                    AS vencidas,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto'
                           AND (CURRENT_DATE - fecha_ingreso) > 30) AS criticas,
        COALESCE(SUM(monto) FILTER (WHERE fecha_cierre_ot IS NOT NULL), 0) AS "montoFacturado",
        COALESCE(SUM(monto), 0)                                             AS "montoTotal",
        ROUND(AVG(
          CASE WHEN fecha_cierre_ot IS NOT NULL AND fecha_ingreso IS NOT NULL THEN
            (fecha_cierre_ot - fecha_ingreso)
          END
        )::NUMERIC, 1)                                                      AS "diasPromedioCierre"
      FROM dms_ot_rows
    `);
    const kpi = kpiRows[0] ?? {};

    // porEstado
    const porEstado: any[] = await this.otRepo.query(`
      SELECT estado_taller AS estado, COUNT(*) AS count
      FROM dms_ot_rows
      WHERE estado_taller IS NOT NULL
      GROUP BY estado_taller
      ORDER BY count DESC
    `);

    // porSucursal
    const porSucursal: any[] = await this.otRepo.query(`
      SELECT sucursal_desc AS sucursal, COUNT(*) AS count
      FROM dms_ot_rows
      WHERE sucursal_desc IS NOT NULL
      GROUP BY sucursal_desc
      ORDER BY count DESC
    `);

    // porTipo
    const porTipo: any[] = await this.otRepo.query(`
      SELECT tipo_desc AS tipo, COUNT(*) AS count
      FROM dms_ot_rows
      WHERE tipo_desc IS NOT NULL
      GROUP BY tipo_desc
      ORDER BY count DESC
    `);

    // Antigüedad buckets
    const antiguedad: any[] = await this.otRepo.query(`
      SELECT
        CASE
          WHEN (CURRENT_DATE - fecha_ingreso) <= 7   THEN '0-7d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 15  THEN '8-15d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 30  THEN '16-30d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 60  THEN '31-60d'
          ELSE '+60d'
        END AS bucket,
        COUNT(*) AS count
      FROM dms_ot_rows
      WHERE estado_ot = 'Abierto'
        AND fecha_ingreso IS NOT NULL
      GROUP BY
        CASE
          WHEN (CURRENT_DATE - fecha_ingreso) <= 7   THEN '0-7d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 15  THEN '8-15d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 30  THEN '16-30d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 60  THEN '31-60d'
          ELSE '+60d'
        END
      ORDER BY bucket
    `);

    // Tendencia — last 12 months ingress
    const tendencia: any[] = await this.otRepo.query(`
      SELECT
        TO_CHAR(fecha_ingreso, 'YYYY-MM') AS mes,
        COUNT(*)                           AS count
      FROM dms_ot_rows
      WHERE fecha_ingreso >= NOW() - INTERVAL '12 months'
        AND fecha_ingreso IS NOT NULL
      GROUP BY TO_CHAR(fecha_ingreso, 'YYYY-MM')
      ORDER BY mes ASC
    `);

    // Tops — vencidas top 10
    const vencidasTop: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, chasis, asesor, sucursal_desc,
        fecha_compromiso_cliente,
        (CURRENT_DATE - fecha_compromiso_cliente) AS "diasRetraso"
      FROM dms_ot_rows
      WHERE fecha_compromiso_cliente < NOW()
        AND fecha_cierre_ot IS NULL
        AND estado_ot = 'Abierto'
      ORDER BY "diasRetraso" DESC
      LIMIT 10
    `);

    // criticasTop — oldest open OTs
    const criticasTop: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, chasis, asesor, sucursal_desc, fecha_ingreso,
        (CURRENT_DATE - fecha_ingreso) AS "diasIngreso"
      FROM dms_ot_rows
      WHERE estado_ot = 'Abierto'
        AND fecha_ingreso IS NOT NULL
      ORDER BY fecha_ingreso ASC
      LIMIT 10
    `);

    // facturadasTop — highest-value closed OTs
    const facturadasTop: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, chasis, asesor, sucursal_desc, monto, fecha_cierre_ot
      FROM dms_ot_rows
      WHERE fecha_cierre_ot IS NOT NULL
        AND monto IS NOT NULL
      ORDER BY monto DESC
      LIMIT 10
    `);

    // topAsesores
    const topAsesores: any[] = await this.otRepo.query(`
      SELECT
        asesor,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto') AS abiertas,
        COALESCE(SUM(monto) FILTER (WHERE fecha_cierre_ot IS NOT NULL), 0) AS "montoTotal"
      FROM dms_ot_rows
      WHERE asesor IS NOT NULL
      GROUP BY asesor
      ORDER BY total DESC
      LIMIT 15
    `);

    return {
      kpi: {
        total:             Number(kpi.total             ?? 0),
        abiertas:          Number(kpi.abiertas          ?? 0),
        cerradas:          Number(kpi.cerradas          ?? 0),
        vencidas:          Number(kpi.vencidas          ?? 0),
        criticas:          Number(kpi.criticas          ?? 0),
        montoFacturado:    Number(kpi.montoFacturado    ?? 0),
        montoTotal:        Number(kpi.montoTotal        ?? 0),
        diasPromedioCierre: Number(kpi.diasPromedioCierre ?? 0),
      },
      porEstado:    porEstado.map(r    => ({ estado: r.estado,       count: Number(r.count) })),
      porSucursal:  porSucursal.map(r  => ({ sucursal: r.sucursal,   count: Number(r.count) })),
      porTipo:      porTipo.map(r      => ({ tipo: r.tipo,           count: Number(r.count) })),
      antiguedad:   antiguedad.map(r   => ({ bucket: r.bucket,       count: Number(r.count) })),
      tendencia:    tendencia.map(r    => ({ mes: r.mes,             count: Number(r.count) })),
      vencidasTop,
      criticasTop,
      facturadasTop,
      topAsesores: topAsesores.map(a => ({
        asesor:     a.asesor,
        total:      Number(a.total),
        abiertas:   Number(a.abiertas),
        montoTotal: Number(a.montoTotal),
      })),
    };
  }

  // ── GET /dms/ot-seguimiento/reportes/dashboard/detail ────────────────────────
  async getReportesDashboardDetail(kind: string, filters?: OtFilters): Promise<any[]> {
    const whereMap: Record<string, string> = {
      vencidas:
        `fecha_compromiso_cliente < NOW() AND fecha_cierre_ot IS NULL AND estado_ot = 'Abierto'`,
      criticas:
        `estado_ot = 'Abierto' AND (CURRENT_DATE - fecha_ingreso) > 30`,
      abiertas:
        `estado_ot = 'Abierto'`,
      cerradas:
        `fecha_cierre_ot IS NOT NULL`,
    };

    const condition = whereMap[kind] ?? '1=1';

    const rows: any[] = await this.otRepo.query(`
      SELECT
        nroot, nrocliente, nombrecliente, chasis, modelo,
        estado_ot, estado_taller, asesor, sucursal_desc,
        fecha_ingreso, hora_ingreso, fecha_compromiso_cliente,
        fecha_cierre_ot, monto, tipo_desc, codcliente, synced_at,
        (CURRENT_DATE - fecha_ingreso) AS "diasIngreso"
      FROM dms_ot_rows
      WHERE ${condition}
      ORDER BY fecha_ingreso ASC
      LIMIT 500
    `);

    return rows;
  }

  // ── GET /dms/sync-status ─────────────────────────────────────────────────────
  async getSyncStatus(): Promise<{
    lastSyncAt: string | null;
    openCount: number;
    totalSynced: number;
    updatedAt: string | null;
    errorMessage: string | null;
  }> {
    const state = await this.stateRepo.findOne({ where: { kind: 'ot_rows' } });
    return {
      lastSyncAt:   state?.lastSyncAt  ? state.lastSyncAt.toISOString()  : null,
      openCount:    state?.openCount   ?? 0,
      totalSynced:  state?.totalSynced ?? 0,
      updatedAt:    state?.updatedAt   ? state.updatedAt.toISOString()   : null,
      errorMessage: state?.errorMessage ?? null,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private applyCommonFilters(qb: any, filters: OtFilters): void {
    if (filters.estadoOt) {
      qb.andWhere('ot.estadoOt = :estadoOt', { estadoOt: filters.estadoOt });
    }
    if (filters.sucursal) {
      qb.andWhere('ot.sucursalDesc ILIKE :sucursal', { sucursal: `%${filters.sucursal}%` });
    }
    if (filters.asesor) {
      qb.andWhere('ot.asesor ILIKE :asesor', { asesor: `%${filters.asesor}%` });
    }
    if (filters.tipo) {
      qb.andWhere('ot.tipoDesc ILIKE :tipo', { tipo: `%${filters.tipo}%` });
    }
    if (filters.taller != null) {
      qb.andWhere('ot.taller = :taller', { taller: filters.taller });
    }
    if (filters.dateFrom) {
      qb.andWhere('ot.fechaIngreso >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('ot.fechaIngreso <= :dateTo', { dateTo: filters.dateTo });
    }
    if (filters.days != null && !filters.dateFrom && !filters.dateTo) {
      qb.andWhere(
        `ot.fechaIngreso >= NOW() - INTERVAL '1 day' * :days`,
        { days: filters.days },
      );
    }
    if (filters.search) {
      qb.andWhere(
        `(CAST(ot.nroot AS TEXT) ILIKE :search OR ot.nombrecliente ILIKE :search OR ot.chasis ILIKE :search)`,
        { search: `%${filters.search}%` },
      );
    }
  }
}
