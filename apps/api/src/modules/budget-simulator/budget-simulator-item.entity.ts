import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('budget_simulator_items')
@Index(['pieza', 'tipoDano'])
export class BudgetSimulatorItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  pieza: string;

  @Column({ type: 'int' })
  grupo: number;

  @Column({ length: 60 })
  proceso: string;

  @Column({ name: 'grado_original', type: 'varchar', length: 60, nullable: true })
  gradoOriginal: string | null;

  @Column({ name: 'tipo_dano', length: 40 })
  tipoDano: string;

  @Column({ name: 'nro_trabajo', type: 'int' })
  nroTrabajo: number;

  @Column({ name: 'codigo_posicion', length: 20, unique: true })
  codigoPosicion: string;

  @Column({ name: 'descripcion_final', length: 200 })
  descripcionFinal: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  horas: number;

  @Column({ default: true })
  active: boolean;
}
