import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleDefaultForAndBudgetSingleton1749600000000 implements MigrationInterface {
  name = 'AddRoleDefaultForAndBudgetSingleton1749600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE roles
        ADD COLUMN IF NOT EXISTS default_for VARCHAR(20)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_roles_default_for
        ON roles (default_for)
        WHERE default_for IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE budget_config
        ADD COLUMN IF NOT EXISTS singleton BOOLEAN NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE budget_config
        ADD CONSTRAINT IF NOT EXISTS UQ_budget_config_singleton UNIQUE (singleton)
    `);
    await queryRunner.query(`
      ALTER TABLE budget_config
        ADD CONSTRAINT IF NOT EXISTS CHK_budget_config_singleton CHECK (singleton = true)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE budget_config DROP CONSTRAINT IF EXISTS CHK_budget_config_singleton`);
    await queryRunner.query(`ALTER TABLE budget_config DROP CONSTRAINT IF EXISTS UQ_budget_config_singleton`);
    await queryRunner.query(`ALTER TABLE budget_config DROP COLUMN IF EXISTS singleton`);

    await queryRunner.query(`DROP INDEX IF EXISTS UQ_roles_default_for`);
    await queryRunner.query(`ALTER TABLE roles DROP COLUMN IF EXISTS default_for`);
  }
}
