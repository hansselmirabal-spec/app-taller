# Flujo del Proyecto y Decisiones de Negocio — Taller Automotriz

> Documento de referencia para consultas rápidas ("¿cómo funciona X?", "¿cómo se calculan las horas?").
> Si una respuesta contradice este documento, hay que actualizar el documento — no improvisar una versión distinta cada vez.

---

## 1. Qué hace el sistema

Reemplaza el Excel de gestión del taller. Cubre dos negocios distintos dentro de la misma app:

| Taller | Qué gestiona |
|---|---|
| **Mecánica** | Turnos de mantenimiento/reparación general, agendados por horas de técnico |
| **Chapa y Pintura (bodyshop)** | Vehículos con proceso de reparación en 3 etapas: Chapería → Preparación → Pintura |

Son flujos separados porque su lógica de horas y de agenda es distinta (ver sección 4).

---

## 2. Flujo completo (bodyshop)

```
1. PRESUPUESTO      → se crea una cita/presupuesto para un vehículo dañado (patente, cliente, perito)
2. AGENDA            → se agenda el ingreso real: horas de chapería/prep/pintura, técnico asignado
                        (el sistema simula la agenda ANTES de guardar y calcula fecha estimada de salida)
3. SEGUIMIENTO        → el vehículo entra al taller. Kanban por proceso: Agendado → Chapería → Prep → Pintura → Entregado
                        cada proceso se marca "iniciado" y "completado" en tiempo real
4. RECURSOS           → si un proceso se traba por falta de repuesto, se marca "esperando recurso"
                        y aparece en la cola de /recursos hasta que compras lo libera
5. REPORTES           → una vez que las OTs existen en el DMS (sistema externo de la empresa),
                        se agregan por sucursal y asesor para ver abiertas/vencidas/montos
```

**Regla clave:** no se puede saltar pasos. Sin presupuesto no hay agenda; sin agenda no hay seguimiento.

---

## 3. Multi-sucursal y de dónde salen los datos

- La app conoce sus propios talleres (`Workshop`) — ej. "Taller Chapa y Pintura".
- Pero las OTs "reales" (las que ve el asesor, las de facturación) viven en el **DMS**, un sistema externo de Grupo Cóndor, no en esta app.
- Cada `Workshop` de la app se puede mapear a una sucursal del DMS (`dmsBranch` / `dmsSucursalId`), pero **hoy solo se usa como dato que se reenvía al crear una cita** — la app NO filtra ni agrega datos del DMS por esa relación.
- El módulo de **Reportes** (`/seguimiento/reportes`) sí agrega OTs del DMS agrupadas por el nombre de sucursal que trae el DMS (ej. "CONDOR NORTE - TALLER"), no por el `Workshop` de la app.
- Los datos del DMS se sincronizan a una tabla propia cada ~5-15 minutos (proceso automático en el backend). Si algo se ve "viejo", lo primero a revisar es esa sincronización, no la sucursal en sí.

**Conclusión importante:** presupuesto/agenda y reportes usan la sucursal para cosas distintas — una es metadata de creación, la otra es agregación para analítica. No asumir que comparten lógica.

---

## 4. Cómo se calculan las horas (el punto que más se pregunta)

Hay **tres modelos de horas distintos** en el sistema. Mezclarlos es la fuente más común de confusión.

### 4.1 Horas de capacidad / disponibilidad (¿puedo agendar?)

Responde: "¿tiene el técnico horas libres este día?"

- **Mecánica:** cada técnico tiene `dailyHours` (default 8h). Disponible = `dailyHours - horas ya asignadas ese día`.
- **Bodyshop:** un técnico tiene horas libres **por proceso** (chapería, prep, pintura por separado) — un técnico de chapería no "presta" sus horas a pintura.
- Ausencia completa → 0h disponibles. Media jornada → 50% de `dailyHours`. Feriado → 0h para todo el taller.
- Esto se calcula al momento de agendar, no se guarda en una tabla aparte — siempre se recalcula contra las citas reales.

### 4.2 Horas planificadas vs. horas reales (¿cómo va el trabajo?)

Responde: "¿este vehículo va atrasado?" — es distinto de la disponibilidad.

- Al crear la entrada de bodyshop se cargan `bodyworkHours`, `prepHours`, `paintHours` **estimadas**.
- Cuando el técnico arranca y termina cada proceso en el kanban, el sistema mide **horas reales** (`completado_at - iniciado_at`).
- `desviación = horas reales - horas planificadas`. Si el proceso sigue abierto y ya se pasó del estimado, se marca **atrasado** (semáforo rojo).
- Semáforo: verde (a tiempo o adelantado), naranja (desviación acumulada relevante), rojo (hay un proceso activo que ya superó su estimado).

### 4.3 Horas del turno/cita (¿cuánto dura la visita?)

Responde: "¿de qué hora a qué hora está agendado?" — es un rango horario simple (`timeStart` – `timeEnd`), no tiene relación directa con las horas de reparación de 4.1/4.2. Se usa para no solapar turnos en la agenda.

### Resumen para no confundirse

| Pregunta | Modelo | Dónde vive |
|---|---|---|
| ¿Tengo técnico libre para agendar? | Capacidad/disponibilidad | Capacity module |
| ¿Vamos atrasados con este auto? | Planificado vs. real | Seguimiento (tracking) |
| ¿A qué hora es el turno? | Horario de la cita | Agenda/Presupuesto |

---

## 5. Reglas de negocio fijas

- Un técnico **no** puede tener más de una ausencia por día.
- Feriado bloquea **todo el taller**, no técnicos individuales.
- Un turno no puede solaparse con otro del mismo técnico.
- En bodyshop, cada proceso (chapería/prep/pintura) tiene su propio técnico — pueden coincidir o no.
- El horario del taller es de lunes a sábado; domingo no se agenda.
- Un vehículo bloqueado por falta de repuesto sale del flujo normal de seguimiento y aparece en **Recursos** hasta que se libera manualmente.

---

## 6. Roles

| Rol | Puede |
|---|---|
| `admin_taller` | Todo: crear/editar técnicos, tipos de servicio, ver reportes, gestionar recursos |
| Otros roles (perito, recepción, etc.) | Permisos acotados según pantalla — ver `permissions` del usuario logueado |

---

## 7. Glosario rápido

- **Presupuesto**: cita inicial para un vehículo dañado, antes de que entre a reparar.
- **Agenda / Cita**: reserva concreta con horas de chapería/prep/pintura y técnico.
- **Seguimiento**: kanban en tiempo real del vehículo dentro del taller.
- **Recursos**: cola de vehículos parados por falta de repuesto.
- **Reportes**: analítica agregada de OTs reales del DMS por sucursal/asesor.
- **DMS**: sistema externo de Grupo Cóndor, fuente de verdad de las OTs — la app lo consulta, no lo reemplaza.

---

*Última actualización: sesión de trabajo sobre el módulo de Recursos y Reportes por sucursal. Si el comportamiento real cambia, actualizar este archivo en el mismo PR.*
