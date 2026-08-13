# Auditoría de Preparación SaaS — App Taller (Grupo Cóndor)

**Fecha:** 2026-08-13
**Alcance:** Evaluación de qué falta para comercializar esta aplicación como servicio a otros talleres/clientes. **No bloquea el go-live actual con Grupo Cóndor** — es una evaluación separada, orientada a un escenario futuro multi-cliente.

**Metodología:** Inspección de código (sin modificaciones) sobre `apps/api/src/modules/{capacity,technicians,appointments,bodyshop,tracking,budget-appointments,users,roles,auth,workshops,dms-sync,mail}` y `apps/web/src`. Evidencia citada como `archivo:línea`.

**Cobertura de esta pasada:** Se cubrieron en profundidad `capacity`, `technicians`, `appointments`, `users`, `roles`, `auth`, configuración hardcodeada, externalización de config, onboarding y feature flags. **`bodyshop`, `tracking`, `budget-appointments` y `dms-sync` no se auditaron método por método en esta pasada** (el fork dedicado a esos módulos no devolvió resultado) — se incluyen únicamente los hallazgos parciales que surgieron como evidencia colateral en otros forks. Estos puntos quedan marcados explícitamente como **"no evaluado en esta pasada"** y deberían repetirse en una siguiente iteración antes de cerrar el tema multi-tenancy.

---

## A) Bloqueantes para producción actual

Ninguno de los hallazgos de esta auditoría bloquea la producción actual con Grupo Cóndor. Hoy existe un solo tenant en el sistema, por lo que la ausencia de aislamiento efectivo por `workshopId` no es explotable en la práctica (no hay un segundo taller cuyos datos puedan filtrarse). Esta sección se deja vacía a propósito — todos los hallazgos caen en la sección B.

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod actual | Necesario SaaS |
|---|---|---|---|---|---|---|---|---|---|
| — | — | Sin hallazgos que bloqueen producción actual | — | — | — | — | — | — | — |

---

## B) Necesario antes de comercializar como SaaS

