import { MigrationInterface, QueryRunner } from 'typeorm';

// Auditoría pre-producción 2026-08-13 (A-2/A-3, P0): tracking_logs.technician_id
// vivía como varchar sin FK y sin ningún guard de concurrencia a nivel DB — un
// técnico podía quedar in_progress en dos vehículos a la vez si dos requests
// llegaban casi simultáneos (ya visto en QA). Se pasa la columna a uuid real
// con FK a technicians, y se agrega un índice único parcial que hace que
// Postgres mismo rechace un segundo in_progress para el mismo técnico — la
// última línea de defensa detrás del advisory lock agregado en
// TrackingService (tracking.service.ts, withTechnicianLock).
export class TrackingLogsTechnicianFkAndLockGuard1755100000000 implements MigrationInterface {
  name = 'TrackingLogsTechnicianFkAndLockGuard1755100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tracking_logs
      ALTER COLUMN technician_id TYPE uuid USING technician_id::uuid
    `);
    await queryRunner.query(`
      ALTER TABLE tracking_logs
      ADD CONSTRAINT fk_tracking_logs_technician
      FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX tracking_logs_one_in_progress_per_technician
      ON tracking_logs (technician_id) WHERE status = 'in_progress'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX tracking_logs_one_in_progress_per_technician`);
    await queryRunner.query(`ALTER TABLE tracking_logs DROP CONSTRAINT fk_tracking_logs_technician`);
    await queryRunner.query(`
      ALTER TABLE tracking_logs
      ALTER COLUMN technician_id TYPE varchar(100) USING technician_id::varchar
    `);
  }
}
