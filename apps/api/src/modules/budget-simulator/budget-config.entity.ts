import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Check } from 'typeorm';

@Entity('budget_config')
@Check('"singleton" = true')
export class BudgetConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: true, unique: true })
  singleton: boolean;

  /** Tarifa única de mano de obra en Gs/h */
  @Column({ name: 'tarifa_mdo', type: 'decimal', precision: 12, scale: 2, default: 144000 })
  tarifaMdo: number;

  @Column({ length: 10, default: 'Gs.' })
  moneda: string;

  @Column({ name: 'iva_incluido', default: false })
  ivaIncluido: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