### B.1 — Multi-tenancy real (falta de tenant boundary a nivel de esquema)

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod actual | Necesario SaaS |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | technicians/appointments/capacity | Las entidades `Technician`, `Appointment`, `WorkingDay` y `TechnicianAbsence` **no tienen columna `workshopId`**. `Technician` solo tiene `workshop_name` (varchar libre, sin FK). | `apps/api/src/modules/technicians/technician.entity.ts:21` | Es imposible filtrar de forma confiable por taller aunque el código quisiera — el boundary de tenant no existe a nivel de esquema para técnicos, turnos, ausencias y días laborales. | P0 | Agregar columna `workshop_id` (FK, NOT NULL) a las 4 entidades; migrar datos existentes asignándolos al workshop de Cóndor. | L | No | Sí |
| F-02 | technicians | `findAll`/`findAllIncludingInactive` filtran por `workshopName` de forma **opcional** — si no se pasa, devuelve técnicos de todos los talleres. `findOne(id)` no aplica ningún filtro de taller. | `apps/api/src/modules/technicians/technicians.service.ts:38-54` | Con 2+ talleres, cualquier ID de técnico de cualquier taller sería accesible y los listados sin parámetro expondrían nómina completa cruzada. | P0 | Derivar `workshopId` obligatoriamente del usuario autenticado (no de query param) y aplicarlo en todos los métodos de lectura/escritura. | M | No | Sí |
| F-03 | appointments | `reschedule`, `update`, `updateStatus`, `delete` hacen `findOne({ where: { id } })` sin ningún chequeo de taller; la única protección es `createdBy === user.id` o rol admin. | `apps/api/src/modules/appointments/appointments.service.ts:230-286` (líneas 233, 259, 281) | Un usuario admin (o el creador del turno) de un taller podría operar turnos de otro taller sin restricción de tenant. | P0 | Agregar filtro `workshopId` derivado del JWT en el `where` de las 4 operaciones. | M | No | Sí |
| F-04 | appointments | `search()` incluye un no-op literal `apptQb.andWhere('1=1')` en el branch de appointments, mientras que el branch de bodyshop en la misma función sí filtra por `workshopId`. Comentario explícito en el código reconoce que "appointments no filtra por workshopId directo". | `apps/api/src/modules/appointments/appointments.service.ts:91-94` | Bug real (no solo gap de diseño): la búsqueda de turnos ignora el taller solicitado y devuelve resultados de todos los talleres. | P0 | Reemplazar el no-op por `andWhere('appt.workshopId = :workshopId', { workshopId })` una vez exista la columna (ver F-01). | S (una vez resuelto F-01) | No | Sí |
| F-05 | capacity | `findAbsences`, `createAbsence`, `deleteAbsence` no tienen (ni pueden tener) filtro por `workshopId` porque `TechnicianAbsence` carece de la columna. Los endpoints `/capacity/absences` (GET/POST/DELETE) tampoco tienen `WorkshopAccessGuard`, a diferencia de `/capacity` y `/capacity/slots` que sí lo tienen. | `apps/api/src/modules/capacity/capacity.service.ts:189-207`; `apps/api/src/modules/capacity/capacity.controller.ts:57,88,110-131` | Gestión de ausencias sin ningún aislamiento por taller. | P0 | Igual que F-01 + aplicar el guard de forma consistente en todos los endpoints del controller. | M | No | Sí |
| F-06 | technicians/appointments (controllers) | `technicians.controller.ts` y `appointments.controller.ts` no importan ni usan `WorkshopAccessGuard` en absoluto, a diferencia de bodyshop/tracking/capacity que sí lo aplican (parcialmente). | Ausencia confirmada por búsqueda en ambos controllers | Inconsistencia de protección entre módulos — dos de los módulos más sensibles (turnos y técnicos) quedan sin ninguna capa de defensa de tenant, ni siquiera la parcialmente rota (ver F-08). | P0 | Aplicar el guard (una vez arreglado, ver F-08) de forma uniforme a todos los controllers que expongan datos por taller. | S | No | Sí |
| F-07 | capacity (contraste positivo) | `computeSlotsBodyshop` sí filtra correctamente `BodyshopEntry` por `workshopId`, y el branch de bodyshop en `appointments.service.ts:93` también filtra bien. | `apps/api/src/modules/capacity/capacity.service.ts:411-418` | Confirma que el patrón correcto ya existe en el código — es cuestión de generalizarlo, no de inventarlo. | — (informativo) | — | — | No | Sí |
| F-08 | auth / guards | `WorkshopAccessGuard` está **inoperante**: lee `workshopId` de `request.query`/`request.body` en vez de derivarlo del JWT, y si el parámetro se omite retorna `true` sin bloquear. Además, el JWT nunca incluye `allowedWorkshopIds` (ver B.2/F-09), por lo que la condición `if (user.allowedWorkshopIds === null \|\| undefined) return true` es **siempre verdadera** — el guard nunca bloquea nada, en ningún endpoint donde está aplicado (`tracking.controller.ts:54`, `capacity.controller.ts:57,88`, `bodyshop.controller.ts:27,33,134,149`). | `apps/api/src/common/guards/workshop-access.guard.ts:1-27` (línea 11, 16-19) | Bug de autorización real: la protección existe en apariencia (aplicada en 4 controllers) pero no protege nada hoy. No explotable con un solo tenant, pero es deuda crítica antes de un segundo cliente. | P1 | Derivar `workshopId` del JWT del usuario autenticado (nunca de query/body sin validar), y poblar `allowedWorkshopIds` en el JWT payload (ver F-09). Agregar test de regresión que verifique bloqueo real. | M | No | Sí |

