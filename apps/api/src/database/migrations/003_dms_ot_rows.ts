import { MigrationInterface, QueryRunner } from 'typeorm';

export class DmsOtRows1749700000000 implements MigrationInterface {
  name = 'DmsOtRows1749700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Create dms_ot_rows table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dms_ot_rows (
        nroot               INTEGER        NOT NULL,
        nrocliente          VARCHAR(50),
        nombrecliente       VARCHAR(255),
        chasis              VARCHAR(100),
        modelo              VARCHAR(100),
        estado_ot           VARCHAR(50),
        estado_taller       VARCHAR(50),
        estado_financiero   VARCHAR(50),
        asesor              VARCHAR(150),
        taller              INTEGER,
        sucursal_desc       VARCHAR(150),
        fecha_ingreso       DATE,
        hora_ingreso        VARCHAR(10),
        fecha_compromiso_cliente DATE,
        fecha_cierre_ot     DATE,
        fecha_fin_taller    DATE,
        monto               DECIMAL(15,2),
        idtiposervicio      INTEGER,
        tipo_desc           VARCHAR(150),
        tipo_abrev          VARCHAR(20),
        codcliente          VARCHAR(50),
        synced_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT PK_dms_ot_rows PRIMARY KEY (nroot)
      )
    `);

    // Indexes for common filter and sort patterns
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_dms_ot_rows_estado_ot
        ON dms_ot_rows (estado_ot)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_dms_ot_rows_fecha_ingreso
        ON dms_ot_rows (fecha_ingreso)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_dms_ot_rows_asesor
        ON dms_ot_rows (asesor)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_dms_ot_rows_sucursal_desc
        ON dms_ot_rows (sucursal_desc)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_dms_ot_rows_taller
        ON dms_ot_rows (taller)
    `);

    // Create dms_sync_state table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dms_sync_state (
        kind            VARCHAR(50)  NOT NULL,
        last_sync_at    TIMESTAMPTZ,
        open_count      INTEGER      NOT NULL DEFAULT 0,
        total_synced    INTEGER      NOT NULL DEFAULT 0,
        error_message   TEXT,
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT PK_dms_sync_state PRIMARY KEY (kind)
      )
    `);

    // Seed the initial state row so the service always finds it on first run
    await queryRunner.query(`
      INSERT INTO dms_sync_state (kind, last_sync_at, open_count, total_synced)
      VALUES ('ot_rows', NULL, 0, 0)
      ON CONFLICT (kind) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dms_sync_state`);
    await queryRunner.query(`DROP TABLE IF EXISTS dms_ot_rows`);
  }
}
