import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

// Cache local de queries pesadas al DMS Condor (MySQL).
// Un cron job en background mantiene este snapshot fresco. Las APIs leen de acá
// en lugar de pegarle al DMS por cada request → response <50 ms y carga constante
// al DMS sin importar la cantidad de usuarios concurrentes.

@Entity('dms_snapshots')
@Index(['kind', 'scope', 'fetchedAt'])
export class DmsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Tipo de payload — permite distintos endpoints sobre la misma tabla.
  // Por ahora: 'ot-seguimiento'. Futuro: 'dashboard', 'dashboard-detail', etc.
  @Column({ type: 'varchar', length: 50 })
  kind: string;

  // Variante de la query: días + soloAbiertas + sucursal + tipo serializados.
  // Ej: 'days=90|abiertas=1' o 'days=365|abiertas=1|sucursal=ESTRELLA'.
  @Column({ type: 'varchar', length: 200 })
  scope: string;

  // Resultado completo de la query, listo para devolver tal cual al cliente.
  @Column({ name: 'payload', type: 'jsonb' })
  data: any;

  // Cuándo se ejecutó la consulta al DMS. El frontend lo usa para mostrar
  // "actualizado hace Xs" y para detectar snapshots viejos por caída del worker.
  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;

  // Si la última sincronización falló, guardamos el error para diagnóstico.
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
