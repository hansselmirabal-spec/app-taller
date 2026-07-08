import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

// Materialized cache of open-order data from DMS SQL Server.
// Populated by DmsSyncService.syncOtRows() on each cron tick.
// All reads go through DmsOtService (Postgres only — zero DMS hits at query time).
@Entity('dms_ot_rows')
@Index('IDX_dms_ot_rows_estado_ot', ['estadoOt'])
@Index('IDX_dms_ot_rows_fecha_ingreso', ['fechaIngreso'])
@Index('IDX_dms_ot_rows_asesor', ['asesor'])
@Index('IDX_dms_ot_rows_sucursal_desc', ['sucursalDesc'])
@Index('IDX_dms_ot_rows_taller', ['taller'])
export class DmsOtRow {
  // DMS nroot is the primary key. Stored as integer to preserve numeric sort.
  @PrimaryColumn({ type: 'int' })
  nroot: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  nrocliente: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nombrecliente: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  chasis: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelo: string | null;

  // Raw EstadoOT value from DMS. Frontend resolves the display label via ot-estados.ts.
  @Column({ name: 'estado_ot', type: 'varchar', length: 50, nullable: true })
  estadoOt: string | null;

  // Raw EstadoTaller value from DMS.
  @Column({ name: 'estado_taller', type: 'varchar', length: 50, nullable: true })
  estadoTaller: string | null;

  @Column({ name: 'estado_financiero', type: 'varchar', length: 50, nullable: true })
  estadoFinanciero: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  asesor: string | null;

  @Column({ type: 'int', nullable: true })
  taller: number | null;

  // Denormalized at sync time from DimSucursal.Descripcion.
  @Column({ name: 'sucursal_desc', type: 'varchar', length: 150, nullable: true })
  sucursalDesc: string | null;

  @Column({ name: 'fecha_ingreso', type: 'date', nullable: true })
  fechaIngreso: Date | null;

  @Column({ name: 'hora_ingreso', type: 'varchar', length: 10, nullable: true })
  horaIngreso: string | null;

  @Column({ name: 'fecha_compromiso_cliente', type: 'date', nullable: true })
  fechaCompromisoCliente: Date | null;

  @Column({ name: 'fecha_cierre_ot', type: 'date', nullable: true })
  fechaCierreOt: Date | null;

  @Column({ name: 'fecha_fin_taller', type: 'date', nullable: true })
  fechaFinTaller: Date | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  monto: number | null;

  @Column({ name: 'idtiposervicio', type: 'int', nullable: true })
  idTipoServicio: number | null;

  // Denormalized at sync time from DimTipoServicio.descripcion.
  @Column({ name: 'tipo_desc', type: 'varchar', length: 150, nullable: true })
  tipoDesc: string | null;

  // Denormalized at sync time from DimTipoServicio.abreviatura.
  @Column({ name: 'tipo_abrev', type: 'varchar', length: 20, nullable: true })
  tipoAbrev: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  codcliente: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  empresa: string | null;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'NOW()' })
  syncedAt: Date;
}
