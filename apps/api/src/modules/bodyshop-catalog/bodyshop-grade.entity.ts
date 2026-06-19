import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('bodyshop_work_grades')
export class BodyshopWorkGrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 10 })
  code: string;

  @Column()
  label: string;

  // Factor de afectación: 0.25 / 0.5 / 0.75 / null si no aplica
  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true })
  factor: number | null;
}
