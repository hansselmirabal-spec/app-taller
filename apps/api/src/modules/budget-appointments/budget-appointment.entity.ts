import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export interface BudgetProcess {
  code: string;
  name: string;
  hours: number;
}

@Entity('budget_appointments')
export class BudgetAppointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workshop_id' })
  workshopId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'time_start', type: 'time' })
  timeStart: string;

  @Column({ name: 'time_end', type: 'time' })
  timeEnd: string;

  @Column({ name: 'perito_id' })
  peritoId: string;

  @ManyToOne(() => User, { eager: false, nullable: false })
  @JoinColumn({ name: 'perito_id' })
  perito: User;

  @Column({ name: 'customer_name', length: 100 })
  customerName: string;

  @Column({ length: 50 })
  plate: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';

  @Column({ type: 'jsonb', nullable: true })
  processes: BudgetProcess[] | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'budget_number', type: 'varchar', length: 50, nullable: true })
  budgetNumber: string | null;

  @Column({ name: 'linked_entry_id', type: 'uuid', nullable: true })
  linkedEntryId: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
