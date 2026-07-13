import { MigrationInterface, QueryRunner } from 'typeorm';

export class DmsOtRowsEmpresa1752000000000 implements MigrationInterface {
  name = 'DmsOtRowsEmpresa1752000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dms_ot_rows ADD COLUMN IF NOT EXISTS empresa VARCHAR(20)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_dms_ot_rows_empresa ON dms_ot_rows (empresa)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_dms_ot_rows_empresa`);
    await queryRunner.query(`ALTER TABLE dms_ot_rows DROP COLUMN IF EXISTS empresa`);
  }
}
