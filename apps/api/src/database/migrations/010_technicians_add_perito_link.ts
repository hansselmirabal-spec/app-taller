import { MigrationInterface, QueryRunner } from 'typeorm';

// Permite marcar un Técnico como perito también: cuando isPerito se activa,
// TechniciansService le crea (o reactiva) una cuenta de Usuario con rol
// 'perito' y acceso normal al sistema (mismo flujo que Configuración →
// Usuarios: password temporal + email de bienvenida). user_id queda como
// referencia estable para no duplicar la cuenta en ediciones futuras.
export class TechniciansAddPeritoLink1754400000000 implements MigrationInterface {
  name = 'TechniciansAddPeritoLink1754400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE technicians ADD COLUMN email varchar(150) NULL`);
    await queryRunner.query(`ALTER TABLE technicians ADD COLUMN is_perito boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`
      ALTER TABLE technicians ADD COLUMN user_id uuid NULL
      REFERENCES users(id) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE technicians DROP COLUMN user_id`);
    await queryRunner.query(`ALTER TABLE technicians DROP COLUMN is_perito`);
    await queryRunner.query(`ALTER TABLE technicians DROP COLUMN email`);
  }
}
