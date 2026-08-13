# 01 — Resumen Ejecutivo — Auditoría Pre-Producción App Taller (Grupo Cóndor)

**Fecha:** 2026-08-13
**Alcance:** consolidación de 9 auditorías de dominio (funcional, backend, frontend, base de datos, seguridad, QA, performance, DevOps, SaaS readiness) + riesgos DMS documentados por separado. Este documento no re-audita nada — sintetiza los 9 informes ya escritos en `docs/audit/02` a `docs/audit/11`.

---

## 1. Decisión: **NO-GO** (hasta cerrar un set acotado de P0)

Tres dominios cerraron en **NO-GO** con hallazgos **P0 reales y reproducibles**: **Seguridad (42/100)**, **DevOps (35/100)** y **Base de Datos (48/100)**. Por regla de consolidación, cualquier dominio NO-GO con un P0 real vuelve el veredicto global **NO-GO** hasta resolver esos puntos — independientemente de que Funcional, Backend, Frontend y Performance hayan cerrado en GO CONDICIONADO (ninguno de esos cuatro tiene P0 fuera de los ya cubiertos abajo).

El sistema **no está roto de fondo**: la base de código de aplicación tiene buen nivel (RBAC consistente, 0 inyección SQL, 375/377 tests pasando, motor de agendamiento de chapería correcto). Los P0 son en su mayoría de **configuración de despliegue** y **endurecimiento puntual de concurrencia/datos**, no de rediseño. Ver `12-REMEDIATION-PLAN.md` para el detalle accionable.

---

## 2. Top 10 riesgos (deduplicados, por severidad e impacto de negocio)

| # | Riesgo | Dominio(s) | Severidad | Por qué importa |
|---|---|---|---|---|
| 1 | **TLS ausente en PROD real** (`docker-compose.portainer.yml`, sin `listen 443`, `COOKIE_SECURE=false`) — el compose con TLS existe en el repo (`docker-compose.prod.yml`) pero nunca se usa | Seguridad + DevOps | **P0** | Credenciales de login y cookie de sesión de cualquier usuario viajan en texto plano; toma de cuenta trivial por sniffing de red |
| 2 | **SMTP no configurado en PROD** (`SMTP_HOST=""`) → passwords temporales y tokens de reset se loguean en texto plano en stdout/stderr de producción; además el alta de peritos no recibe email | Seguridad + DevOps | **P0** | Toma de cuenta para cualquiera con acceso a logs; flujo de alta de perito roto en el ambiente que importa |
| 3 | **PROD 5 migraciones atrasado respecto a QAS, con 0 filas en todas las tablas operativas** e imagen ~3 semanas más vieja | Base de datos | **P0** | Contradice la premisa de "producción activa"; no se puede certificar que el ambiente productivo esté listo para recibir tráfico real con el schema actual |
| 4 | **Backup de PROD nunca ejecutado ni probado (restore=NO VALIDADO)** | DevOps | **P0** | Ante corrupción de datos o error humano, no hay forma de restaurar — pérdida total |
| 5 | **Race condition: un técnico puede quedar `in_progress` en dos vehículos a la vez** — check-then-act sin transacción ni índice único; ya ocurrió una vez en QA (6 vehículos al mismo técnico, ninguno rechazado) | Backend + Base de datos | **P0** | Corrompe horas reales y KPIs de productividad bajo uso concurrente real (varios coordinadores/tablets) |
| 6 | **Race condition: un vehículo puede quedar duplicado con dos trabajos activos** — mismo patrón check-then-act, sin constraint DB | Backend + Base de datos | **P0** | Duplica el vehículo en kanban, asignación de técnicos, reportes y facturación |
| 7 | **`tracking_logs` sin ninguna Foreign Key** (ni a `technicians` ni a su origen polimórfico) | Base de datos | **P0** | Datos huérfanos posibles sin que Postgres lo detecte; toda la integridad referencial depende 100% del código de aplicación |
| 8 | **Tablero Capacidad/Balance (uso diario de coordinadores) muestra totales inconsistentes**: el detalle por técnico no suma al total del proceso, y un técnico desactivado con trabajo activo se vuelve invisible/no reasignable | Funcional | **P0** | Es exactamente el chequeo que motivó esta auditoría — falla con evidencia numérica reproducible en la pantalla que se usa para decidir staffing todos los días |
| 9 | **Catálogo de 5 procesos de chapería redefinido incompleto (solo 3) en 3 ubicaciones activas** (Reportería x2, Agenda Carrocería) | Frontend | **P0** | Pulida y Control Final desaparecen de reportes y agenda — decisiones de capacidad sobre datos incompletos; es el mismo tipo de bug que ya causó un incidente real en este proyecto |
| 10 | **Tres motores de cálculo de "capacidad de chapería" que pueden divergir entre sí** (`simulate()`, `computeDayCapacity()`, `computeSlotsBodyshop()`) | Funcional | **P1** | El pre-chequeo de disponibilidad en Agenda puede contradecir al motor real y al tablero de Capacidad — no corrompe datos, pero erosiona la confianza en la pantalla de disponibilidad |