### B.2 — Aislamiento de usuarios y roles

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod actual | Necesario SaaS |
|---|---|---|---|---|---|---|---|---|---|
| F-09 | users/auth | `User.allowedWorkshopIds` (jsonb, nullable, default `null`) existe como mecanismo de scoping, pero el JWT payload (`auth.service.ts:38` → `{sub, email, role, permissions}`) y `JwtStrategy.validate()` (`jwt.strategy.ts:30-37` → `{id, email, role, permissions}`) **nunca lo incluyen**. El campo se popula en `auth.service.ts:52` pero no viaja al request context. | `apps/api/src/modules/users/user.entity.ts:28-29`; `apps/api/src/modules/auth/auth.service.ts:38,52`; `apps/api/src/modules/auth/jwt.strategy.ts:30-37` | Causa raíz de F-08: el guard no tiene de dónde leer el scoping real del usuario. | P1 | Incluir `allowedWorkshopIds` en el JWT payload y en `validate()`. | S | No | Sí |
| F-10 | roles | `Role` es una entidad 100% global: sin `workshopId`, con `name` `unique` a nivel de tabla completa. | `apps/api/src/modules/roles/role.entity.ts:10-29` (unique en línea 15) | Con multi-tenant real, dos talleres no podrían tener un rol propio con el mismo nombre (ej. "Perito") sin colisionar; editar un rol compartido afectaría a todos los tenants que lo usan. | P2 | Decidir explícitamente: ¿roles globales de catálogo (aceptable) vs. roles editables por tenant (requiere `workshopId` + unique compuesto)? Documentar la decisión. | M | No | Sí |
| F-11 | users | `GET /users`, permitido a roles `admin` y `admin_taller`, ejecuta `findAll()` sin ningún filtro por taller — devuelve todos los usuarios de todos los talleres, incluyendo emails. | `apps/api/src/modules/users/users.controller.ts:12-16`; `apps/api/src/modules/users/users.service.ts:60-63` | Un `admin_taller` de un tenant vería la nómina completa (con emails) de otro tenant. Fuga real de datos si hubiera 2+ clientes hoy. | P2 | Filtrar por `workshopId` del usuario autenticado cuando el rol no sea super-admin global. | S | No | Sí |
| F-12 | roles | `findAll()` de roles tampoco filtra, pero es coherente con que `Role` es global por diseño (ver F-10), no un bug aislado. | `apps/api/src/modules/roles/roles.controller.ts:13-16` | Bajo, condicionado a la decisión de diseño de F-10. | P3 | Resolver junto con F-10. | S | No | Sí |
| F-13 | **Conclusión aislamiento** | Con Cóndor como único tenant no hay fuga real hoy. La infraestructura de aislamiento (`allowedWorkshopIds` + `WorkshopAccessGuard`) está construida a medias y actualmente no funcional — debe resolverse **antes** de dar de alta un segundo cliente, no después. | Síntesis de F-01 a F-12 | — | P1 (como bloque) | Tratar F-01, F-08, F-09 como un solo épico de "tenant boundary" antes de cualquier onboarding real. | L | No | Sí |

### B.3 — Auditoría de acciones críticas (compliance)

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod actual | Necesario SaaS |
|---|---|---|---|---|---|---|---|---|---|
| F-14 | (transversal) | No existe una tabla/mecanismo de auditoría de seguridad genérico. El único log encontrado (`tracking-log.entity.ts`, tabla `tracking_logs`) es un log **operativo** de progreso de procesos de taller (estado, técnico, horas), no un audit trail de "quién cambió qué campo, de qué valor a cuál, cuándo". | Búsqueda de `Audit\|Log\|History\|Activity` en `apps/api/src/modules/**` | Sin auditoría, no se puede responder "¿quién cambió este precio / borró este registro / cambió este rol?" — típicamente exigido por contrato en clientes B2B/SaaS. | P2 | Introducir tabla `audit_log` genérica (actor, acción, entidad, entityId, valores antes/después, timestamp, workshopId) e interceptor que la pueble en operaciones sensibles. | M | No | Sí |
| F-15 | users | Cambios de rol de usuario (`update()`) no dejan rastro de quién lo cambió ni el valor anterior. Eliminaciones son hard-delete sin traza (`remove()` → `repo.delete(id)`, el registro desaparece sin historial). | `apps/api/src/modules/users/users.service.ts:86-99` (update), `101-105` (remove) | Pérdida irrecuperable de historial en dos de las acciones más sensibles del sistema. | P2 | Soft-delete + registro en audit log (F-14) antes de borrar; registrar valor anterior de `role` en cada `update`. | S | No | Sí |
| F-16 | budget-appointments/bodyshop/appointments/operational-block | Existe atribución parcial de autoría en creación (`createdBy` en `budget-appointment.entity.ts:85`, `operational-block.entity.ts:29`, `appointment.entity.ts:59`, `bodyshop.service.ts:252`; `adjustedBy` puntual en `bodyshop.service.ts:401`), pero no hay `updatedBy` ni histórico de valores para cambios de precio posteriores a la creación. | Archivos citados arriba | Se sabe quién creó un registro de precio, no quién lo modificó después — insuficiente para trazabilidad de compliance. | P2 | Extender el patrón `createdBy` con `updatedBy`/`updatedAt` y, para campos de precio, registrar el cambio en audit log (F-14). | S/M | No | Sí |

