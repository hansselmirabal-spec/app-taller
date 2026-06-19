import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('technicians')
export class Technician {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'daily_hours', type: 'decimal', precision: 4, scale: 2, default: 8.0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
  dailyHours: number;

  @Column({ type: 'varchar', nullable: true, length: 50 })
  specialty: string | null;

  @Column({ type: 'varchar', nullable: true, length: 20 })
  box: string | null;

  @Column({ type: 'varchar', nullable: true, length: 100, name: 'workshop_name' })
  workshopName: string | null;

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'monthly_target_hours', type: 'decimal', precision: 6, scale: 2, nullable: true })
  monthlyTargetHours: number | null;

  // CodigoIDIS del asesor DMS asociado a este técnico.
  // Permite filtrar los slots disponibles del DMS al crear un ingreso.
  @Column({ name: 'dms_advisor_code', type: 'varchar', length: 30, nullable: true })
  dmsAdvisorCode: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
