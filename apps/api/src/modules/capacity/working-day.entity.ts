import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('working_days')
export class WorkingDay {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @Column({ name: 'is_working_day', default: false })
  isWorkingDay: boolean;

  @Column({ length: 200, nullable: true })
  note: string;
}
