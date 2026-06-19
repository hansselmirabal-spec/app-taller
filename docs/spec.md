# spec.md — APP-TALLER MVP
> Fuente de verdad. No modificar sin aprobación humana.
> Stack: Next.js 14 (App Router) · NestJS · PostgreSQL · JWT · Docker

---

## 1. Objetivo del producto

Reemplazar un Excel de gestión de capacidad de taller automotriz con una app web que permita controlar disponibilidad de técnicos y agendar turnos en tiempo real.

---

## 2. Alcance del MVP

**Incluye:**
- Configuración de técnicos y capacidad diaria
- Registro de ausencias (completa, media jornada, feriado)
- Visualización de disponibilidad por día y semana
- Creación, edición y cancelación de turnos
- Validación de solapamiento y límite de horas por técnico
- Autenticación JWT (2 roles)

**No incluye:**
- Gestión de OT ni ciclo de reparación
- Facturación, inventario, repuestos
- App móvil
- Notificaciones
- Reportes / analytics

---

## 3. Usuarios y roles

| Rol | Permisos |
|---|---|
| `admin` | CRUD técnicos, tipos de servicio, feriados, turnos |
| `receptionist` | Crear/ver/cancelar turnos, ver disponibilidad |

---

## 4. Flujos principales

**F1 — Ver disponibilidad:**
Login → seleccionar fecha → ver grilla técnicos × horas → identificar slots libres

**F2 — Crear turno:**
Seleccionar fecha → elegir tipo de servicio → sistema filtra técnicos disponibles → elegir técnico + hora → ingresar datos cliente → confirmar

**F3 — Gestionar ausencias:**
Admin → ir a capacidad → seleccionar técnico + fecha → marcar tipo de ausencia → guardar

**F4 — Configurar taller:**
Admin → settings → gestionar técnicos / tipos de servicio / feriados

---

## 5. Reglas de negocio

- `available_hours = daily_hours - hours_used_by_appointments`
- Ausencia `full`: disponible = 0h
- Ausencia `half`: disponible = `daily_hours / 2`
- Feriado global: todos los técnicos disponible = 0h
- Un turno NO puede solaparse: mismo técnico, misma fecha, rango horario ocupado
- Un turno NO puede exceder horas disponibles del técnico en ese día
- `daily_hours` default = 8h, configurable por técnico
- Estados de turno: `scheduled → in_progress → done | cancelled`
- Solo `admin` puede cambiar estado a `in_progress` o `done`

---

## 6. Modelo de datos MVP

```sql
technicians         (id, name, daily_hours DECIMAL, active BOOL, created_at)
service_types       (id, name, duration_hours DECIMAL, color VARCHAR(7), active BOOL)
working_days        (date PK, is_working_day BOOL, note VARCHAR)
technician_absences (id, technician_id FK, date, type: full|half|holiday, UNIQUE(technician_id, date))
appointments        (id, date, time_start TIME, time_end TIME, technician_id FK,
                     service_type_id FK, customer_name, plate, status, notes, created_by FK, created_at)
users               (id, name, email UNIQUE, password_hash, role: admin|receptionist, active BOOL)
```

**Relaciones:**
- `appointments.technician_id → technicians.id`
- `appointments.service_type_id → service_types.id`
- `appointments.created_by → users.id`
- `technician_absences.technician_id → technicians.id`

---

## 7. Módulos backend MVP

| Módulo | Responsabilidad |
|---|---|
| `auth` | Login, JWT issue/verify, guard global |
| `users` | CRUD usuarios, hash password |
| `technicians` | CRUD técnicos |
| `service-types` | CRUD tipos de servicio |
| `capacity` | Ausencias, feriados, cálculo disponibilidad diaria |
| `appointments` | CRUD turnos, validación solapamiento y capacidad |

---

## 8. Pantallas frontend MVP

| Ruta | Nombre | Rol |
|---|---|---|
| `/login` | Login | todos |
| `/capacity` | Vista de Capacidad | todos |
| `/appointments` | Agenda (grilla semanal) | todos |
| `/appointments/new` | Nuevo Turno | todos |
| `/settings/technicians` | Gestión Técnicos | admin |
| `/settings/service-types` | Tipos de Servicio | admin |
| `/settings/calendar` | Feriados y Calendario | admin |

---

## 9. API mínima necesaria

```
POST   /api/v1/auth/login                      → { access_token }

GET    /api/v1/technicians                     → Technician[]
POST   /api/v1/technicians                     [admin]
PATCH  /api/v1/technicians/:id                 [admin]

GET    /api/v1/service-types                   → ServiceType[]
POST   /api/v1/service-types                   [admin]
PATCH  /api/v1/service-types/:id               [admin]

GET    /api/v1/capacity?date=YYYY-MM-DD        → DailyCapacity[]
GET    /api/v1/capacity?from=...&to=...        → WeekCapacity[]
POST   /api/v1/capacity/absences               [admin]
DELETE /api/v1/capacity/absences/:id           [admin]
POST   /api/v1/capacity/working-days           [admin]
DELETE /api/v1/capacity/working-days/:date     [admin]

GET    /api/v1/appointments?date=YYYY-MM-DD    → Appointment[]
GET    /api/v1/appointments?from=...&to=...    → Appointment[]
POST   /api/v1/appointments                    → Appointment (valida disponibilidad)
PATCH  /api/v1/appointments/:id
PATCH  /api/v1/appointments/:id/status         [admin]
DELETE /api/v1/appointments/:id
```

