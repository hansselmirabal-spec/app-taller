import { MigrationInterface, QueryRunner } from 'typeorm';

// dms_ot_rows.chasis en realidad guarda la chapa/patente (m.chapa AS chasis en el
// sync desde controltiempo.ot_master), no el VIN real. El nombre engañoso ya causó
// un bug de producción (vehicle-lookup apuntando a la fuente equivocada). Renombramos
// la columna a plate para que refleje lo que realmente contiene.
export class RenameDmsOtRowsChasisToPlate1752100000000 implements MigrationInterface {
  name = 'RenameDmsOtRowsChasisToPlate1752100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dms_ot_rows RENAME COLUMN chasis TO plate`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dms_ot_rows RENAME COLUMN plate TO chasis`);
  }
}
