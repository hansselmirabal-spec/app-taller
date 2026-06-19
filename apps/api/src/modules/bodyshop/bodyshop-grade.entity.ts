import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('bodyshop_grades')
export class BodyshopGrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 30 })
  name: string;

  @Column({ length: 10, unique: true })
  code: string;

  @Column({ type: 'int' })
  severity: number;
}
