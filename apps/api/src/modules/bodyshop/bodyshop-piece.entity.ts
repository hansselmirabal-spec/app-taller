import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BodyshopPieceGroup } from './bodyshop-piece-group.entity';

@Entity('bodyshop_pieces')
@Index('UQ_bodyshop_pieces_group_code', ['groupId', 'code'], { unique: true })
export class BodyshopPiece {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'group_id', type: 'varchar' })
  groupId: string;

  @ManyToOne(() => BodyshopPieceGroup, g => g.pieces, { eager: false })
  @JoinColumn({ name: 'group_id' })
  group: BodyshopPieceGroup;

  @Column({ length: 80 })
  name: string;

  @Column({ length: 30 })
  code: string;

  @Column({ type: 'int', default: 0 })
  order: number;

  @Column({ default: true })
  active: boolean;

  // Evita join extra para filtrar qué procesos mostrar en UI.
  @Column({ name: 'applicable_processes', type: 'jsonb', default: '[]' })
  applicableProcesses: string[];
}
