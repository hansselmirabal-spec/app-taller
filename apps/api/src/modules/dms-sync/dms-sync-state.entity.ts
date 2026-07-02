import { Entity, PrimaryColumn, Column } from 'typeorm';

// Tracks the state of each sync kind (e.g. 'ot_rows').
// Updated by DmsSyncService after each successful tick.
@Entity('dms_sync_state')
export class DmsSyncState {
  // Sync kind identifier, e.g. 'ot_rows'.
  @PrimaryColumn()
  kind: string;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @Column({ name: 'open_count', default: 0 })
  openCount: number;

  @Column({ name: 'total_synced', default: 0 })
  totalSynced: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}
