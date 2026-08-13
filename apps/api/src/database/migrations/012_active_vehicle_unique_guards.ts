import { MigrationInterface, QueryRunner } from 'typeorm';

// Auditoría pre-producción 2026-08-13 (BE-02/A-4, P0): "no permitir dos
// trabajos activos del mismo vehículo" era un chequeo check-then-act sin
// ningún respaldo a nivel DB — dos creaciones casi simultáneas para la misma
// patente podían pasar ambas. Se agregan índices únicos parciales como última
// línea de defensa detrás del advisory lock agregado en BodyshopService y
// AppointmentsService (create()). Verificado contra QAS antes de escribir
// esta migración: 0 violaciones existentes en ambas tablas.
export class ActiveVehicleUniqueGuards1755200000000 implements MigrationInterface {
  name = 'ActiveVehicleUniqueGuards1755200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX bodyshop_entries_one_active_per_plate
      ON bodyshop_entries (workshop_id, UPPER(plate))
      WHERE status NOT IN ('done', 'cancelled')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX appointments_one_active_per_plate
      ON appointments (UPPER(plate))
      WHERE status NOT IN ('done', 'cancelled')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX appointments_one_active_per_plate`);
    await queryRunner.query(`DROP INDEX bodyshop_entries_one_active_per_plate`);
  }
}