### B.4 — Configuración hardcodeada específica de Grupo Cóndor

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod actual | Necesario SaaS |
|---|---|---|---|---|---|---|---|---|---|
| F-17 | bodyshop | `SHOP_OPEN = '08:00'`, `SHOP_CLOSE = '18:00'` son constantes de módulo (ya conocido por el equipo), usadas en 6 puntos del mismo archivo. Sin columna en `Workshop` para este valor — es fijo para toda la instancia, no configurable por taller. | `apps/api/src/modules/bodyshop/bodyshop-schedule.service.ts:12-13` (uso en líneas 88, 185, 196, 204, 231, 352) | Un cliente con horario distinto de taller requeriría cambiar código y redeployar. | P2 | Mover a columna en `Workshop` (u `config: jsonb`, ver F-24) y leer desde ahí. | S/M | No | Sí |
| F-18 | capacity/bodyshop (contraste positivo) | Días laborables y feriados **no** están hardcodeados de forma problemática: se usa `isSunday` (cálculo genérico) + `workingDay?.isWorkingDay` (tabla configurable) + `cfg.includeSaturdays` (config por taller). | `apps/api/src/modules/capacity/capacity.service.ts:450` y uso de `WorkingDay` | Este patrón ya es multi-tenant-friendly — sirve de modelo para resolver F-17. | — (informativo) | — | — | No | Sí |
| F-19 | frontend (UI) | Texto "Condor"/"DMS Condor"/"ID Condor" hardcodeado en más de 10 puntos de UI visible al usuario, sin venir de configuración del taller: badge y texto en `appointments/new/page.tsx:1740,1788`; modal `booking-confirm-modal.tsx:319,345,351,356`; página completa `documentacion/page.tsx:90,92,156`; labels en `seguimiento/reportes/_components/dashboard.tsx:675,959`, `seguimiento/page.tsx:1455,1600`, `ot-detail-panel.tsx:335`. | Archivos y líneas citados arriba | Impide reutilizar el módulo de tracking/DMS para otro cliente sin editar y redeployar el frontend. | P2 | Reemplazar por un valor derivado de `Workshop.name` o de una etiqueta de "sistema DMS integrado" configurable. | M | No | Sí |
| F-20 | mail | El HTML de notificaciones por email hardcodea `"Grupo Cóndor"` como remitente/firma. | `apps/api/src/modules/mail/mail.service.ts:31` | Emails a clientes de otro taller mostrarían la firma de Cóndor. | P2 | Parametrizar por `Workshop.name` (o config de branding). | S | No | Sí |
| F-21 | dms-sync (contraste positivo) | No hay catálogo hardcodeado de sucursales: `dms-ot.service.ts` y `dms-sync.controller.ts` tratan `sucursal` como parámetro dinámico consultado contra la DB del DMS, no como enum fijo. | `apps/api/src/modules/dms-sync/*` | Buen diseño, no es un hallazgo bloqueante. | — (informativo) | — | — | No | Sí |
| F-22 | dms-sync | **No evaluado en esta pasada** a nivel de detalle de queries — se detectó de forma incidental que todo el módulo asume la existencia de una vista SQL Server externa `v_maestro_ot_condor`, es decir una integración 1:1 con el DMS de Cóndor, no reusable para otro cliente sin un adaptador nuevo. Requiere una pasada dedicada de auditoría (incluyendo tenant boundary de bodyshop/tracking/budget-appointments, que tampoco se completó en esta pasada). | Mención incidental, sin línea exacta verificada en esta pasada | Riesgo arquitectónico grande para reuso multi-cliente del módulo DMS. | P2 (a confirmar con auditoría dedicada) | Programar una auditoría de seguimiento específica para `bodyshop`, `tracking`, `budget-appointments` y `dms-sync` (query-por-query, igual que se hizo para capacity/technicians/appointments). | — | No | Sí |
| F-23 | service-types (contraste positivo) | Los tipos de servicio sí son configurables en DB: `ServiceType` tiene columna `workshop_id` nullable → puede ser específico por taller o global, con seed inicial, no enum de código. | `apps/api/src/modules/service-types/service-type.entity.ts:20-21` | Buen patrón de diseño ya existente. | — (informativo) | — | — | No | Sí |
| F-24 | bodyshop | Mapeo de alias de especialidad (`CHAPA`, `CHAPERO`, `PREPARACION`, `PREPARADOR`, `PINTOR`, etc. → `BODYWORK`/`PREP`/`PAINT`) es un `const` en código, no una tabla en DB. Es genérico para el dominio de chapa y pintura (no específico de Cóndor), pero requiere tocar código y redeployar para nomenclatura distinta. | `apps/api/src/modules/bodyshop/bodyshop-schedule.service.ts:17-19` | Rigidez menor para clientes con nomenclatura de especialidades distinta. | P2 | Mover a tabla de alias configurable por taller. | S/M | No | Sí |
| F-25 | bodyshop | El catálogo de procesos de chapería (`seedDefaults()`) es **global para toda la instancia**: verifica `processRepo.count()` sin filtrar por `workshopId`, aunque el endpoint que lo dispara sí recibe un `workshopId` (ignorado dentro de `seedDefaults`). Dos talleres no podrían tener catálogos de procesos de chapería distintos. | `apps/api/src/modules/bodyshop/bodyshop-catalog.service.ts:226-239` (count global en línea 227); `apps/api/src/modules/bodyshop/bodyshop-catalog.controller.ts:117` | Bloquea personalización de catálogo de chapería por cliente. | P2 | Filtrar `seedDefaults` por `workshopId` y ejecutar el seed automáticamente al crear un workshop nuevo (ver F-28). | M | No | Sí |

