import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('workshops')
export class Workshop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', nullable: true, length: 200 })
  address: string | null;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'varchar', length: 20, default: 'MECHANIC' })
  type: string;

  // Sucursal del DMS Condor que provee las OTs visibles para este taller.
  // Vacío = sin filtro (ve todas las OTs).
  @Column({ name: 'dms_branch', type: 'varchar', length: 100, nullable: true })
  dmsBranch: string | null;

  // Umbrales de alerta para OTs abiertas (en días desde el ingreso al taller).
  // Configurables por taller porque chapería y mecánica tienen tolerancias distintas.
  // Defaults: 30 d atraso, 60 d crítico (los que tenía hardcoded el frontend).
  @Column({ name: 'alert_atraso_days',  type: 'int', default: 30 })
  alertAtrasoDays: number;

  @Column({ name: 'alert_critico_days', type: 'int', default: 60 })
  alertCriticoDays: number;

  @Column({ name: 'config', type: 'jsonb', nullable: true })
  config: object | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
