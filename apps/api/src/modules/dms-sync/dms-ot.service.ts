import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmsOtRow } from './dms-ot-row.entity';
import { DmsSyncState } from './dms-sync-state.entity';

export interface OtFilters {
  estadoOt?: string;
  sucursal?: string;
  empresa?: string;
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
        'ot.empresa AS empresa',
        'ot.fechaIngreso AS "fechaIngreso"',
        'ot.horaIngreso AS "horaIngreso"',
        'ot.fechaCompromisoCliente AS "fechaCompromisoCliente"',
        'ot.fechaCierreOt AS "fechaCierreOt"',
        'ot.fechaFinTaller AS "fechaFinTaller"',
        'ot.monto AS monto',
        'ot.idTipoServicio AS "idTipoServicio"',
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
      estadoIdis:             Number(r.idTipoServicio) === 9
                                ? 'En Presupuesto'
                                : String(r.estadoTaller ?? r.estadoOt ?? '').trim(),
      estadoFinanciero:       String(r.estadoFinanciero ?? '').trim(),
      asesor:                 String(r.asesor ?? '').trim(),
      sucursal:               String(r.sucursalDesc ?? '').trim(),
      empresa:                String(r.empresa ?? '').trim() || null,
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
      vencidos: vencidos.map(v => ({
        ot:              Number(v.nroot),
        cliente:         String(v.nombrecliente ?? '').trim(),
        modelo:          String(v.modelo ?? '').trim(),
        asesor:          String(v.asesor ?? '').trim(),
        sucursal:        String(v.sucursal_desc ?? '').trim(),
        fechaCompromiso: v.fecha_compromiso_cliente
          ? new Date(v.fecha_compromiso_cliente).toISOString().split('T')[0]
          : '',
        diasVencido:     v.diasRetraso != null ? Math.max(0, Number(v.diasRetraso)) : 0,
        diasEnTaller:    v.fecha_ingreso
          ? Math.max(0, Math.floor((Date.now() - new Date(v.fecha_ingreso).getTime()) / 86400000))
          : 0,
      })),
      proximosVencer: proximosVencer.map(p => {
        const msLeft = p.fecha_compromiso_cliente
          ? new Date(p.fecha_compromiso_cliente).getTime() - Date.now()
          : 0;
        return {
          ot:              Number(p.nroot),
          cliente:         String(p.nombrecliente ?? '').trim(),
          modelo:          String(p.modelo ?? '').trim(),
          asesor:          String(p.asesor ?? '').trim(),
          fechaCompromiso: p.fecha_compromiso_cliente
            ? new Date(p.fecha_compromiso_cliente).toISOString().split('T')[0]
            : '',
          diasRestantes:   Math.max(0, Math.ceil(msLeft / 86400000)),
        };
      }),
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

