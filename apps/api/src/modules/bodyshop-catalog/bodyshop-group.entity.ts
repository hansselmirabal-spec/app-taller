import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { BodyshopPiece } from './bodyshop-piece.entity';

@Entity('bodyshop_groups')
export class BodyshopGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 10 })
  code: string;

  @Column()
  label: string;

  @OneToMany(() => BodyshopPiece, p => p.group)
  pieces: BodyshopPiece[];
}