### B.5 — Externalización de configuración

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod actual | Necesario SaaS |
|---|---|---|---|---|---|---|---|---|---|
| F-26 | (transversal) | No existe `.env.example` ni `.env.sample` en ningún lado del repo (raíz, `apps/api`, `apps/web`) — confirmado por búsqueda de archivos, cero resultados. Se usan ~52 referencias a `process.env.*` en `apps/api/src` (DB, JWT, CORS, credenciales DMS en `dms-sync.service.ts:12-16,41-45,51` y `bodyshop/dms-agendamiento.service.ts:40,45-49`), ninguna documentada centralizadamente. | Búsqueda de archivos `.env.example`; grep de `process.env` | Onboarding de un nuevo entorno/cliente requiere leer código fuente para saber qué variables configurar — riesgo de misconfiguración. La externalización en sí (uso de env vars para secretos) está bien hecha; falta el artefacto de documentación. | P2 | Crear `.env.example` con todas las variables usadas y su propósito. | S | No | Sí |

### B.6 — Onboarding de taller/cliente nuevo

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod actual | Necesario SaaS |
|---|---|---|---|---|---|---|---|---|---|
| F-27 | workshops | `POST /workshops` existe pero está protegido con rol `admin` — no es autoservicio, requiere que un admin del sistema llame al endpoint manualmente (Postman/panel admin). No hay flujo de signup público. | `apps/api/src/modules/workshops/workshops.controller.ts:20-23` | Cada alta de cliente requiere intervención manual de alguien con acceso admin. | P1 | Si el modelo comercial es self-service, construir un wizard de alta; si es onboarding asistido (más común en B2B), documentar el proceso manual como parte del playbook comercial. | M/L | No | Sí |
| F-28 | workshops | `create()` es un insert simple: no dispara ningún seed automático de datos relacionados (técnicos, tipos de servicio, especialidades, horarios). El seed de catálogo de chapería existente es global, no se dispara para un taller nuevo (ver F-25). | `apps/api/src/modules/workshops/workshops.service.ts:42-44` | Un taller nuevo queda vacío de configuración operativa — requiere carga manual completa antes de poder usarse. | P1 | Definir un flujo de "aprovisionamiento" que, al crear un workshop, siembre catálogos base (tipos de servicio, especialidades, horarios default) parametrizables. | M | No | Sí |