  // ── GET /dms/ot-seguimiento/operativo?drill=<metric> ─────────────────────────
  async getOperativoDrill(metric: string, periodo: string): Promise<any> {
    const isHoy = periodo === 'hoy';
    const dateFilter = isHoy
      ? `AND fecha_ingreso::DATE = CURRENT_DATE`
      : `AND fecha_ingreso >= CURRENT_DATE - INTERVAL '7 days'`;

    const labels: Record<string, string> = {
      ingresos: isHoy ? 'Ingresos hoy' : 'Ingresos esta semana',
      vencidos: 'Compromisos vencidos',
      cerrados: isHoy ? 'Cerradas hoy' : 'Cerradas esta semana',
      criticas: 'OTs críticas (+30 días)',
      abiertas: 'Total abiertas',
      atraso:   'En atraso (14-30 días)',
    };

    const whereMap: Record<string, string> = {
      ingresos: `fecha_ingreso IS NOT NULL ${dateFilter}`,
      vencidos: `fecha_compromiso_cliente < NOW() AND fecha_cierre_ot IS NULL AND estado_ot = 'Abierto'`,
      cerrados: `fecha_cierre_ot IS NOT NULL ${isHoy
        ? `AND fecha_cierre_ot::DATE = CURRENT_DATE`
        : `AND fecha_cierre_ot >= CURRENT_DATE - INTERVAL '7 days'`}`,
      criticas: `estado_ot = 'Abierto' AND (CURRENT_DATE - fecha_ingreso) > 30`,
      abiertas: `estado_ot = 'Abierto'`,
      atraso:   `estado_ot = 'Abierto' AND (CURRENT_DATE - fecha_ingreso) BETWEEN 14 AND 30`,
    };

    const where = whereMap[metric] ?? `estado_ot = 'Abierto'`;

    const rows: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, modelo, asesor, sucursal_desc,
        estado_ot, estado_taller,
        fecha_ingreso, fecha_compromiso_cliente, fecha_cierre_ot,
        (CURRENT_DATE - fecha_ingreso)           AS dias_en_taller
      FROM dms_ot_rows
      WHERE ${where}
      ORDER BY dias_en_taller DESC NULLS LAST
      LIMIT 200
    `);

    return {
      metric,
      label:  labels[metric] ?? metric,
      total:  rows.length,
      rows: rows.map(r => ({
        ot:              Number(r.nroot),
        cliente:         String(r.nombrecliente ?? '').trim(),
        modelo:          String(r.modelo ?? '').trim(),
        asesor:          String(r.asesor ?? '').trim(),
        estado:          String(r.estado_taller ?? r.estado_ot ?? '').trim(),
        sucursal:        String(r.sucursal_desc ?? '').trim(),
        fechaIngreso:    r.fecha_ingreso ? new Date(r.fecha_ingreso).toISOString().split('T')[0] : '',
        diasEnTaller:    r.dias_en_taller != null ? Math.max(0, Number(r.dias_en_taller)) : 0,
        fechaCompromiso: r.fecha_compromiso_cliente
          ? new Date(r.fecha_compromiso_cliente).toISOString().split('T')[0]
          : undefined,
        fechaCierre:     r.fecha_cierre_ot
          ? new Date(r.fecha_cierre_ot).toISOString().split('T')[0]
          : undefined,
      })),
    };
  }

  // ── GET /dms/ot-seguimiento/reportes ─────────────────────────────────────────
  async getReportes(filters?: OtFilters): Promise<any> {
    const sucursalCond = filters?.sucursal
      ? `AND sucursal_desc = '${filters.sucursal.replace(/'/g, "''")}'`
      : '';

    const sucursalSummary: any[] = await this.otRepo.query(`
      SELECT
        sucursal_desc                                                         AS sucursal,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto')                        AS abiertas,
        COUNT(*) FILTER (WHERE fecha_cierre_ot IS NOT NULL)                  AS finalizadas,
        COUNT(*) FILTER (WHERE fecha_compromiso_cliente < NOW()
                           AND fecha_cierre_ot IS NULL)                      AS vencidas,
        COALESCE(SUM(monto), 0)                                              AS "montoTotal",
        ROUND(AVG(CASE WHEN estado_ot = 'Abierto'
                       THEN (CURRENT_DATE - fecha_ingreso) END)::NUMERIC, 1) AS "diasPromedio"
      FROM dms_ot_rows
      WHERE sucursal_desc IS NOT NULL ${sucursalCond}
      GROUP BY sucursal_desc
      ORDER BY abiertas DESC
    `);

    const asesorDays = filters?.days && filters.days > 0 ? filters.days : null;
    const asesorDateFilter = asesorDays
      ? `AND fecha_ingreso >= NOW() - INTERVAL '1 day' * ${asesorDays}`
      : '';

    const asesorList: any[] = await this.otRepo.query(`
      SELECT
        asesor,
        MAX(sucursal_desc)                                                    AS sucursal,
        COUNT(*)                                                              AS "totalOts",
        COUNT(*) FILTER (WHERE fecha_cierre_ot IS NOT NULL)                  AS finalizadas,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto')                        AS abiertas,
        COALESCE(SUM(monto), 0)                                              AS "montoTotal",
        COALESCE(ROUND(AVG(
          CASE WHEN fecha_cierre_ot IS NOT NULL
               THEN (fecha_cierre_ot::date - fecha_ingreso::date) END
        )::NUMERIC, 1), 0)                                                   AS "diasPromedioCierre"
      FROM dms_ot_rows
      WHERE asesor IS NOT NULL ${sucursalCond} ${asesorDateFilter}
      GROUP BY asesor
      ORDER BY "totalOts" DESC
    `);

    const sucursalOptions: any[] = await this.otRepo.query(
      `SELECT DISTINCT sucursal_desc AS sucursal FROM dms_ot_rows
       WHERE sucursal_desc IS NOT NULL ORDER BY sucursal_desc`,
    );
    const asesorOptions: any[] = await this.otRepo.query(
      `SELECT DISTINCT asesor FROM dms_ot_rows WHERE asesor IS NOT NULL ORDER BY asesor`,
    );

    // ── Asesor detail when filter applied ────────────────────────────────────
    let asesorDetail: Record<string, unknown> | null = null;
    const asesoresFiltro: string[] = filters?.asesor
      ? filters.asesor.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    if (asesoresFiltro.length > 0) {
      const placeholders = asesoresFiltro.map((_, i) => `$${i + 1}`).join(',');
      const aRows: any[] = await this.otRepo.query(
        `SELECT nroot, asesor, sucursal_desc, estado_ot, estado_taller,
                modelo, monto, nombrecliente,
                fecha_ingreso, fecha_cierre_ot, fecha_compromiso_cliente,
                (CURRENT_DATE - fecha_ingreso) AS dias
         FROM dms_ot_rows
         WHERE asesor IN (${placeholders}) ${asesorDateFilter}`,
        asesoresFiltro,
      );

      const totalOts = aRows.length;
      const finalizadas = aRows.filter(r => r.fecha_cierre_ot).length;
      const abiertas = aRows.filter(r => r.estado_ot === 'Abierto').length;
      const tasaCierre = totalOts > 0 ? Math.round((finalizadas / totalOts) * 100) : 0;
      const montoTotal = aRows.reduce((s, r) => s + Number(r.monto ?? 0), 0);
      const closed = aRows.filter(r => r.fecha_cierre_ot && r.fecha_ingreso);
      const diasPromedioCierre = closed.length
        ? Math.round(closed.reduce((s, r) => s + Number(r.dias ?? 0), 0) / closed.length)
        : 0;

      // bySucursal
      const sucMap: Record<string, number> = {};
      aRows.forEach(r => { sucMap[r.sucursal_desc ?? ''] = (sucMap[r.sucursal_desc ?? ''] ?? 0) + 1; });
      const bySucursal = Object.entries(sucMap).map(([sucursal, count]) => ({ sucursal, count })).sort((a, b) => b.count - a.count);

      // byState
      const stateMap: Record<string, number> = {};
      aRows.forEach(r => { const s = r.estado_taller ?? r.estado_ot ?? ''; stateMap[s] = (stateMap[s] ?? 0) + 1; });
      const byState = Object.entries(stateMap).map(([estado, count]) => ({ estado, count })).sort((a, b) => b.count - a.count);

      // byAge buckets
      const buckets: Record<string, number> = { 'Reciente · 0-7 d': 0, 'Normal · 8-14 d': 0, 'Demora · 15-30 d': 0, 'Atraso alto · 31-60 d': 0, 'Atraso crítico · 61-90 d': 0, 'Congelada · +90 d': 0 };
      aRows.filter(r => r.estado_ot === 'Abierto').forEach(r => {
        const d = Number(r.dias ?? 0);
        if (d <= 7) buckets['Reciente · 0-7 d']++;
        else if (d <= 14) buckets['Normal · 8-14 d']++;
        else if (d <= 30) buckets['Demora · 15-30 d']++;
        else if (d <= 60) buckets['Atraso alto · 31-60 d']++;
        else if (d <= 90) buckets['Atraso crítico · 61-90 d']++;
        else buckets['Congelada · +90 d']++;
      });
      const byAge = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

      // topOldest abiertas
      const topOldest = aRows
        .filter(r => r.estado_ot === 'Abierto')
        .sort((a, b) => Number(b.dias) - Number(a.dias))
        .slice(0, 10)
        .map(r => ({
          ot: Number(r.nroot), dias: Number(r.dias ?? 0),
          cliente: String(r.nombrecliente ?? '').trim(),
          estado: String(r.estado_taller ?? r.estado_ot ?? '').trim(),
          asesor: String(r.asesor ?? '').trim(),
          sucursal: String(r.sucursal_desc ?? '').trim(),
          modelo: String(r.modelo ?? '').trim(),
          montoTotal: Number(r.monto ?? 0),
        }));

      asesorDetail = { asesores: asesoresFiltro, totalOts, finalizadas, abiertas, tasaCierre, diasPromedioCierre, montoTotal, bySucursal, byState, byAge, topOldest, monthlyIn: [] };
    }

    const generatedAt = new Date().toISOString();
    return {
      sucursales: sucursalSummary.map(s => ({
        sucursal:     s.sucursal,
        abiertas:     Number(s.abiertas),
        finalizadas:  Number(s.finalizadas),
        vencidas:     Number(s.vencidas),
        montoTotal:   Number(s.montoTotal),
        diasPromedio: Number(s.diasPromedio ?? 0),
      })),
      asesores: asesorList.map(a => ({
        asesor:             a.asesor,
        sucursal:           a.sucursal ?? '',
        totalOts:           Number(a.totalOts),
        finalizadas:        Number(a.finalizadas),
        abiertas:           Number(a.abiertas),
        montoTotal:         Number(a.montoTotal),
        diasPromedioCierre: Number(a.diasPromedioCierre ?? 0),
      })),
      sucursalDetail:      null,
      asesorDetail,
      availableSucursales: sucursalOptions.map(r => r.sucursal),
      availableAsesores:   asesorOptions.map(r => r.asesor),
      filtros:             { sucursal: filters?.sucursal ?? '', asesores: asesoresFiltro },
      generatedAt,
    };
  }

  // ── GET /dms/ot-seguimiento/reportes/dashboard ───────────────────────────────
  async getReportesDashboard(filters?: OtFilters): Promise<any> {
    // ── Build shared filter params ─────────────────────────────────────────────
    const fp: any[] = [];
    const parts: string[] = [];

    if (filters?.dateFrom && filters?.dateTo) {
      parts.push(`fecha_ingreso >= $${fp.push(filters.dateFrom)} AND fecha_ingreso <= $${fp.push(filters.dateTo)}`);
    } else if (filters?.days && filters.days > 0) {
      parts.push(`fecha_ingreso >= NOW() - INTERVAL '1 day' * $${fp.push(filters.days)}`);
    }
    if (filters?.sucursal) parts.push(`sucursal_desc = $${fp.push(filters.sucursal)}`);
    if (filters?.tipo)     parts.push(`tipo_desc = $${fp.push(filters.tipo)}`);

    const baseWhere = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
    const baseAnd   = parts.length ? `AND ${parts.join(' AND ')}` : '';

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
                           AND (CURRENT_DATE - fecha_ingreso) > 30)       AS criticas,
        COALESCE(SUM(monto) FILTER (WHERE fecha_cierre_ot IS NOT NULL), 0) AS "montoFacturado",
        COALESCE(SUM(monto), 0)                                             AS "montoTotal",
        ROUND(AVG(
          CASE WHEN fecha_cierre_ot IS NOT NULL AND fecha_ingreso IS NOT NULL THEN
            (fecha_cierre_ot - fecha_ingreso)
          END
        )::NUMERIC, 1)                                                      AS "diasPromedioCierre"
      FROM dms_ot_rows
      ${baseWhere}
    `, fp);
    const kpi = kpiRows[0] ?? {};

    // porEstado
    const porEstado: any[] = await this.otRepo.query(`
      SELECT estado_taller AS estado, COUNT(*) AS count
      FROM dms_ot_rows
      WHERE estado_taller IS NOT NULL ${baseAnd}
      GROUP BY estado_taller
      ORDER BY count DESC
    `, fp);

    // porSucursal
    const porSucursal: any[] = await this.otRepo.query(`
      SELECT sucursal_desc AS sucursal, COUNT(*) AS count
      FROM dms_ot_rows
      WHERE sucursal_desc IS NOT NULL ${baseAnd}
      GROUP BY sucursal_desc
      ORDER BY count DESC
    `, fp);

    // porTipo
    const porTipo: any[] = await this.otRepo.query(`
      SELECT tipo_desc AS tipo, COUNT(*) AS count
      FROM dms_ot_rows
      WHERE tipo_desc IS NOT NULL ${baseAnd}
      GROUP BY tipo_desc
      ORDER BY count DESC
    `, fp);

    // Antigüedad buckets
    const antiguedad: any[] = await this.otRepo.query(`
      SELECT
        CASE
          WHEN (CURRENT_DATE - fecha_ingreso) <= 7   THEN 'Reciente · 0-7 d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 14  THEN 'Normal · 8-14 d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 30  THEN 'Demora · 15-30 d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 60  THEN 'Atraso alto · 31-60 d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 90  THEN 'Atraso crítico · 61-90 d'
          ELSE 'Congelada · +90 d'
        END AS bucket,
        COUNT(*) AS count,
        COALESCE(SUM(monto), 0) AS monto
      FROM dms_ot_rows
      WHERE estado_ot = 'Abierto'
        AND fecha_ingreso IS NOT NULL ${baseAnd}
      GROUP BY
        CASE
          WHEN (CURRENT_DATE - fecha_ingreso) <= 7   THEN 'Reciente · 0-7 d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 14  THEN 'Normal · 8-14 d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 30  THEN 'Demora · 15-30 d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 60  THEN 'Atraso alto · 31-60 d'
          WHEN (CURRENT_DATE - fecha_ingreso) <= 90  THEN 'Atraso crítico · 61-90 d'
          ELSE 'Congelada · +90 d'
        END
    `, fp);

    // Tendencia — last 12 months
    const tendenciaFp = filters?.sucursal || filters?.tipo ? fp : [];
    const tendenciaAnd = filters?.sucursal || filters?.tipo ? baseAnd : '';
    const tendencia: any[] = await this.otRepo.query(`
      SELECT
        TO_CHAR(fecha_ingreso, 'YYYY-MM') AS mes,
        COUNT(*)                           AS count
      FROM dms_ot_rows
      WHERE fecha_ingreso >= NOW() - INTERVAL '12 months'
        AND fecha_ingreso IS NOT NULL ${tendenciaAnd}
      GROUP BY TO_CHAR(fecha_ingreso, 'YYYY-MM')
      ORDER BY mes ASC
    `, tendenciaFp);

    // vencidasTop
    const vencidasTop: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, modelo, asesor, sucursal_desc, estado_taller, tipo_abrev,
        fecha_compromiso_cliente,
        (CURRENT_DATE - fecha_compromiso_cliente) AS "diasRetraso",
        COALESCE(monto, 0) AS monto
      FROM dms_ot_rows
      WHERE fecha_compromiso_cliente < NOW()
        AND fecha_cierre_ot IS NULL
        AND estado_ot = 'Abierto' ${baseAnd}
      ORDER BY "diasRetraso" DESC
      LIMIT 10
    `, fp);

    // criticasTop
    const criticasTop: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, modelo, asesor, sucursal_desc, estado_taller, tipo_abrev,
        fecha_ingreso, fecha_compromiso_cliente,
        (CURRENT_DATE - fecha_ingreso) AS "diasIngreso",
        COALESCE(monto, 0) AS monto
      FROM dms_ot_rows
      WHERE estado_ot = 'Abierto'
        AND fecha_ingreso IS NOT NULL ${baseAnd}
      ORDER BY fecha_ingreso ASC
      LIMIT 10
    `, fp);

    // facturadasTop
    const facturadasTop: any[] = await this.otRepo.query(`
      SELECT
        nroot, nombrecliente, modelo, asesor, sucursal_desc, estado_taller, tipo_abrev,
        monto, fecha_ingreso, hora_ingreso, fecha_cierre_ot,
        (CURRENT_DATE - fecha_ingreso) AS "diasIngreso"
      FROM dms_ot_rows
      WHERE fecha_cierre_ot IS NOT NULL
        AND monto IS NOT NULL ${baseAnd}
      ORDER BY monto DESC
      LIMIT 10
    `, fp);

    // topAsesores
    const topAsesores: any[] = await this.otRepo.query(`
      SELECT
        asesor,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado_ot = 'Abierto') AS abiertas,
        COALESCE(SUM(monto) FILTER (WHERE fecha_cierre_ot IS NOT NULL), 0) AS "montoTotal"
      FROM dms_ot_rows
      WHERE asesor IS NOT NULL ${baseAnd}
      GROUP BY asesor
      ORDER BY total DESC
      LIMIT 15
    `, fp);

    const generatedAt = new Date().toISOString();
    return {
      filters: {
        days:      filters?.days ?? 365,
        dateFrom:  filters?.dateFrom ?? null,
        dateTo:    filters?.dateTo   ?? null,
        sucursal:  filters?.sucursal ?? '',
        tipo:      filters?.tipo     ?? '',
      },
      generatedAt,
      kpi: {
        totalAbiertas:       Number(kpi.abiertas          ?? 0),
        vencidas:            Number(kpi.vencidas          ?? 0),
        atrasoCritico:       Number(kpi.criticas          ?? 0),
        montoTotal:          Number(kpi.montoTotal        ?? 0),
        tasaCierre30d:       0,
        diasPromedio:        Number(kpi.diasPromedioCierre ?? 0),
        facturadasPendientes: Number(kpi.cerradas         ?? 0),
        facturadasMonto:     Number(kpi.montoFacturado    ?? 0),
      },
      porEstado:   porEstado.map(r   => ({ estado: r.estado,     total: Number(r.count), vencidas: 0 })),
      porSucursal: porSucursal.map(r => ({ sucursal: r.sucursal, total: Number(r.count), abiertas: Number(r.count), vencidas: 0, criticas: 0, facturadas: 0 })),
      porTipo:     porTipo.map(r     => ({ tipo: r.tipo,         total: Number(r.count), monto: 0, avgDaysOpen: 0, tasaCierre: 0 })),
      antiguedad:  antiguedad.map(r  => ({ bucket: r.bucket, total: Number(r.count), monto: Number(r.monto ?? 0) })),
      tendencia:   tendencia.map(r   => ({ mes: r.mes, ingresos: Number(r.count), finalizadas: 0 })),
      vencidasTop: vencidasTop.map(r => ({
        ot:              Number(r.nroot),
        cliente:         String(r.nombrecliente ?? '').trim(),
        modelo:          String(r.modelo ?? '').trim(),
        sucursal:        String(r.sucursal_desc ?? '').trim(),
        estadoOt:        String(r.estado_taller ?? '').trim(),
        tipoServicio:    String(r.tipo_abrev ?? '').trim(),
        fechaCompromiso: r.fecha_compromiso_cliente
          ? new Date(r.fecha_compromiso_cliente).toISOString().split('T')[0]
          : '',
        diasRetraso:     Number(r.diasRetraso ?? 0),
        monto:           Number(r.monto ?? 0),
      })),
      criticasTop: criticasTop.map(r => ({
        ot:              Number(r.nroot),
        cliente:         String(r.nombrecliente ?? '').trim(),
        modelo:          String(r.modelo ?? '').trim(),
        sucursal:        String(r.sucursal_desc ?? '').trim(),
        estadoOt:        String(r.estado_taller ?? '').trim(),
        tipoServicio:    String(r.tipo_abrev ?? '').trim(),
        fechaIngreso:    r.fecha_ingreso ? new Date(r.fecha_ingreso).toISOString().split('T')[0] : '',
        fechaCompromiso: r.fecha_compromiso_cliente
          ? new Date(r.fecha_compromiso_cliente).toISOString().split('T')[0]
          : null,
        diasIngreso:     Number(r.diasIngreso ?? 0),
        diasRetraso:     0,
        criticidad:      Number(r.diasIngreso ?? 0),
        razon:           'Antigüedad',
        monto:           Number(r.monto ?? 0),
      })),
      facturadasTop: facturadasTop.map(r => ({
        ot:          Number(r.nroot),
        cliente:     String(r.nombrecliente ?? '').trim(),
        modelo:      String(r.modelo ?? '').trim(),
        sucursal:    String(r.sucursal_desc ?? '').trim(),
        estadoOt:    String(r.estado_taller ?? '').trim(),
        tipoServicio: String(r.tipo_abrev ?? '').trim(),
        fechaIngreso: r.fecha_ingreso ? new Date(r.fecha_ingreso).toISOString().split('T')[0] : '',
        horaIngreso:  r.hora_ingreso ? String(r.hora_ingreso).trim() || null : null,
        diasIngreso:  Number(r.diasIngreso ?? 0),
        monto:        Number(r.monto ?? 0),
      })),
      topAsesores: topAsesores.map(a => ({
        asesor: a.asesor, total: Number(a.total),
        finalizadas: Number(a.abiertas), tasaCierre: 0, monto: Number(a.montoTotal ?? 0),
      })),
    };
  }

  // ── GET /dms/ot-seguimiento/reportes/dashboard/detail ────────────────────────
  async getReportesDashboardDetail(kind: string, filters?: OtFilters): Promise<Record<string, unknown>> {
    const whereMap: Record<string, string> = {
      abiertas:      `estado_ot = 'Abierto'`,
      vencidas:      `fecha_compromiso_cliente < NOW() AND fecha_cierre_ot IS NULL AND estado_ot = 'Abierto'`,
      atrasoCritico: `estado_ot = 'Abierto' AND (CURRENT_DATE - fecha_ingreso) > 30`,
      diasPromedio:  `estado_ot = 'Abierto'`,
      montoTotal:    `estado_ot = 'Abierto' AND monto IS NOT NULL AND monto > 0`,
      tasaCierre30d: `fecha_cierre_ot >= CURRENT_DATE - INTERVAL '30 days'`,
      facturadas:    `fecha_cierre_ot IS NOT NULL`,
      antiguedad:    `estado_ot = 'Abierto'`,
    };

    const orderMap: Record<string, string> = {
      montoTotal:    'monto DESC',
      tasaCierre30d: 'monto DESC NULLS LAST',
      facturadas:    'monto DESC NULLS LAST',
      vencidas:      '"diasRetraso" DESC',
    };

    const titleMap: Record<string, string> = {
      abiertas:      'OTs abiertas',
      vencidas:      'Compromisos vencidos',
      atrasoCritico: 'Atraso crítico (+30 d)',
      diasPromedio:  'OTs abiertas (días promedio)',
      montoTotal:    'Monto en taller',
      tasaCierre30d: 'Cerradas últimos 30 días',
      facturadas:    'OTs facturadas',
      antiguedad:    'Antigüedad de OTs abiertas',
    };

    let condition = whereMap[kind] ?? `estado_ot = 'Abierto'`;

    if (kind === 'antiguedad' && filters?.search) {
      condition += ` AND (CURRENT_DATE - fecha_ingreso)::text ILIKE '%${filters.search}%'`;
    }
    if (filters?.sucursal) {
      condition += ` AND sucursal_desc ILIKE '%${filters.sucursal.replace(/'/g, "''")}%'`;
    }
    if (filters?.asesor) {
      condition += ` AND asesor ILIKE '%${filters.asesor.replace(/'/g, "''")}%'`;
    }

    const rows: any[] = await this.otRepo.query(`
      SELECT
        nroot                                                       AS ot,
        nombrecliente                                               AS cliente,
        modelo,
        chasis,
        sucursal_desc                                               AS sucursal,
        COALESCE(estado_taller, estado_ot)                         AS "estadoOt",
        tipo_desc                                                   AS "tipoServicio",
        asesor,
        fecha_ingreso::text                                         AS "fechaIngreso",
        hora_ingreso                                                AS "horaIngreso",
        fecha_compromiso_cliente::text                              AS "fechaCompromiso",
        fecha_cierre_ot::text                                       AS "fechaFinalizado",
        GREATEST(0, (CURRENT_DATE - fecha_ingreso))                AS "diasIngreso",
        CASE WHEN fecha_compromiso_cliente < NOW() AND fecha_cierre_ot IS NULL
             THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - fecha_compromiso_cliente)) / 86400)::int
             ELSE 0
        END                                                         AS "diasRetraso",
        COALESCE(monto, 0)                                          AS monto
      FROM dms_ot_rows
      WHERE ${condition}
      ORDER BY ${orderMap[kind] ?? '(CURRENT_DATE - fecha_ingreso) DESC'}
      LIMIT 500
    `);

    const mapped = rows.map(r => ({
      ot:              Number(r.ot),
      cliente:         String(r.cliente ?? '').trim(),
      modelo:          String(r.modelo ?? '').trim(),
      chasis:          String(r.chasis ?? '').trim(),
      sucursal:        String(r.sucursal ?? '').trim(),
      estadoOt:        String(r.estadoOt ?? '').trim(),
      tipoServicio:    String(r.tipoServicio ?? '').trim(),
      asesor:          String(r.asesor ?? '').trim(),
      fechaIngreso:    r.fechaIngreso ? String(r.fechaIngreso).split('T')[0] : null,
      horaIngreso:     r.horaIngreso ? String(r.horaIngreso).trim() || null : null,
      fechaCompromiso: r.fechaCompromiso ? String(r.fechaCompromiso).split('T')[0] : null,
      fechaFinalizado: r.fechaFinalizado ? String(r.fechaFinalizado).split('T')[0] : null,
      diasIngreso:     Math.max(0, Number(r.diasIngreso ?? 0)),
      diasRetraso:     Math.max(0, Number(r.diasRetraso ?? 0)),
      monto:           Number(r.monto ?? 0),
    }));

    return {
      kpi:         kind,
      title:       titleMap[kind] ?? kind,
      total:       mapped.length,
      rows:        mapped,
      filters:     {
        days:      filters?.days ?? 0,
        sucursal:  filters?.sucursal ?? '',
        tipo:      filters?.tipo ?? '',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // ── GET /dms/ot-detail/:nroot ────────────────────────────────────────────────
  async getOtDetail(nroot: number): Promise<Record<string, unknown> | null> {
    const rows: any[] = await this.otRepo.query(
      `SELECT nroot, nrocliente, nombrecliente, chasis, modelo,
              estado_ot, estado_taller, estado_financiero, asesor,
              taller, sucursal_desc, fecha_ingreso, hora_ingreso,
              fecha_compromiso_cliente, fecha_cierre_ot, fecha_fin_taller,
              monto, idtiposervicio, tipo_desc, synced_at
       FROM dms_ot_rows WHERE nroot = $1 LIMIT 1`,
      [nroot],
    );

    if (!rows.length) return null;
    const r = rows[0];

    const toDate = (v: unknown): string | null =>
      v ? String(v).split('T')[0] : null;

    const fi = toDate(r.fecha_ingreso);
    const diasIngreso = fi
      ? Math.floor((Date.now() - new Date(fi + 'T00:00:00Z').getTime()) / 86_400_000)
      : 0;

    return {
      ot:                     Number(r.nroot),
      codCliente:             String(r.nrocliente ?? '').trim(),
      nombreCliente:          String(r.nombrecliente ?? '').trim(),
      chasis:                 String(r.chasis ?? '').trim(),
      modelo:                 String(r.modelo ?? '').trim(),
      estadoOt:               String(r.estado_taller ?? r.estado_ot ?? '').trim(),
      estadoIdis:             String(r.estado_ot ?? '').trim(),
      estadoFinanciero:       String(r.estado_financiero ?? '').trim(),
      asesor:                 String(r.asesor ?? '').trim(),
      sucursal:               String(r.sucursal_desc ?? '').trim(),
      tipoServicio:           String(r.tipo_desc ?? '').trim(),
      montoTotal:             Number(r.monto ?? 0),
      observaciones:          '',
      diasIngreso:            Math.max(0, diasIngreso),
      diasEnEstado:           0,
      tiempoEntrega:          null,
      fechaIngreso:           fi,
      horaIngreso:            r.hora_ingreso ? String(r.hora_ingreso).trim() || null : null,
      fechaCompromisoCliente: toDate(r.fecha_compromiso_cliente),
      fechaCompromisoTaller:  null,
      fechaCompromisoIdis:    null,
      fechaFinTaller:         toDate(r.fecha_fin_taller),
      fechaFinalizado:        toDate(r.fecha_cierre_ot),
      fechaSalida:            null,
      fechaRenegociacion:     null,
      fechaFactura:           null,
      statusHistory:          [],
      _source:                'materialized',
    };
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

  // ── GET /dms/vehicle-lookup ──────────────────────────────────────────────────
  // Busca por chapa (el campo "chasis" del materializado guarda la chapa, no el VIN)
  // en la última OT sincronizada de dms_ot_rows — sin tocar DMS en vivo.
  async vehicleLookup(query: string): Promise<{
    found: boolean;
    vehicle?: { plate: string; chassis: string; vehicleType: string };
    customer?: { customerName: string; customerNumber: string };
  }> {
    const q = query.trim().toUpperCase();
    if (!q) return { found: false };

    const row = await this.otRepo
      .createQueryBuilder('r')
      .where('UPPER(r.chasis) = :q', { q })
      .orderBy('r.fechaIngreso', 'DESC')
      .getOne();

    if (!row) return { found: false };

    return {
      found: true,
      vehicle: {
        plate:       row.chasis ?? '',
        chassis:     row.chasis ?? '',
        vehicleType: row.modelo ?? '',
      },
      customer: {
        customerName:   row.nombrecliente ?? '',
        customerNumber: row.nrocliente ?? row.codcliente ?? '',
      },
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
    if (filters.empresa) {
      qb.andWhere('ot.empresa = :empresa', { empresa: filters.empresa });
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
