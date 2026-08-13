# 12 — Plan de Remediación — App Taller (Grupo Cóndor)

Consolidado de los 9 informes de auditoría (`docs/audit/02` a `docs/audit/11`). Hallazgos duplicados entre informes se fusionan en una sola tarea con referencia cruzada a todos los IDs originales. No se re-audita nada — este plan solo organiza lo ya encontrado en orden de ejecución.

---

## P0 — Antes de producción

Los 9 bloqueantes deduplicados. Ninguno requiere rediseño; todos son cambios acotados reutilizando patrones que ya existen en otras partes del código.

**Actualización 2026-08-13 (post-auditoría, mismo día):** los 4 bloqueantes de código (BE-01/A-3, BE-02/A-4, A-2, ID-02, FE-16 — 5 IDs, 4 tareas) ya se cerraron y están en QAS (PR #50, #51, #52). Quedan pendientes los 4 de infraestructura/decisión de negocio (TLS, SMTP, deriva de PROD, backup/restore) — ver estado marcado en cada fila.

| Tarea | IDs origen | Responsable | Dependencia | Esfuerzo | Riesgo si no se hace | Criterio de aceptación | Estado |
|---|---|---|---|---|---|---|---|
| **Activar TLS real en PROD** | SEC-01, DEVOPS-01 | devops/back | Ninguna | M | Sesión/credenciales interceptables por sniffing de red | `docker-compose.portainer.yml` sirve por HTTPS (reusar `docker-compose.prod.yml` con certbot, o reverse proxy TLS delante), redirect 80→443, `COOKIE_SECURE=true`, header `Strict-Transport-Security` agregado | ⏸ Pendiente — requiere decisión de dominio/certificado |
| **Configurar SMTP real en PROD y fallar explícito si falta** | SEC-02, DEVOPS-03 | devops/back | Ninguna | S | Passwords/tokens de reset en logs de producción; alta de perito sin email | `SMTP_HOST/USER/PASS` reales en secrets de PROD (igual patrón que QAS); `MailService` lanza error explícito en producción si no hay SMTP configurado, en vez de degradar a loguear el secreto (mismo patrón que `resolveCorsOrigins`) | ⏸ Pendiente — requiere credenciales SMTP reales |
| **Resolver deriva de schema/datos en PROD** | A-1 | back/arch/HM | Ninguna (requiere decisión de negocio primero) | S | No se puede certificar que PROD esté listo para tráfico real con el schema actual | Confirmar con el equipo si el contenedor auditado es el PROD real en uso; correr las 4 migraciones pendientes (ahora 007-012); `migrations` en PROD = 12 filas; columnas `email`/`is_perito`/`user_id`/`insurance_company` presentes; `bodyshop_processes` con 5 filas | ⏸ Pendiente — requiere confirmación del usuario sobre si PROD está realmente en uso |
| **Automatizar y probar backup/restore de PROD** | DEVOPS-02 | devops | Ninguna | S (cron) + M (prueba de restore) | Pérdida total de datos ante corrupción o error humano | Backup diario automatizado corriendo (cron o step de CI), con retención definida; restore real ejecutado con éxito en ambiente aislado; RPO/RTO documentados | ⏸ Pendiente |
| **Cerrar race condition: técnico en dos procesos simultáneos** | BE-01, A-3 | back | Ninguna | M (transacción/advisory lock) + S (índice DB) | Corrupción de horas reales y KPIs de productividad bajo uso concurrente real | `startProcess`/`unblockProcess` envueltos en `dataSource.transaction()` con `SELECT ... FOR UPDATE` o advisory lock por `technicianId` (mismo patrón que `dms-sync.service.ts`); `CREATE UNIQUE INDEX ON tracking_logs(technician_id) WHERE status='in_progress'`; dos requests concurrentes al mismo técnico → solo uno succeede | ✅ Resuelto — PR #50 (2026-08-13), en QAS |
| **Cerrar race condition: vehículo duplicado con trabajo activo** | BE-02, A-4 | back | Ninguna | M | Vehículo duplicado en kanban/asignación/reportes/facturación | Chequeo de duplicado dentro de la transacción con `SELECT ... FOR UPDATE`; índice único parcial `(workshop_id, UPPER(plate)) WHERE status NOT IN ('done','cancelled')` en `appointments` y `bodyshop_entries`; dos requests concurrentes con misma patente → solo uno succeede | ✅ Resuelto — PR #51 (2026-08-13), en QAS |
| **Agregar FK a `tracking_logs`** | A-2 | back/arch | Ninguna | M | Datos huérfanos posibles sin detección de Postgres | FK real a `technicians(id)`; documentar explícitamente la limitación de `source_type`/`source_id` polimórfico (no soporta FK directa sin tabla de discriminación) | ✅ Resuelto — PR #50 (2026-08-13), en QAS |
| **Corregir inconsistencia del tablero Capacidad/Balance** | ID-02 | back | Ninguna | M | Coordinadores ven totales que no cuadran en la pantalla de staffing diario; trabajo de técnico desactivado se vuelve invisible | `techHoursMap` reconstruido con la misma lógica de ventanas/cursor que `occupiedByProcess`; bucket explícito "sin técnico asignado" para horas de presupuestos pendientes; impedir desactivar técnico con asignaciones activas (o alerta explícita de reasignación) | ✅ Resuelto (parcial) — PR #51 (2026-08-13), en QAS. Falta: impedir desactivar técnico con asignación activa (queda como fast-follow) |
| **Unificar catálogo de procesos de chapería** | FE-16 | ux/frontend | Ninguna | M | Pulida y Control Final invisibles en Reportería y Agenda Carrocería — decisiones de capacidad sobre datos incompletos | Extraer `lib/bodyshop-processes.ts` con los 5 procesos + labels + colores canónicos; importar en `capacity/bodyshop.tsx`, `reporteria/bodyshop.tsx` (2 lugares) y `appointments/bodyshop.tsx` en vez de redeclarar | ✅ Resuelto — PR #52 (2026-08-13), en QAS. También corrigió que el backend nunca mandaba `entry.processes` al frontend |

---

## P1 — Antes del Go-Live

No bloquean el gate P0, pero deben cerrarse antes de considerar el release completo (ventana recomendada: mismo sprint post-P0 o inmediatamente siguiente).

| Tarea | IDs origen | Responsable | Esfuerzo |
|---|---|---|---|
| Delegar `/capacity/slots` (BODYSHOP) al motor autoritativo (`BodyshopScheduleService.simulate()`) en vez de reimplementar con `computeSlotsBodyshop` | ID-01 | back | M |
| Proteger endpoints mutantes de `budget-appointments` con `PermissionsGuard`/`RequirePermission('presupuesto','edit')` | SEC-03 | back | S |
| Validar `entry.workshopId` vs `user.allowedWorkshopIds` en `updateHours`/`assignTechnician`/`assignProcessTechnician`/`adjustProcessSlot`/`recalculateSchedule`/`releaseTech` de bodyshop | SEC-04 | back | M |
| Agregar `try/catch` + feedback visible en mutaciones de Settings/Talleres | FE-01 | frontend | S |
| Agregar `try/catch` + feedback visible en mutaciones de Settings/Catálogo Chapería | FE-02 | frontend | S |
| Consolidar 20+ declaraciones locales de `STATUS_LABEL`/`PROCESS_*` en un módulo compartido (causa raíz de FE-16) | FE-17 | frontend | L |
| Blindar solapamiento de horarios de turnos con `EXCLUDE USING gist` (`btree_gist`) | A-5 | back | M |
| Agregar test de duplicidad de vehículo activo (bodyshop + appointments) | QA-03 | qa | S |
| Precargar rango completo de disponibilidad en `findAvailableSlots` en vez de hasta ~150 queries secuenciales | PERF-02 | back | M |
| Acotar `getMonthlyReport` por fecha en SQL en vez de filtrar en JS | PERF-03 | back | S |
| Índice compuesto `(date, technician_id)` en `appointments` | PERF-07 | back/arch | S |
| Índice compuesto `(workshop_id, date)` en `bodyshop_entries` | PERF-08 | back/arch | S |
| Probar migraciones desde una base Postgres limpia | DEVOPS-07 | devops | S |
| Reutilizar `findTechnicianConflict` en `assignTechnician`/`assignProcessTechnician` (no solo en `startProcess`) | BE-03 | back | S |
| Alerta automática si el runner self-hosted queda offline | DEVOPS-04 | devops | S |
| Confirmar con negocio si mobile/tablet es requisito (Kanban/Capacidad/Agenda hoy son 100% desktop) | FE-10 | ux/HM | L (si aplica) |

---

## P2 — Post Go-Live controlado

Deuda importante pero no bloqueante — priorizar en el roadmap inmediato posterior al release.

**Funcional/Negocio:**
- Actualizar `docs/flujo-negocio.md` a 5 etapas MOTHER + 4 paralelos (ID-03) — SA — S
- Guards de estado de origen en `startProcess`/`blockProcess`, acumular delta de pausa (ID-04) — back — S
- Renombrar/aclarar el valor de enum `'holiday'` vs. Feriado global (ID-06) — back — S
- Documentar o remover fallback de `suggestExitDate()` (ID-07) — back — S
- Agregar validación de solapamiento de horario de peritos en `budget-appointments` (A-6) — back — S

**Backend/Arquitectura:**
- Parametrizar interpolación de `INTERVAL` en `dms-ot.service.ts` (BE-04) — back — S
- Definir frontera clara bodyshop↔tracking, eliminar acceso cruzado de repos (BE-05) — arch — M
- CHECK constraints para status enums y horas >= 0 (A-8) — back — M
- Índice en `plate` en `appointments`/`bodyshop_entries`/`budget_appointments` (A-7) — back — S

**Frontend:**
- Toast/mensaje visible en rollback de kanban (drag&drop) (FE-03) — frontend — S
- Sistema de notificaciones centralizado (FE-04) — frontend — M
- `isLoading` en listas de Técnicos/Talleres (FE-05, FE-06) — frontend — S
- Componente `<Skeleton />` compartido (FE-07) — frontend — M
- Labels con `htmlFor`, `aria-label` en botones ícono (FE-11, FE-12) — frontend — M/S
- Timeout/`AbortController` + `onError` global de `QueryCache` (FE-15) — frontend — M
- Extraer lógica de negocio de páginas gigantes a hooks/lib (FE-18) — frontend — L

**Performance:**
- Batchear queries de `getWeekCapacity` (mecánica), `getBoard`, `getResourceAgenda`, `calculateHours` (PERF-01, 04, 05, 06) — back — S/M
- Validar rango máximo en `GET /appointments` (PERF-11) — back — S
- Diferir `recharts` y `@react-pdf/renderer` con `next/dynamic` (PERF-12, PERF-13) — frontend — M/S
- `useMemo`/`React.memo` en kanban de seguimiento (PERF-16) — frontend — M

**DevOps:**
- Rollback de imagen no cubre migraciones — documentar patrón expand/contract (DEVOPS-05) — devops — M
- Unificar/limpiar sprawl de archivos `docker-compose*.yml` (DEVOPS-06) — devops — S

**QA:**
- Arreglar lint de `apps/web` (Next 16 eliminó `next lint`) + job `lint-web` en CI (QA-01) — frontend/qa — S
- `roles.guard.spec.ts` (QA-04) — qa — S
- Jobs de build en CI de PR (QA-05) — devops/qa — S

**Seguridad:**
- Confirmar con negocio si `/dms-sync/advisor-slots` debe seguir público (SEC-05) — HM/back — S
- Política de complejidad de contraseñas (SEC-06) — back — S
- `Content-Security-Policy` en frontend (SEC-07) — frontend — S

**DMS (informativo, no bloquea el CORE):**
- Resolver columna real de cierre de OT en el DMS (`fecha_cierre_ot`) (DMS-01) — HM/back — a definir con negocio
- Regla explícita de cuál fuente gana (materializado vs. en vivo) (DMS-02) — arch — S
- Evaluar alertas de fallo de sync (DMS-03) — devops — S

---

## P3 — SaaS comercial (multi-cliente futuro)

No bloquea la producción actual con Grupo Cóndor como único tenant. Resumen de `10-SAAS-READINESS.md` — ver ese informe para el detalle completo de 29 hallazgos (F-01 a F-29).

- **Multi-tenancy real (bloque grande, L):** agregar `workshopId` a `Technician`/`Appointment`/`WorkingDay`/`TechnicianAbsence` (F-01); derivar `workshopId` del JWT en vez de query param en todos los servicios de lectura/escritura (F-02, F-03, F-06); corregir el `andWhere('1=1')` literal en `appointments.service.ts::search()` (F-04); aplicar `WorkshopAccessGuard` a `/capacity/absences` (F-05).
- **Reparar `WorkshopAccessGuard`:** poblar `allowedWorkshopIds` en el JWT payload (F-09) y hacer que el guard lo lea de ahí en vez de query/body (F-08) — hoy el guard nunca bloquea nada.
- **Aislamiento de usuarios/roles:** filtrar `GET /users` por taller (F-11); decidir si `Role` es catálogo global o editable por tenant (F-10, F-12).
- **Compliance:** tabla `audit_log` genérica (F-14); soft-delete + traza de cambios de rol en `users` (F-15); `updatedBy` en registros de precio (F-16).
- **Configurabilidad:** mover `SHOP_OPEN`/`SHOP_CLOSE` a `Workshop` (F-17); quitar "Grupo Cóndor" hardcodeado de 10+ puntos de UI y del email (F-19, F-20); catálogo de procesos de chapería por taller, no global (F-25); alias de especialidad configurable (F-24).
- **Externalización:** crear `.env.example` documentado (F-26).
- **Onboarding:** wizard o playbook de alta de taller con seed automático de catálogos base (F-27, F-28).
- **Feature flags** por cliente vía `Workshop.config` (F-29).
- **Pendiente de auditoría dedicada:** `bodyshop`, `tracking`, `budget-appointments` y `dms-sync` no se auditaron método-por-método para tenant boundary en esta pasada (F-22 y notas de "puntos no evaluados" de `10-SAAS-READINESS.md`) — programar segunda pasada antes de cerrar el tema multi-tenancy.

**Estimado:** varias semanas de trabajo arquitectónico, concentradas en el bloque de multi-tenancy y aislamiento de usuarios, antes de vender el sistema a un segundo cliente.