---

## 3. Bloqueantes de producción (P0 con "Bloquea producción: Sí")

Lista deduplicada de los 9 informes — el mismo hallazgo citado en más de un dominio (TLS, SMTP, race conditions) aparece una sola vez con su evidencia cruzada:

1. **TLS ausente en PROD** — `SEC-01` + `DEVOPS-01`
2. **SMTP no configurado en PROD (passwords en logs + alta de perito rota)** — `SEC-02` + `DEVOPS-03`
3. **PROD desincronizado (5 migraciones atrás, 0 filas operativas)** — `A-1`
4. **Backup de PROD nunca probado** — `DEVOPS-02`
5. **Race condition: técnico en dos procesos simultáneos** — `BE-01` + `A-3`
6. **Race condition: vehículo duplicado con trabajo activo** — `BE-02` + `A-4`
7. **`tracking_logs` sin Foreign Keys** — `A-2`
8. **Tablero Capacidad/Balance con totales inconsistentes** — `ID-02`
9. **Catálogo de procesos de chapería duplicado/incompleto** — `FE-16`

Detalle de responsable/esfuerzo/criterio de aceptación de cada uno en `12-REMEDIATION-PLAN.md`.

---

## 4. Esfuerzo estimado para resolver los bloqueantes

De los 9 P0 deduplicados: 3 son esfuerzo **S** (SMTP, migraciones de PROD, índice único parcial de técnico) y 6 son esfuerzo **M** (TLS, backup+restore, ambas race conditions con su índice DB, FK de `tracking_logs`, tablero de capacidad, catálogo de chapería). Ninguno requiere rediseño arquitectónico.

**Estimado:** ~3 días-persona en ítems S + ~7 ítems M a 2-3 días-persona cada uno ≈ **18-22 días-persona de trabajo secuencial**. Como back, devops/HM, y frontend pueden avanzar en paralelo sobre bloqueantes independientes (TLS/SMTP/backup no dependen de las race conditions ni del catálogo de chapería), un equipo de 2-3 personas trabajando en paralelo puede cerrar el gate P0 completo en **1.5 a 2 semanas calendario**.

---

## 5. Qué puede quedar para después del Go-Live

Todo lo P2/P3 y el GO-CONDICIONADO no bloqueante de los 9 dominios — ver `12-REMEDIATION-PLAN.md` secciones P2/P3 para el detalle completo. Resumen por categoría:

- **Deuda de UX/accesibilidad:** falta de toasts, labels sin `htmlFor`, contraste, foco visible, responsive (decisión pendiente de negocio) — Frontend P2/P3.
- **Deuda de performance no urgente:** N+1 queries en agenda de recursos y kanban, bundle sin code-splitting de `recharts`/PDF — Performance P2/P3.
- **Deuda arquitectónica:** servicios "god object" (`bodyshop.service.ts`, `tracking.service.ts`), acoplamiento cruzado bodyshop↔tracking, archivos frontend de 2000+ líneas — Backend/Frontend P2/P3.
- **Deuda de tooling:** lint de frontend roto (Next 16 eliminó `next lint`), `pnpm lint` raíz con loop de turbo, CI sin job de build — QA P2/P3.
- **Reglas de negocio sin invariante formal:** doble pausa en tracking, guards de estado de origen faltantes, naming `'holiday'` confuso — Funcional P2.
- **Documentación desactualizada:** `docs/flujo-negocio.md` describe 3 etapas de chapería, el código implementa 5 + 4 paralelos — Funcional P2.

