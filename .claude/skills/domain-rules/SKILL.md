---
name: domain-rules
description: >
  Reglas de negocio, entidades, tipos de servicio y flujos operativos del taller
  automotriz. Leer antes de crear casos de uso, diseñar schema, o validar
  cualquier lógica relacionada con técnicos, turnos, ausencias o capacidad.
---

# Dominio — Taller Automotriz

## Entidades core

```
Technician
  id, name, specialty[], daily_hours (default: 8), active

ServiceType
  id, name, estimated_hours, requires_specialty[]

TechnicianAbsence
  id, technician_id, date, type: FULL | HALF | HOLIDAY

Appointment
  id, technician_id, service_type_id, date, start_time, hours, status, vehicle_plate, customer_name

CapacitySlot
  id, technician_id, date, total_hours, used_hours, available_hours (computed)
```

## Tipos de ausencia

| Código | Nombre | Impacto horas |
|--------|--------|---------------|
| X | Ausencia completa | 0h disponibles |
| A | Media jornada | 50% de daily_hours |
| F | Feriado | 0h (todos los técnicos) |

## Tipos de servicio estándar (taller Fuso/Mercedes-Benz)

| Servicio | Horas estimadas | Especialidad requerida |
|----------|----------------|----------------------|
| Mantenimiento preventivo | 2h | General |
| Revisión pre-entrega | 1h | General |
| Diagnóstico eléctrico | 3h | Eléctrico |
| Reparación motor | 6-8h | Motor |
| Servicio garantía | variable | Según caso |
| Colisión leve | 4h | Carrocería |
| Colisión mayor | 8h+ | Carrocería |
| Revisión técnica vehicular | 1.5h | General |

## Reglas de cálculo de capacidad

```
horas_disponibles(tecnico, dia) =
  IF ausencia.tipo == FULL → 0
  IF ausencia.tipo == HALF → daily_hours * 0.5
  IF feriado(dia) → 0
  ELSE → daily_hours - horas_ya_asignadas(tecnico, dia)

cupos_disponibles(tipo_servicio, dia) =
  tecnicos_activos_sin_ausencia(dia)
    .filter(t => t.specialty includes tipo_servicio.requires_specialty)
    .filter(t => horas_disponibles(t, dia) >= tipo_servicio.estimated_hours)
    .length
```

## Reglas de negocio críticas

1. **Un técnico no puede ser asignado si tiene ausencia FULL ese día**
2. **Media jornada (A) permite asignaciones si las horas del servicio ≤ horas_disponibles**
3. **Los feriados bloquean TODO el taller, no solo técnicos individuales**
4. **Un turno no puede solaparse con otro del mismo técnico el mismo día** (validar por start_time + duration)
5. **El horario del taller es de lunes a sábado** — domingos no se agenda
6. **Los cupos se calculan por día, no por semana**
7. **La especialidad del técnico debe coincidir con lo requerido por el tipo de servicio** (o ser "General")

## Flujo de agendamiento

```
1. Coordinador selecciona fecha
2. Sistema muestra técnicos disponibles + horas libres ese día
3. Coordinador selecciona tipo de servicio
4. Sistema filtra técnicos con especialidad requerida Y horas suficientes
5. Coordinador selecciona técnico y hora de inicio
6. Sistema valida (no solapamiento, no ausencia, horas suficientes)
7. Sistema crea appointment y actualiza CapacitySlot
```

## Flujo de gestión de capacidad (vista coordinador)

```
1. Vista de calendario semanal/mensual
2. Por técnico: ver días con X, A, disponibilidad parcial, lleno
3. Poder agregar/editar ausencias individualmente
4. Ver cupos disponibles por día por tipo de servicio
5. Exportar vista a PDF (nice-to-have, no MVP)
```

## Edge cases documentados

- Técnico con múltiples especialidades → puede tomar cualquier servicio de sus especialidades
- Servicio que requiere 2 técnicos → fuera del scope MVP (anotar para v2)
- Cambio de turno ya confirmado → solo permite HM o admin (rol)
- Feriado agregado sobre turnos ya agendados → sistema debe alertar conflictos existentes
- Técnico con daily_hours personalizado (ej: part-time 6h) → respetar su configuración individual
