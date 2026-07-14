import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as sql from 'mssql';
import * as mysql from 'mysql2/promise';
import { DmsAdvisorSlot } from './dms-advisor-slot.entity';
import { DmsOtRow } from './dms-ot-row.entity';
import { DmsSyncState } from './dms-sync-state.entity';

const getDmsConfig = (): sql.config => ({
  server:   process.env.DMS_HOST ?? '',
  port:     Number(process.env.DMS_PORT ?? 1433),
  user:     process.env.DMS_USER,
  password: process.env.DMS_PASSWORD,
  database: process.env.DMS_DATABASE ?? 'MYSQL_DW',
  options: {
    encrypt:                false,
    trustServerCertificate: true,
  },
  connectionTimeout: 10_000,
  requestTimeout:    60_000,
});

/**
 * Opens a new SQL Server connection pool. Caller must close it in a finally block.
 * DMS is READ-ONLY — never issue INSERT/UPDATE/DELETE.
 */
async function getDmsPool(): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool(getDmsConfig());
  await pool.connect();
  return pool;
}

/**
 * Opens a new MySQL connection to the controltiempo live DMS database.
 * Caller must call conn.end() in a finally block.
 */
async function getMysqlPool(): Promise<mysql.Connection> {
  return mysql.createConnection({
    host:     process.env.CTT_HOST ?? '',
    port:     Number(process.env.CTT_PORT ?? 3306),
    user:     process.env.CTT_USER,
    password: process.env.CTT_PASSWORD,
    database: process.env.CTT_DATABASE ?? 'controltiempo',
    timezone: '+00:00',
  });
}

// OT rows sync interval: default 30 minutes (1_800_000 ms). Override via DMS_SYNC_INTERVAL_MS.
const OT_SYNC_INTERVAL_MS = Number(process.env.DMS_SYNC_INTERVAL_MS ?? 1_800_000);

// Delay before the first OT rows sync tick after startup (60 seconds).
const OT_STARTUP_DELAY_MS = 60_000;

// ID arbitrario único para el advisory lock de Postgres. Tiene que ser estable
// entre réplicas (mismo número en todos los pods). Cualquier int64 fijo sirve.
const SYNC_LOCK_KEY = 7426158;

// Si fallan N syncs consecutivos, escalamos. Threshold 3 = ~15 min sin datos
// (cron cada 5 min × 3 = 15 min).
const ALERT_THRESHOLD = 3;

export interface DmsSyncHealth {
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  status: 'ok' | 'degraded' | 'never-ran';
}

