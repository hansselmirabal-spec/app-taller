---
name: capacity-calculator
description: >
  Lógica exacta de cálculo de horas disponibles, cupos y disponibilidad para
  el motor de capacidad del taller. Leer cuando ARCH diseñe el schema de
  CapacitySlot, cuando BACK implemente CapacityService, o cuando QA defina
  casos de prueba para el cálculo de disponibilidad.
---

# Motor de Capacidad — Lógica de Cálculo

## Responsabilidad del módulo

`CapacityModule` (NestJS) es el corazón del sistema.
Todo cálculo de disponibilidad pasa por aquí — nunca se calcula inline en controllers.

## Algoritmo principal

```typescript
// CapacityService.getAvailableHours(technicianId: string, date: Date): number
async getAvailableHours(technicianId, date) {
  // 1. Verificar feriado global
  if (await this.isHoliday(date)) return 0;

  // 2. Verificar ausencia individual
  const absence = await this.getAbsence(technicianId, date);
  if (absence?.type === 'FULL') return 0;

  // 3. Calcular base según ausencia parcial
  const technician = await this.getTechnician(technicianId);
  const baseHours = absence?.type === 'HALF'
    ? technician.dailyHours * 0.5
    : technician.dailyHours;

  // 4. Restar horas ya asignadas
  const usedHours = await this.getUsedHours(technicianId, date);
  return Math.max(0, baseHours - usedHours);
}
```

## Validación de slot antes de asignar

```typescript
// CapacityService.validateSlot(technicianId, date, startTime, requiredHours)
async validateSlot(technicianId, date, startTime, requiredHours) {
  const available = await this.getAvailableHours(technicianId, date);
  if (available < requiredHours) {
    throw new CapacityException('INSUFFICIENT_HOURS', { available, requested: requiredHours });
  }

  const hasOverlap = await this.checkTimeOverlap(technicianId, date, startTime, requiredHours);
  if (hasOverlap) {
    throw new CapacityException('TIME_OVERLAP', { technicianId, date, startTime });
  }

  return true;
}
```

## Consulta de disponibilidad diaria (para UI del calendario)

```typescript
// CapacityService.getDayCapacity(date: Date): TechnicianCapacity[]
// Retorna vista completa del día para todos los técnicos activos
async getDayCapacity(date) {
  const technicians = await this.getActiveTechnicians();
  return Promise.all(technicians.map(async t => ({
    technicianId: t.id,
    name: t.name,
    specialties: t.specialties,
    totalHours: t.dailyHours,
    availableHours: await this.getAvailableHours(t.id, date),
    absenceType: (await this.getAbsence(t.id, date))?.type ?? null,
    appointments: await this.getAppointments(t.id, date)
  })));
}
```

## Cupos disponibles por tipo de servicio

```typescript
// CapacityService.getAvailableSlotsByService(date, serviceTypeId): number
async getAvailableSlotsByService(date, serviceTypeId) {
  const service = await this.getServiceType(serviceTypeId);
  const dayCapacity = await this.getDayCapacity(date);

  return dayCapacity.filter(t =>
    t.specialties.some(s => service.requiredSpecialties.includes(s) || s === 'GENERAL') &&
    t.availableHours >= service.estimatedHours
  ).length;
}
```

## Schema PostgreSQL recomendado

```sql
-- Tabla de slots de capacidad (desnormalizada para performance)
CREATE TABLE capacity_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES technicians(id),
  date DATE NOT NULL,
  total_hours DECIMAL(4,1) NOT NULL,
  used_hours DECIMAL(4,1) NOT NULL DEFAULT 0,
  UNIQUE(technician_id, date)
);

-- Índice crítico para queries de disponibilidad
CREATE INDEX idx_capacity_slots_date ON capacity_slots(date);
CREATE INDEX idx_capacity_slots_tech_date ON capacity_slots(technician_id, date);

-- Trigger: actualizar used_hours al insertar/cancelar appointment
-- (implementar en NestJS con afterInsert/afterUpdate hooks de TypeORM o Prisma middleware)
```

## Estrategia de consistencia

`capacity_slots` es una tabla de cache desnormalizada.
Fuente de verdad: `appointments` + `technician_absences`.

**Actualización:** event-driven dentro del mismo request/transaction:
```
POST /appointments → (validar) → (insertar appointment) → (actualizar capacity_slot) → commit
DELETE /appointments/:id → (eliminar) → (decrementar capacity_slot) → commit
```

No usar cron jobs para recalcular — mantener consistencia transaccional.

## Casos de prueba clave para QA

| Caso | Input | Expected |
|------|-------|----------|
| Técnico sin ausencias, día normal | 8h base, 3h usadas | 5h disponibles |
| Técnico con HALF | 8h base, 0h usadas | 4h disponibles |
| Técnico con FULL | cualquiera | 0h |
| Feriado global | cualquier técnico | 0h |
| Asignar exactamente horas disponibles | available=4, requested=4 | OK |
| Sobrepasar horas | available=2, requested=4 | CapacityException |
| Solapamiento horario | 09:00-11:00 existe, nuevo 10:00-12:00 | CapacityException |
| Técnico part-time (6h) con HALF | 3h base | 3h disponibles |
