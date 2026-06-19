import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { BodyshopPiece } from './bodyshop-piece.entity';

@Entity('bodyshop_piece_groups')
export class BodyshopPieceGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 60 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  code: string | null;

  @Column({ type: 'int', default: 0 })
  order: number;

  @OneToMany(() => BodyshopPiece, p => p.group)
  pieces: BodyshopPiece[];
}
