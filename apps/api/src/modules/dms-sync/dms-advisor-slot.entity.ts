import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

// Cache local de disponibilidad de asesores del DMS Condor.
// Fuente: tabla `agendamiento` (MySQL, read-only).
// El cron de DmsSyncService la mantiene fresca cada 5 minutos.
// Ventana: hoy → hoy + 20 días. Los días pasados se eliminan en cada sync.
//
// Cada fila representa la disponibilidad de UN asesor en UN slot de 30 min.
// is_occupied = true → el asesor tiene un turno con cliente (estado 1=Agendado, 4=Reagendado).
// is_occupied = false → el slot está libre en la grilla del asesor.

@Entity('dms_advisor_slots')
@Index(['date', 'sucursalIdis', 'categoryId'])
@Unique(['date', 'sucursalIdis', 'categoryId', 'timeStart', 'advisorCode'])
export class DmsAdvisorSlot {
  @PrimaryGeneratedColumn()
  id: number;

  // Fecha del slot. Siempre >= hoy (sync no guarda pasado).
  @Column({ type: 'date' })
  date: string;

  // Sucursal DMS — mapea a Workshop.dmsBranch.
  @Column({ name: 'sucursal_idis', length: 20 })
  sucursalIdis: string;

  // 1 = Recepción, 2 = Entrega
  @Column({ name: 'category_id' })
  categoryId: number;

  // Inicio del slot de 30 min. Formato HH:MM:SS.
  @Column({ name: 'time_start', type: 'time' })
  timeStart: string;

  // Fin del slot de 30 min.
  @Column({ name: 'time_end', type: 'time' })
  timeEnd: string;

  // CodigoIDIS del asesor en DMS.
  @Column({ name: 'advisor_code', length: 30 })
  advisorCode: string;

  // Nombre visible del asesor (NombreAsesor de agendamiento_asesor).
  @Column({ name: 'advisor_name', length: 100 })
  advisorName: string;

  // true si el asesor ya tiene un cliente agendado en este slot.
  @Column({ name: 'is_occupied', default: false })
  isOccupied: boolean;

  // Último sync que actualizó esta fila.
  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;
}
