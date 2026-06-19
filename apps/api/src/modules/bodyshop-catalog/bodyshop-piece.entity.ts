import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BodyshopGroup } from './bodyshop-group.entity';

@Entity('bodyshop_pieces')
export class BodyshopPiece {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 10 })
  code: string;

  @Column()
  label: string;

  @Column({ type: 'varchar', nullable: true })
  groupId: string | null;

  @ManyToOne(() => BodyshopGroup, g => g.pieces, { nullable: true, eager: false })
  @JoinColumn({ name: 'groupId' })
  group: BodyshopGroup | null;
}