---

## 6. Qué falta específicamente para SaaS comercial

Resumen de `10-SAAS-READINESS.md` sección B (score 27/100 — **no bloquea la producción actual con Grupo Cóndor como único tenant**, es evaluación para venta futura multi-cliente):

- **Multi-tenancy real (el gap más grande, ~40% del score):** `Technician`, `Appointment`, `WorkingDay`, `TechnicianAbsence` no tienen columna `workshopId`; `appointments.search()` tiene un `andWhere('1=1')` literal que ignora el filtro de taller; `WorkshopAccessGuard` está **inoperante** (el JWT nunca incluye `allowedWorkshopIds`, por lo que el guard nunca bloquea nada en ningún endpoint donde está aplicado).
- **Aislamiento de usuarios/roles:** `GET /users` sin filtro de taller expone nómina completa cross-tenant; `Role` es 100% global (sin `workshopId`).
- **Compliance/auditoría:** no existe audit trail genérico (quién cambió qué, de qué valor a cuál); hard-deletes sin traza en `users`.
- **Configurabilidad:** horario de taller (`SHOP_OPEN`/`SHOP_CLOSE`), texto "Grupo Cóndor" en 10+ puntos de UI y en emails, catálogo de procesos de chapería con seed global no por taller — todo hardcodeado para un solo cliente.
- **Onboarding:** alta de taller 100% manual (requiere admin del sistema), sin seed automático de catálogos base, sin feature flags para diferenciar planes por cliente.

**Estimado del propio informe:** varias semanas de trabajo arquitectónico, principalmente en el bloque de multi-tenancy y aislamiento de usuarios, antes de poder vender el sistema a un segundo cliente con seguridad razonable.

---

## 7. Estado

| Escenario | ¿Listo hoy? | Condición |
|---|---|---|
| **Demo** | **SÍ** | Ambiente controlado, sin datos sensibles reales en riesgo de exposición de red. |
| **Piloto controlado** | **NO** | Requiere cerrar como mínimo TLS, SMTP y backup/restore (bloqueantes #1, #2, #4) antes de operar con datos reales de clientes. |
| **Producción (hoy)** | **NO** | 9 bloqueantes P0 activos, 3 dominios en NO-GO con evidencia reproducible; además el estado real de PROD (5 migraciones atrás, 0 filas) impide certificar que el ambiente esté listo. |
| **SaaS comercial** | **NO** | Requiere semanas de inversión arquitectónica en multi-tenancy, aislamiento de usuarios/roles y compliance — ver sección 6. |

---

## 8. Score

| Dominio | Score /100 |
|---|---|
| Funcional | 60 |
| Arquitectura | 66 |
| Backend | 62 |
| Frontend | 58 |
| Base de datos | 48 |
| Seguridad | 42 |
| QA | 82 |
| Performance | 60 |
| DevOps | 35 |
| SaaS Readiness | 27 (fuera del score global — evalúa un escenario futuro, no la producción actual) |

**Score global ponderado (excluye SaaS Readiness, que mide un escenario distinto): ≈ 52/100.**

Ponderación aplicada — los dominios NO-GO con P0 real pesan más porque un solo P0 en Seguridad/DevOps/Base de datos puede materializarse en incidente real (toma de cuenta, pérdida de datos) independientemente de qué tan bien esté el resto:

- Seguridad 20% · DevOps 15% · Base de datos 15% · Backend 15% · Funcional 10% · Frontend 10% · QA 5% · Performance 5% · Arquitectura 5%

`0.20×42 + 0.15×35 + 0.15×48 + 0.15×62 + 0.10×60 + 0.10×58 + 0.05×82 + 0.05×60 + 0.05×66 ≈ 52`

Un score global de ~52/100 con tres dominios en NO-GO confirma numéricamente la decisión de la sección 1: **NO-GO hasta cerrar el set acotado de 9 bloqueantes P0**, con un esfuerzo estimado de 1.5-2 semanas calendario en paralelo.
