import { MigrationInterface, QueryRunner } from 'typeorm';

// El Simulador de presupuesto calcula un desglose por pieza (pieza, nivel de
// daño, breakdown de procesos con horas), pero budget_appointments solo tenía
// `processes` (totales agregados por proceso). Ese detalle se descartaba antes
// de llegar al backend. Esta columna lo persiste como dato informativo/de
// trazabilidad, sin tocar `processes` (sigue siendo la fuente de verdad para
// aprobar el presupuesto y crear el bodyshop_entry).
export class BudgetAppointmentsAddPieces1753650000000 implements MigrationInterface {
  name = 'BudgetAppointmentsAddPieces1753650000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE budget_appointments ADD COLUMN pieces jsonb NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE budget_appointments DROP COLUMN pieces`);
  }
}
