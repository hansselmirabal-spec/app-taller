import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  OneToMany, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { BodyshopEntry } from './bodyshop-entry.entity';
import { BodyshopPiece } from './bodyshop-piece.entity';
import { BodyshopGrade } from './bodyshop-grade.entity';
import { BodyshopWorkItemProcess } from './bodyshop-work-item-process.entity';

@Entity('bodyshop_work_items')
export class BodyshopWorkItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entry_id', type: 'varchar' })
  entryId: string;

  @ManyToOne(() => BodyshopEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: BodyshopEntry;

  @Column({ name: 'piece_id', type: 'varchar' })
  pieceId: string;

  @ManyToOne(() => BodyshopPiece, { eager: true })
  @JoinColumn({ name: 'piece_id' })
  piece: BodyshopPiece;

  @Column({ name: 'grade_id', type: 'varchar' })
  gradeId: string;

  @ManyToOne(() => BodyshopGrade, { eager: true })
  @JoinColumn({ name: 'grade_id' })
  grade: BodyshopGrade;

  @Column({ type: 'int', default: 0 })
  sequence: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => BodyshopWorkItemProcess, p => p.workItem, { cascade: true, eager: true })
  processes: BodyshopWorkItemProcess[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