@Injectable()
export class DmsSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DmsSyncService.name);
  private syncing = false;

  // Estado observable para /dms-sync/status y para detectar caídas continuas.
  private lastSyncAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private lastError: string | null = null;
  private consecutiveFailures = 0;

  // Tracks when we last ran syncOtRows() successfully. Used to gate the next run
  // based on OT_SYNC_INTERVAL_MS without changing the existing cron cadence.
  private lastOtSyncAt: Date | null = null;
  // True after the initial 60s startup delay has elapsed for OT sync.
  private otSyncReady = false;

  constructor(
    @InjectRepository(DmsAdvisorSlot)
    private advisorSlotRepo: Repository<DmsAdvisorSlot>,
    @InjectRepository(DmsOtRow)
    private otRowRepo: Repository<DmsOtRow>,
    @InjectRepository(DmsSyncState)
    private stateRepo: Repository<DmsSyncState>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  /** Estado actual del worker para que monitoring/UI lo consulte. */
  getHealth(): DmsSyncHealth {
    const status: DmsSyncHealth['status'] =
      this.lastSyncAt === null ? 'never-ran'
        : this.consecutiveFailures > 0 ? 'degraded'
        : 'ok';
    return {
      lastSyncAt:    this.lastSyncAt?.toISOString()    ?? null,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
      status,
    };
  }

  // Sync inicial al arrancar — sin esperar 5 min al primer cron tick.
  async onApplicationBootstrap() {
    if (!process.env.DMS_HOST) {
      this.logger.warn('DMS_HOST no configurado, salteando sync inicial');
      return;
    }
    this.logger.log('Sync inicial del DMS al arrancar...');
    void this.syncAll().catch(err => this.logger.error('Sync inicial falló', err));

    // OT rows sync must wait 60 seconds after startup before the first tick.
    setTimeout(() => {
      this.otSyncReady = true;
      this.logger.log('OT rows sync habilitado (60s startup delay transcurrido)');
    }, OT_STARTUP_DELAY_MS);
  }

  // Cron principal: cada 5 minutos refresca todos los presets.
  // Protección de concurrencia en 2 capas:
  //   1. Flag in-memory `this.syncing` evita solapamiento dentro del mismo proceso.
  //   2. Postgres advisory lock evita que múltiples réplicas (k8s) sincronicen a la vez.
  //      pg_try_advisory_lock devuelve true si lo obtuvo, false si otro proceso ya lo tiene.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAll() {
    if (this.syncing) {
      this.logger.warn('Sync anterior aún en curso en este proceso, salteando este tick');
      return;
    }

    // Lock distribuido: si otra réplica ya está sincronizando, salimos.
    const acquired = await this.tryAcquireLock();
    if (!acquired) {
      this.logger.log('Otra réplica está ejecutando el sync, salteando este tick');
      return;
    }

    this.syncing = true;
    const t0 = Date.now();
    this.lastSyncAt = new Date();
    try {
      await this.syncAdvisorSlots();
      // Sync OK: reset contador de fallos.
      this.lastSuccessAt = new Date();
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.logger.log(`Sync completo en ${Date.now() - t0}ms`);
    } catch (err: any) {
      this.consecutiveFailures += 1;
      this.lastError = err.message;
      this.logger.error(
        `Sync general falló (${this.consecutiveFailures} consecutivos): ${err.message}`,
        err.stack,
      );
      // Escalar si pasamos el threshold. El marker [ALERT] permite que el log
      // collector (Datadog/Loki/CloudWatch) dispare notificación a oncall.
      if (this.consecutiveFailures >= ALERT_THRESHOLD) {
        this.logger.error(
          `[ALERT] DMS sync falló ${this.consecutiveFailures} veces consecutivas. ` +
          `Último éxito: ${this.lastSuccessAt?.toISOString() ?? 'nunca'}. ` +
          `Operación de OTs degradada — verificar conectividad al DMS.`,
        );
      }
    } finally {
      this.syncing = false;
      await this.releaseLock();
    }

    // OT rows sync runs independently with its own cadence and error isolation.
    // A failure here must NOT affect the advisor-slot path above.
    await this.maybeRunOtRowsSync();
  }

  private async tryAcquireLock(): Promise<boolean> {
    try {
      const rows = await this.dataSource.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [SYNC_LOCK_KEY],
      );
      return rows[0]?.acquired === true;
    } catch (err: any) {
      // Si el lock falla por algo inesperado, mejor no sincronizar que duplicar carga.
      this.logger.error(`No se pudo obtener advisory lock: ${err.message}`);
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      await this.dataSource.query('SELECT pg_advisory_unlock($1)', [SYNC_LOCK_KEY]);
    } catch (err: any) {
      // Liberar el lock no es crítico (Postgres lo libera al cerrar la sesión),
      // pero loguear si falla para debug.
      this.logger.warn(`No se pudo liberar advisory lock: ${err.message}`);
    }
  }

  // ── Sincronización de disponibilidad de asesores DMS ────────────────────────
  // Extrae disponibilidad POR ASESOR de la tabla `agendamiento` del DMS.
  // Ventana: hoy → hoy + 20 días. Nunca escribe ni modifica nada en el DMS.
  // Cada fila = un asesor × un slot de 30 min con su estado de ocupación.
  //
  // NOTE: agendamiento/agendamiento_asesor tables queried via SQL Server syntax.
  // These tables must exist in MYSQL_DW for this sync to succeed.
  async syncAdvisorSlots(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = await getDmsPool();

      // GROUP BY (fecha, sucursal, categoría, tramo, asesor) — una fila por asesor por slot.
      // is_occupied = 1 si el asesor tiene un cliente con estado Agendado (1) o Reagendado (4).
      const result = await pool.request().query(`
        SELECT
          CAST(a.start_date AS DATE)                                 AS slot_date,
          aa.IdSucursalIDIS                                          AS sucursal_idis,
          a.category                                                 AS category_id,
          a.start_time                                               AS time_start,
          MIN(a.end_time)                                            AS time_end,
          a.IdAsesor                                                 AS advisor_code,
          aa.Nombre                                                  AS advisor_name,
          MAX(CASE
            WHEN a.NombreCliente IS NOT NULL
             AND a.IdEstadoAgendamiento IN (1, 4)
            THEN 1 ELSE 0
          END)                                                       AS is_occupied
        FROM dbo.agendamiento a
        INNER JOIN dbo.agendamiento_asesor aa
               ON aa.CodigoIDIS = a.IdAsesor
              AND aa.Estado = 1
        WHERE CAST(a.start_date AS DATE)
              BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, 20, CAST(GETDATE() AS DATE))
          AND a.category IN (1, 2)
          AND (
            a.NombreCliente IS NULL
            OR a.IdEstadoAgendamiento IN (1, 4)
          )
          AND aa.IdSucursalIDIS IS NOT NULL
          AND LTRIM(RTRIM(aa.IdSucursalIDIS)) <> ''
        GROUP BY CAST(a.start_date AS DATE), aa.IdSucursalIDIS, a.category, a.start_time, a.IdAsesor, aa.Nombre
        ORDER BY slot_date, sucursal_idis, time_start, advisor_code
      `);

      const rows = result.recordset as any[];

      if (rows.length === 0) {
        this.logger.warn('syncAdvisorSlots: DMS no devolvió filas. ¿Tabla agendamiento vacía?');
        return;
      }

      const now = new Date();

      await this.dataSource.query(
        `DELETE FROM dms_advisor_slots WHERE date < $1`,
        [today],
      );

      const BATCH = 500;
      const values = rows.map(r => ({
        date:        r.slot_date instanceof Date
                       ? r.slot_date.toISOString().split('T')[0]
                       : String(r.slot_date).split('T')[0],
        sucursalIdis: String(r.sucursal_idis).trim(),
        categoryId:   Number(r.category_id),
        timeStart:    String(r.time_start),
        timeEnd:      String(r.time_end),
        advisorCode:  String(r.advisor_code).trim(),
        advisorName:  String(r.advisor_name ?? '').trim(),
        isOccupied:   Number(r.is_occupied) === 1,
        syncedAt:     now,
      }));

      for (let i = 0; i < values.length; i += BATCH) {
        await this.dataSource
          .createQueryBuilder()
          .insert()
          .into(DmsAdvisorSlot)
          .values(values.slice(i, i + BATCH))
          .orUpdate(
            ['time_end', 'advisor_name', 'is_occupied', 'synced_at'],
            ['date', 'sucursal_idis', 'category_id', 'time_start', 'advisor_code'],
          )
          .execute();
      }

      this.logger.log(`OK advisor-slots → ${rows.length} filas per-asesor (hoy + 20d)`);
    } catch (err: any) {
      this.logger.error(`Falló sync advisor-slots: ${err.message}`);
      throw err;
    } finally {
      await pool?.close();
    }
  }

  // ── Acceso para servicios externos ───────────────────────────────────────────

  // Devuelve slots agrupados por asesor para una fecha.
  // sucursalIdis opcional: si se omite, devuelve todos los asesores de todas las sucursales.
  async getAdvisorSlotsByDate(
    date: string,
    sucursalIdis: string | undefined,
    categoryId = 1,
  ): Promise<{ advisorCode: string; advisorName: string; sucursalId: string; freeSlots: number; slots: { timeStart: string; timeEnd: string; isOccupied: boolean }[] }[]> {
    const where: Record<string, unknown> = { date, categoryId };
    if (sucursalIdis) where['sucursalIdis'] = sucursalIdis;
    const rows = await this.advisorSlotRepo.find({
      where,
      order: { advisorName: 'ASC', timeStart: 'ASC' },
    } as any);

    const advisors = new Map<string, { name: string; sucursalId: string; slots: Map<string, { timeStart: string; timeEnd: string; isOccupied: boolean }> }>();
    for (const row of rows) {
      const code = String(row.advisorCode ?? '').trim();
      if (!code) continue;
      if (!advisors.has(code)) {
        advisors.set(code, { name: String(row.advisorName ?? '').trim(), sucursalId: row.sucursalIdis, slots: new Map() });
      }
      const entry = advisors.get(code)!;
      const existing = entry.slots.get(row.timeStart);
      if (existing) {
        // Mismo slot en otra sucursal: si alguna lo marca como ocupado, queda ocupado
        if (row.isOccupied) existing.isOccupied = true;
      } else {
        entry.slots.set(row.timeStart, {
          timeStart:  row.timeStart,
          timeEnd:    row.timeEnd,
          isOccupied: row.isOccupied,
        });
      }
    }

    return Array.from(advisors.entries()).map(([code, data]) => {
      const slots = Array.from(data.slots.values()).sort((a, b) => a.timeStart.localeCompare(b.timeStart));
      return {
        advisorCode: code,
        advisorName: data.name,
        sucursalId:  data.sucursalId,
        freeSlots:   slots.filter(s => !s.isOccupied).length,
        slots,
      };
    });
  }

  // Lista asesores distintos en cache.
  // Si sucursalIdis se pasa, filtra por esa sucursal.
  // Sin parámetro (o vacío) devuelve todos — útil para la config de técnicos.
  async getAdvisorsForSucursal(sucursalIdis?: string): Promise<{ code: string; name: string; sucursalIdis: string }[]> {
    const today = new Date().toISOString().split('T')[0];
    if (sucursalIdis) {
      const rows: { advisor_code: string; advisor_name: string; sucursal_idis: string }[] = await this.dataSource.query(
        `SELECT DISTINCT advisor_code, advisor_name, sucursal_idis
         FROM dms_advisor_slots
         WHERE sucursal_idis = $1 AND date >= $2
         ORDER BY advisor_name`,
        [sucursalIdis, today],
      );
      return rows.map(r => ({ code: r.advisor_code, name: r.advisor_name, sucursalIdis: r.sucursal_idis }));
    }
    const rows: { advisor_code: string; advisor_name: string; sucursal_idis: string }[] = await this.dataSource.query(
      `SELECT DISTINCT advisor_code, advisor_name, sucursal_idis
       FROM dms_advisor_slots
       WHERE date >= $1
       ORDER BY advisor_name`,
      [today],
    );
    return rows.map(r => ({ code: r.advisor_code, name: r.advisor_name, sucursalIdis: r.sucursal_idis }));
  }

  // ── OT rows materialized sync ────────────────────────────────────────────────

  // Gate: respects the 60s startup delay and the OT_SYNC_INTERVAL_MS cadence.
  // Called from syncAll() after the advisor-slot branch — failure here is fully isolated.
  async maybeRunOtRowsSync(): Promise<void> {
    if (!this.otSyncReady) {
      this.logger.debug('OT rows sync omitido: aún en período de startup delay');
      return;
    }
    if (this.lastOtSyncAt !== null) {
      const elapsed = Date.now() - this.lastOtSyncAt.getTime();
      if (elapsed < OT_SYNC_INTERVAL_MS) {
        this.logger.debug(
          `OT rows sync omitido: solo transcurrieron ${Math.round(elapsed / 1000)}s de ` +
          `${Math.round(OT_SYNC_INTERVAL_MS / 1000)}s requeridos`,
        );
        return;
      }
    }
    try {
      await this.syncOtRows();
    } catch (err: any) {
      this.logger.error(`syncOtRows falló: ${err.message}`, err.stack);
      // Keep existing data intact — just refresh the timestamp so the UI
      // does not show a stale/unavailable warning while DMS is temporarily down.
      try {
        const existing = await this.stateRepo.findOne({ where: { kind: 'ot_rows' } });
        if (existing) {
          await this.stateRepo.update({ kind: 'ot_rows' }, {
            lastSyncAt:   new Date(),
            updatedAt:    new Date(),
            errorMessage: null as unknown as string,
          });
        }
      } catch (_) { /* ignore secondary errors */ }
    }
  }

  // Upserts the full open set + recently-closed OTs from DMS into dms_ot_rows.
  // Uses raw SQL ON CONFLICT for atomic batch upsert (same pattern as advisor-slots).
  async syncOtRows(): Promise<void> {
    if (!process.env.CTT_HOST) {
      this.logger.warn('CTT_HOST no configurado, salteando syncOtRows');
      return;
    }

    const tickStart = new Date();

    // 1. Read last sync state
    const state = await this.stateRepo.findOne({ where: { kind: 'ot_rows' } });
    const lastSync = state?.lastSyncAt ?? null;

    // 2 + 3. Fetch open + recently closed OTs in one connection
    const { openOts, closedOts } = await this.fetchOtsBatch(lastSync);

    // 4. Upsert all rows — deduplicate by nroot (DMS can have duplicate nroot rows)
    const allOts = [...new Map([...openOts, ...closedOts].map(r => [r.nroot, r])).values()];
    if (allOts.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < allOts.length; i += BATCH) {
        await this.dataSource
          .createQueryBuilder()
          .insert()
          .into(DmsOtRow)
          .values(allOts.slice(i, i + BATCH))
          .orUpdate(
            [
              'nrocliente', 'nombrecliente', 'plate', 'modelo',
              'estado_ot', 'estado_taller', 'estado_financiero',
              'asesor', 'taller', 'sucursal_desc',
              'fecha_ingreso', 'hora_ingreso',
              'fecha_compromiso_cliente', 'fecha_cierre_ot', 'fecha_fin_taller',
              'monto', 'idtiposervicio', 'tipo_desc', 'tipo_abrev', 'codcliente', 'empresa', 'synced_at',
            ],
            ['nroot'],
          )
          .execute();
      }
    }

    // 5. Update sync state
    await this.stateRepo.upsert(
      {
        kind:         'ot_rows',
        lastSyncAt:   tickStart,
        openCount:    openOts.length,
        totalSynced:  allOts.length,
        errorMessage: null as unknown as string,
        updatedAt:    new Date(),
      },
      ['kind'],
    );

    this.lastOtSyncAt = tickStart;
    this.logger.log(
      `OK syncOtRows → ${openOts.length} open + ${closedOts.length} closed = ${allOts.length} total`,
    );
  }

  // Opens one MySQL connection, runs open + closed queries, closes connection once
  private async fetchOtsBatch(lastSync: Date | null): Promise<{
    openOts: Partial<DmsOtRow>[];
    closedOts: Partial<DmsOtRow>[];
  }> {
    if (!process.env.CTT_HOST) {
      this.logger.warn('CTT_HOST not configured, skipping MySQL OT fetch');
      return { openOts: [], closedOts: [] };
    }

    let conn: mysql.Connection | null = null;
    try {
      conn = await getMysqlPool();

      const [openRows] = await conn.query<any[]>(
        this.buildMysqlOtQuery('WHERE eo.estado = 1'),
      );

      let closedRows: any[] = [];
      if (lastSync) {
        const since = new Date(lastSync.getTime() - 2 * 60 * 60 * 1000);
        const [rows] = await conn.query<any[]>(
          this.buildMysqlOtQuery('WHERE eo.estado = 0 AND m.fecha_actualizacion >= ?'),
          [since],
        );
        closedRows = rows;
      }

      const now = new Date();
      const mapRow = (r: any): Partial<DmsOtRow> => ({
        nroot:                  Number(r.nroot),
        nrocliente:             String(r.nrocliente ?? '').trim() || null,
        nombrecliente:          String(r.nombrecliente ?? '').trim() || null,
        plate:                  String(r.plate ?? '').trim() || null,
        modelo:                 String(r.modelo ?? '').trim() || null,
        estadoOt:               String(r.estado_ot ?? '').trim() || null,
        estadoTaller:           String(r.estado_taller ?? '').trim() || null,
        estadoFinanciero:       String(r.estado_financiero ?? '').trim() || null,
        asesor:                 String(r.asesor ?? '').trim() || null,
        taller:                 r.taller != null ? Number(r.taller) : null,
        sucursalDesc:           String(r.sucursal_desc ?? '').trim() || null,
        empresa:                String(r.empresa ?? '').trim() || null,
        fechaIngreso:           r.fecha_ingreso ? new Date(r.fecha_ingreso) : null,
        horaIngreso:            r.hora_ingreso ? String(r.hora_ingreso).trim() || null : null,
        fechaCompromisoCliente: r.fecha_compromiso_cliente ? new Date(r.fecha_compromiso_cliente) : null,
        fechaCierreOt:          r.fecha_cierre_ot ? new Date(r.fecha_cierre_ot) : null,
        fechaFinTaller:         r.fecha_fin_taller ? new Date(r.fecha_fin_taller) : null,
        monto:                  r.monto != null ? Number(r.monto) : null,
        idTipoServicio:         r.idtiposervicio != null ? Number(r.idtiposervicio) : null,
        tipoDesc:               String(r.tipo_desc ?? '').trim() || null,
        tipoAbrev:              String(r.tipo_abrev ?? '').trim() || null,
        codcliente:             String(r.codcliente ?? '').trim() || null,
        syncedAt:               now,
      });

      return {
        openOts:   (openRows as any[]).map(mapRow),
        closedOts: (closedRows as any[]).map(mapRow),
      };
    } finally {
      await conn?.end();
    }
  }

  private buildMysqlOtQuery(whereClause: string): string {
    return `
      SELECT
        m.nroot,
        m.nrocliente,
        m.nombrecliente,
        m.chapa                                                    AS plate,
        m.modelo,
        eo.descripcion                                             AS estado_ot,
        eo.descripcion                                             AS estado_taller,
        NULL                                                       AS estado_financiero,
        m.asesor,
        m.taller,
        IFNULL(s.Descripcion, '')                                  AS sucursal_desc,
        CASE s.idempresa
          WHEN 1 THEN 'CONDOR'
          WHEN 6 THEN 'IDICON'
          WHEN 7 THEN 'HALLEY'
          ELSE 'OTRO'
        END                                                        AS empresa,
        DATE(m.fechaingreso)                                       AS fecha_ingreso,
        m.horaingreso                                              AS hora_ingreso,
        m.fecha_compromiso_cliente,
        NULL                                                       AS fecha_cierre_ot,
        m.fecha_fin_taller,
        m.monto,
        m.idtiposervicio,
        IFNULL(ts.descripcion, '')                                  AS tipo_desc,
        IFNULL(ts.abreviatura, '')                                  AS tipo_abrev,
        m.nrocliente                                               AS codcliente
      FROM ot_master m
      LEFT JOIN estados_ot eo ON eo.idestadoot = m.idestado_ot
      LEFT JOIN sucursal s ON CAST(s.db2idfilial AS UNSIGNED) = m.taller
      LEFT JOIN tipo_servicio ts ON ts.idtipo_servicio = m.idtiposervicio
      ${whereClause}
    `;
  }

  private async fetchOtsFromDms(
    opts: { onlyOpen?: boolean; closedSince?: Date },
  ): Promise<Partial<DmsOtRow>[]> {
    if (!process.env.CTT_HOST) return [];
    let conn: mysql.Connection | null = null;
    try {
      conn = await getMysqlPool();
      let whereClause: string;
      const params: any[] = [];
      if (opts.onlyOpen) {
        whereClause = 'WHERE eo.estado = 1';
      } else if (opts.closedSince) {
        whereClause = 'WHERE eo.estado = 0 AND m.fecha_actualizacion >= ?';
        params.push(opts.closedSince);
      } else {
        whereClause = '';
      }
      const [rows] = await conn.query<any[]>(this.buildMysqlOtQuery(whereClause), params);
      const now = new Date();
      return (rows as any[]).map(r => ({
        nroot:                  Number(r.nroot),
        nrocliente:             String(r.nrocliente ?? '').trim() || null,
        nombrecliente:          String(r.nombrecliente ?? '').trim() || null,
        plate:                  String(r.plate ?? '').trim() || null,
        modelo:                 String(r.modelo ?? '').trim() || null,
        estadoOt:               String(r.estado_ot ?? '').trim() || null,
        estadoTaller:           String(r.estado_taller ?? '').trim() || null,
        estadoFinanciero:       null,
        asesor:                 String(r.asesor ?? '').trim() || null,
        taller:                 r.taller != null ? Number(r.taller) : null,
        sucursalDesc:           String(r.sucursal_desc ?? '').trim() || null,
        empresa:                String(r.empresa ?? '').trim() || null,
        fechaIngreso:           r.fecha_ingreso ? new Date(r.fecha_ingreso) : null,
        horaIngreso:            r.hora_ingreso ? String(r.hora_ingreso).trim() || null : null,
        fechaCompromisoCliente: r.fecha_compromiso_cliente ? new Date(r.fecha_compromiso_cliente) : null,
        fechaCierreOt:          null,
        fechaFinTaller:         r.fecha_fin_taller ? new Date(r.fecha_fin_taller) : null,
        monto:                  r.monto != null ? Number(r.monto) : null,
        idTipoServicio:         r.idtiposervicio != null ? Number(r.idtiposervicio) : null,
        tipoDesc:               String(r.tipo_desc ?? '').trim() || null,
        tipoAbrev:              String(r.tipo_abrev ?? '').trim() || null,
        codcliente:             String(r.codcliente ?? '').trim() || null,
        syncedAt:               now,
      }));
    } finally {
      await conn?.end();
    }
  }

  // ── Push agendamiento al DMS ─────────────────────────────────────────────────
  // Fire-and-forget: nunca bloquea la creación del turno en nuestro sistema.
  // Si el DMS no responde o devuelve error, se loguea y se ignora.
  async pushToAgendamiento(payload: {
    title: string;
    start_date: string;
    start_time: string;
    end_time: string;
    IdAsesor: string;
    idSucursal?: string | number | null;
    NombreCliente: string;
    Telefono: string;
    Vehiculo: string;
    Matricula: string;
    Chasis?: string;
    description: string;
    AgendadoPor?: string;
  }): Promise<{ success: boolean; dmsId?: string; error?: string }> {
    const url = process.env.DMS_AGENDAMIENTO_URL;
    if (!url) {
      this.logger.warn('DMS_AGENDAMIENTO_URL no configurada — push omitido');
      return { success: false, error: 'URL no configurada' };
    }
    const t0 = Date.now();
    const now = new Date();
    const fechaCreacion = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...payload,
          end_date:              payload.start_date,
          category:              1,
          IdSucursal:            payload.idSucursal ? Number(payload.idSucursal) : undefined,
          IdEstadoAgendamiento:  1,
          IdAgendamientoTipo:    2,
          recurrence:            'N',
          AgendadoPor:           payload.AgendadoPor ?? 'sistema',
          FechaCreacion:         fechaCreacion,
          UsuarioCreacion:       payload.AgendadoPor ?? 'sistema',
        }),
        signal:  AbortSignal.timeout(8_000),
      });
      const json = await res.json().catch(() => null) as any;
      if (res.ok && json?.success) {
        this.logger.log(`DMS agendamiento OK [${res.status}] ${Date.now() - t0}ms id=${json.id} — ${payload.NombreCliente} ${payload.start_date}`);
        return { success: true, dmsId: String(json.id ?? '') };
      }
      const errMsg = json?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`DMS agendamiento rechazado: ${errMsg}`);
      return { success: false, error: errMsg };
    } catch (err: any) {
      this.logger.warn(`DMS agendamiento falló (${Date.now() - t0}ms): ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