**Response envelope:**
```json
{ "data": {}, "meta": { "timestamp": "" } }
{ "error": "message", "code": "ERROR_CODE", "status": 400 }
```

---

## 10. Criterios de aceptación

- [ ] Login con JWT funciona para ambos roles
- [ ] Admin puede crear/editar técnicos y tipos de servicio
- [ ] Admin puede registrar ausencias y feriados
- [ ] Vista de capacidad muestra disponibilidad correcta (horas libres/ocupadas)
- [ ] Recepción puede crear turno solo en slots disponibles
- [ ] Sistema rechaza turno que solapa o excede capacidad
- [ ] Turno creado aparece inmediatamente en la grilla
- [ ] Estado de turno actualizable por admin
- [ ] Turno cancelable por ambos roles
- [ ] Feriado bloquea todos los técnicos ese día

---

## 11. Riesgos / fuera de alcance

**Riesgos:**
- Concurrencia: dos recepcionistas agendando el mismo slot simultáneamente → mitigar con transacción DB + unique constraint
- Zonas horarias: asumir timezone fijo del taller → no manejar UTC en MVP

**Fuera de alcance:**
- OT, reparaciones, lifecycle del vehículo
- Integración con DMS o ERP externo
- Facturación
- Multi-sucursal
- Recupero de contraseña (MVP: admin resetea manualmente)

---

## 12. Orden exacto de implementación

```
1. Docker compose (postgres + api + web)
2. Módulo auth (JWT, guard, roles)
3. Módulo users (seed admin inicial)
4. Módulo technicians
5. Módulo service-types
6. Módulo capacity (ausencias + cálculo disponibilidad)
7. Módulo appointments (CRUD + validaciones)
8. Frontend: layout + login
9. Frontend: /capacity (vista semanal)
10. Frontend: /appointments (grilla)
11. Frontend: /appointments/new (formulario)
12. Frontend: /settings (admin)
13. QA: validación end-to-end contra spec
```

---

## A. Checklist de aprobación humana

- [ ] Los 2 roles (admin / receptionist) cubren todos los casos de uso reales
- [ ] El modelo de 6 tablas refleja correctamente el negocio
- [ ] `duration_hours` por tipo de servicio es suficiente (sin configuración por técnico)
- [ ] `time_end` se calcula como `time_start + duration_hours` (no input manual)
- [ ] La grilla de disponibilidad es por día/semana (no mensual en MVP)
- [ ] No se requiere historial de cambios en esta versión
- [ ] El color en `service_types` es suficiente para distinguir visualmente los turnos
- [ ] La autenticación es solo username/password (sin OAuth, sin 2FA)
- [ ] Un técnico puede tener solo UNA ausencia por día
- [ ] Los feriados se marcan globalmente (no por técnico individual)
- [ ] `plate` (patente) es texto libre, sin validación de formato
- [ ] No se envían emails ni notificaciones en MVP

---

## B. Módulos a construir — próxima etapa

**BACK (NestJS) — en este orden:**
1. `auth` — login + JWT guard + roles decorator
2. `users` — entity + seed
3. `technicians` — CRUD
4. `service-types` — CRUD
5. `capacity` — ausencias + working-days + GET disponibilidad
6. `appointments` — CRUD + validación de solapamiento

**FRONT (Next.js) — en paralelo desde módulo 4:**
1. Layout base + providers (React Query, auth context)
2. `/login`
3. `/capacity` — grilla semanal de disponibilidad
4. `/appointments` — agenda visual
5. `/appointments/new` — formulario con validación reactiva
6. `/settings/technicians`, `/settings/service-types`, `/settings/calendar`

---

## C. Supuestos

- Un técnico trabaja en un solo taller (no multi-sucursal)
- Horario de taller: lunes a sábado (domingo siempre no laborable)
- Todos los técnicos tienen el mismo horario base (diferenciable por `daily_hours`)
- Los turnos no se repiten automáticamente (no hay recurrencia)
- No hay integración con calendario externo (Google Calendar, etc.)
- La base de datos corre en un solo servidor PostgreSQL
- El timezone del servidor = timezone del taller (sin conversión)
- Un técnico puede atender solo UN turno a la vez (no paralelo)
- El cliente no tiene acceso a la app (solo uso interno del taller)
- Docker es suficiente para deploy inicial (no Kubernetes en MVP)
