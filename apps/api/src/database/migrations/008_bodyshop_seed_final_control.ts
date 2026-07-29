import { MigrationInterface, QueryRunner } from 'typeorm';

// Chapería - Pulida + Control Final: el catálogo bodyshop_processes ya tenía
// POLISH (sequence 4) sembrado por BodyshopScheduleService.onApplicationBootstrap
// cuando la tabla estaba vacía, pero FINAL_CONTROL nunca se agregó. Esta migración
// asegura FINAL_CONTROL (sequence 5) en QAS/PROD ya seedeados sin duplicar POLISH
// si ya existe. Idempotente: ON CONFLICT (code) DO NOTHING permite correrla más
// de una vez sin fallar ni duplicar filas.
export class BodyshopSeedFinalControl1753900000000 implements MigrationInterface {
  name = 'BodyshopSeedFinalControl1753900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO bodyshop_processes (name, code, sequence, type, active)
      VALUES
        ('Pulida', 'POLISH', 4, 'MOTHER', true),
        ('Control Final', 'FINAL_CONTROL', 5, 'MOTHER', true)
      ON CONFLICT (code) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Solo borra FINAL_CONTROL: POLISH ya existía antes de esta migración
    // (sembrado por el bootstrap del servicio), no es responsabilidad de este down().
    await queryRunner.query(`DELETE FROM bodyshop_processes WHERE code = 'FINAL_CONTROL'`);
  }
}
