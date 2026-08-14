import { MigrationInterface, QueryRunner } from 'typeorm';

// Reportado por el usuario 2026-08-14 con evidencia (Agenda de Presupuestos
// mostrando la misma patente + mismo horario duplicados dos veces): mismo
// patrón que BE-02/A-4 (auditoría pre-producción 2026-08-13), pero en un
// tercer service — BudgetAppointmentsService.create() — que la auditoría
// original no cubrió (solo citó bodyshop.service.ts y appointments.service.ts
// como evidencia). create() no tenía NINGÚN chequeo de duplicado.
// Se verificaron y limpiaron 6 grupos de duplicados preexistentes en QAS
// (0 en PROD) antes de esta migración.
export class BudgetAppointmentsUniqueSlot1755300000000 implements MigrationInterface {
  name = 'BudgetAppointmentsUniqueSlot1755300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX budget_appointments_one_active_per_slot
      ON budget_appointments (workshop_id, date, time_start, UPPER(plate))
      WHERE status NOT IN ('rejected', 'cancelled')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX budget_appointments_one_active_per_slot`);
  }
}
