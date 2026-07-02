import { MigrationInterface, QueryRunner } from 'typeorm';

export class BodyshopPieceCodeUniquePerGroup1751500000000 implements MigrationInterface {
  name = 'BodyshopPieceCodeUniquePerGroup1751500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Drop global unique constraint on code
    await queryRunner.query(`
      ALTER TABLE bodyshop_pieces
      DROP CONSTRAINT IF EXISTS "UQ_65315ade01be9f09be04a89b16c"
    `);
    // Add composite unique constraint: code must be unique within a group, not globally
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bodyshop_pieces_group_code"
      ON bodyshop_pieces (group_id, code)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bodyshop_pieces_group_code"`);
    await queryRunner.query(`
      ALTER TABLE bodyshop_pieces
      ADD CONSTRAINT "UQ_65315ade01be9f09be04a89b16c" UNIQUE (code)
    `);
  }
}
