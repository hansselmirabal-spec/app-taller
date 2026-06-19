import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BodyshopPiece } from './bodyshop-piece.entity';
import { BodyshopProcess } from './bodyshop-process.entity';
import { BodyshopGrade } from './bodyshop-grade.entity';

@Entity('bodyshop_work_matrix')
@Unique(['pieceId', 'processId', 'gradeId', 'workshopId'])
export class BodyshopWorkMatrix {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'piece_id', type: 'varchar' })
  pieceId: string;

  @ManyToOne(() => BodyshopPiece, { eager: false })
  @JoinColumn({ name: 'piece_id' })
  piece: BodyshopPiece;

  @Column({ name: 'process_id', type: 'varchar' })
  processId: string;

  @ManyToOne(() => BodyshopProcess, { eager: false })
  @JoinColumn({ name: 'process_id' })
  process: BodyshopProcess;

  @Column({ name: 'grade_id', type: 'varchar' })
  gradeId: string;

  @ManyToOne(() => BodyshopGrade, { eager: false })
  @JoinColumn({ name: 'grade_id' })
  grade: BodyshopGrade;

  // null = global (aplica a todos los talleres). Con valor = override específico del taller.
  @Column({ name: 'workshop_id', type: 'varchar', nullable: true })
  workshopId: string | null;

  @Column({
    name: 'suggested_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  suggestedHours: number;
}