### B.7 — Feature flags por cliente

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod actual | Necesario SaaS |
|---|---|---|---|---|---|---|---|---|---|
| F-29 | (transversal) | No existe ningún mecanismo de feature flags. Búsqueda de `feature.?flag\|FEATURE_\|modulesEnabled\|isEnabled` en `apps/api/src/modules` no arroja resultados relevantes. `Workshop.config` (columna `jsonb`) existe pero ningún código la lee para habilitar/deshabilitar módulos hoy. | `apps/api/src/modules/workshops/workshop.entity.ts:34`; búsqueda de flags sin resultados | Todo taller ve todos los módulos (ej. Chapería) habilitados; no se puede vender un plan sin un módulo sin tocar código/rutas. | P1 | Reutilizar `Workshop.config` (o una tabla `workshop_features`) con lectura real en guards/routing de módulos opcionales (empezar por Chapería, que es el módulo más claramente "opcional" para un taller sin ese servicio). | M | No | Sí |

---

## Resumen de hallazgos por severidad

| Severidad | Cantidad | Naturaleza predominante |
|---|---|---|
| P0 | 6 (F-01 a F-06) | Falta de tenant boundary a nivel de esquema en capacity/technicians/appointments |
| P1 | 5 (F-08, F-09, F-13, F-27, F-28, F-29) | Guard de autorización inoperante, aislamiento de usuarios/roles incompleto, onboarding manual, sin feature flags |
| P2 | 13 | Hardcodeo Cóndor-específico, auditoría de acciones, externalización de config |
| P3 | 1 | Roles globales por diseño (a decidir) |

**Nota importante:** ninguno de estos hallazgos es P0/P1 *para la producción actual* — todos aplican al escenario futuro de comercializar el sistema a múltiples clientes. Con un solo tenant (Cóndor) en producción, no hay fuga de datos real hoy.

---

## Puntos no evaluados en esta pasada

- **`bodyshop`, `tracking`, `budget-appointments`**: no se completó la auditoría método-por-método de filtrado por `workshopId` en sus services/repositories (el fork dedicado a estos módulos no devolvió resultado). Evidencia parcial disponible por colateral: `BodyshopEntry` sí tiene columna `workshop_id` y se filtra correctamente en `computeSlotsBodyshop` (F-07); `bodyshop.controller.ts` tiene `WorkshopAccessGuard` aplicado en 4 endpoints, pero ese guard está roto (F-08) por lo que la protección real es indeterminada sin la auditoría completa.
- **`dms-sync`**: solo se tocó tangencialmente (dependencia de la vista `v_maestro_ot_condor`, F-22); falta revisar si los datos sincronizados tienen concepto de tenant o asumen un único taller físico por diseño.
- **Especialidades (`specialties/`)**: no se inspeccionó en detalle línea por línea (se infirió el patrón por analogía con `service-types`, que sí tiene `workshop_id`).

Se recomienda una segunda pasada de auditoría enfocada exclusivamente en estos tres puntos antes de considerar cerrado el análisis de multi-tenancy.

---

## Score de SaaS Readiness: **27 / 100**

**Justificación:**

- **Aislamiento multi-tenant (peso alto, ~40% del score): bajo.** El concepto de `Workshop` existe pero no es un tenant boundary aplicado consistentemente — faltan columnas `workshopId` en entidades centrales (F-01), hay queries con filtro opcional u omitido (F-02, F-03), un bug de no-op real (F-04), y el único guard de autorización dedicado a esto está roto de punta a punta (F-08, F-09). Los módulos de bodyshop/tracking/budget-appointments quedan sin verificar (posible riesgo oculto adicional).
- **Aislamiento de usuarios/roles (~15%): medio-bajo.** El campo de scoping existe (`allowedWorkshopIds`) pero no está conectado al flujo de auth; roles son globales por diseño sin decisión documentada.
- **Configurabilidad/hardcodeo (~20%): medio.** Buenos patrones ya existen (service-types con `workshop_id`, working days configurables, sucursales dinámicas en DMS), pero coexisten con hardcodeo real de marca ("Condor" en >10 puntos de UI) y de horario operativo (SHOP_OPEN/CLOSE).
- **Compliance/auditoría (~10%): bajo.** No existe audit trail genérico; solo atribución parcial de autoría en creación, sin trazabilidad de cambios ni de borrados.
- **Onboarding y comercialización (~15%): bajo.** Alta de taller 100% manual, sin seed automático de datos relacionados, sin feature flags para diferenciar planes/módulos por cliente.

El sistema está en un punto razonable como aplicación mono-tenant madura en producción, pero requiere una inversión arquitectónica significativa (estimado: varias semanas de trabajo, principalmente en B.1 y B.2) antes de poder venderse de forma segura a un segundo cliente.
