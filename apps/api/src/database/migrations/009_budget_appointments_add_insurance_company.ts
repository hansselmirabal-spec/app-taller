import { MigrationInterface, QueryRunner } from 'typeorm';

// Al agendar una cita de presupuesto (perito o carga directa) el cliente
// suele venir por una aseguradora — campo informativo, no afecta el cálculo
// de horas/capacidad ni la aprobación del presupuesto.
export class BudgetAppointmentsAddInsuranceCompany1754320000000 implements MigrationInterface {
  name = 'BudgetAppointmentsAddInsuranceCompany1754320000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE budget_appointments ADD COLUMN insurance_company varchar(100) NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE budget_appointments DROP COLUMN insurance_company`);
  }
}
