# 07 — QA Audit — Gate Técnico Pre-Producción

**Repo:** `/Users/hansselmirabal/orca/workspaces/APP-TALLER/cetus`
**Rama al momento de la auditoría:** `local-main-sync` (tracking `origin/develop`), working tree limpio salvo artefactos no versionados (`.atl/.skill-registry.cache.json`, `docs/audit/`).
**Fecha:** 2026-08-13

---

## RESULTADOS REALES (conteos exactos)

| Suite | Suites | Tests | Passed | Failed | Skipped | Tiempo |
|---|---|---|---|---|---|---|
| **Backend** (`apps/api` — `pnpm test`, Jest) | 22 | 296 | **294** | **0** | 2 | 26.5s |
| **Frontend** (`apps/web` — `pnpm test`, Jest) | 8 | 81 | **81** | **0** | 0 | 3.0s |
| **Total** | 30 | 377 | **375** | **0** | 2 | — |

- Typecheck backend (`tsc --noEmit`): **PASS**, 0 errores.
- Typecheck frontend (`tsc --noEmit`): **PASS**, 0 errores.
- Build `apps/api` (`nest build`): **PASS**.
- Build `apps/web` (`next build`): **PASS** (42 rutas generadas, sin `force-dynamic` forzado).
- Lint backend (`eslint src` en `apps/api`): **PASS** — 0 errores, 17 warnings (`no-unused-vars`).
- Lint frontend (`next lint` en `apps/web`): **ROTO** — el comando no existe (ver hallazgo QA-01).
- Lint raíz (`pnpm lint` desde la raíz del monorepo): **ROTO** — loop de invocación recursiva de turbo (ver hallazgo QA-02).

**Hallazgo relevante que corrige la premisa de la consigna:** el frontend **sí tiene** harness de tests unitarios (`apps/web/src/__tests__/*.spec.ts`, 8 archivos, 81 tests, Jest + `jest-environment-jsdom`), y corre en CI (`test-web` job). No es un gap — está cubierto. Adicionalmente existe un spec e2e con Playwright (`apps/web/e2e/auth.spec.ts`), no ejecutado en esta auditoría por requerir servidor vivo — está fuera del alcance de `pnpm test`.

---

## Matriz: reglas críticas vs cobertura de test

| Regla crítica | Test existente | Resultado | Falta test |
|---|---|---|---|
| No permitir dos trabajos activos del mismo vehículo | **No** — la regla existe en código (`bodyshop.service.ts:212-222`, guard por patente activa en `entryRepo`; réplica análoga en `appointments.service.ts:185`) pero **ningún spec la ejercita**. `bodyshop.service.spec.ts → describe('create')` no cubre el path de patente duplicada; `appointments-create.service.spec.ts` tampoco. | **Gap de cobertura** | Sí — falta test que cree un entry/turno activo y verifique `BadRequestException` al reintentar con la misma patente en el mismo taller, en ambos módulos (bodyshop y appointments). |
| Iniciar un proceso PARALLEL pausa el proceso MOTHER activo | Sí — `tracking.service.spec.ts:551` ("starting a PARALLEL process ... pauses the active MOTHER process ... tagging the pause with the parallel's name") y `:582` (caso sin MOTHER activo, no-op). | **Pass** | No |
| Cálculo de capacidad (CapacidadProceso/HorasOcupadas/Ocupación%) | Sí, extenso — `bodyshop.service.spec.ts → describe('getDayCapacity')` (líneas 559-793: día laboral, domingo, feriado, ausencias full/half, ocupación secuencial por fase, thresholds RISK ≥0.8 y OVERLOADED ≥1, entries en estadía, POLISH/FINAL_CONTROL derivados de `processes` jsonb) + `capacity.service.spec.ts` + `getWeekCapacity`/`getMonthlyReport`. | **Pass** | No |
| Transición completa de estados de TrackingLog (pending→in_progress→blocked→completed) | Parcial por diseño — cada transición está cubierta individualmente y con buen detalle de edge cases: `startProcess` (:416-624, incluye conflicto de técnico entre vehículos), `blockProcess` (:692-734), `unblockProcess` (:735-811, incl. reasignación de técnico), `completeProcess` (:625-691, incl. auto-advance y `parallelBlocking`). No hay un test único que recorra las 4 transiciones en secuencia sobre el mismo log, pero la cobertura por transición (incluyendo excepciones en estados inválidos, ej. "already completed", "not blocked") es sólida — equivalente en efecto a la técnica de transición de estados de ISTQB. | **Pass** (cobertura por transición individual, no un caso de ciclo completo) | Opcional — un test de integración de ciclo completo (pending→in_progress→blocked→unblock→completed) daría trazabilidad end-to-end explícita, pero no es un gap bloqueante. |
| Autorización por rol en endpoints mutantes críticos | Parcial — `permissions.guard.spec.ts` cubre exhaustivamente `PermissionsGuard` (admin bypass, permisos desde JWT, fallback a DB, rechazo 403, distinción view/edit). Pero los endpoints mutantes de `bodyshop-catalog.controller.ts` (13 endpoints `@Roles('admin')`) y `bodyshop.controller.ts` (`@Roles('admin')` en línea 61) usan **`RolesGuard`**, un guard distinto, y **no existe `roles.guard.spec.ts`** ni ningún test que ejercite `RolesGuard` directamente. | **Gap de cobertura** | Sí — falta `roles.guard.spec.ts` (o tests de controller) que verifiquen que `RolesGuard` rechaza a un usuario no-admin en al menos un endpoint mutante de `bodyshop-catalog` y de `bodyshop.controller`. |

---

## Hallazgos

| ID | Módulo | Descripción | Evidencia | Impacto | Severidad | Recomendación | Esfuerzo | Bloquea prod |
|---|---|---|---|---|---|---|---|---|
| QA-01 | `apps/web` — tooling | El script `lint` de `apps/web` (`next lint`) ya no existe: Next.js 16.2.3 eliminó el subcomando `lint` de su CLI. Además, `apps/web/package.json` **no tiene `eslint` como dependencia** ni existe ningún archivo de config ESLint en `apps/web`. El frontend no tiene lint funcional de ningún tipo. | `cd apps/web && pnpm lint` → `Invalid project directory provided, no such directory: .../apps/web/lint`. `npx next --help` confirma que `lint` no está en la lista de comandos de Next 16. `rg '"eslint' apps/web/package.json` → sin resultados. | Sin lint, errores de calidad (variables no usadas, hooks mal usados, imports rotos, `any` implícitos) no se detectan hasta build o runtime. Impacto agravado porque **CI tampoco tiene un job `lint-web`** (`.github/workflows/ci.yml` solo define `lint-api`) — el gap es invisible en el pipeline. | P2 | Instalar `eslint` + config (`eslint-config-next` compatible con Next 16, que usa flat config) en `apps/web`, cambiar el script `lint` a invocar `eslint` directamente (patrón ya recomendado por Next 15+), y agregar el job `lint-web` a CI. | S | No (build y typecheck sí pasan; es un gap de red de seguridad, no un bloqueo funcional) |
| QA-02 | raíz del monorepo — tooling | `pnpm lint` desde la raíz falla con "recursive_turbo_invocations": el `package.json` raíz declara `"workspaces": ["apps/*", "packages/*"]`, pero pnpm no soporta ese campo (requiere `pnpm-workspace.yaml`, que no existe) — pnpm no reconoce `apps/api`/`apps/web` como workspaces reales, cada uno tiene su propio `pnpm-lock.yaml` independiente (`apps/api/pnpm-lock.yaml`, `apps/web/pnpm-lock.yaml`), y turbo interpreta el `lint` de la raíz como una tarea recursiva sobre sí misma. | `pnpm lint` en raíz → `WARN The "workspaces" field in package.json is not supported by pnpm` + `x Your package.json script looks like it invokes a Root Task (//#lint), creating a loop`. `next build` en `apps/web` también advierte: "Detected additional lockfiles: apps/web/pnpm-lock.yaml". | No bloquea CI (que corre `pnpm run lint`/`test`/`typecheck` por app con `working-directory`, no el script raíz), pero rompe la ergonomía de desarrollo local y el propio gate de esta auditoría no pudo ejecutar `pnpm lint` como fue instruido inicialmente. | P3 | Decidir una postura: o se completa la migración a pnpm workspaces reales (agregar `pnpm-workspace.yaml`, unificar lockfile, borrar los lockfiles anidados), o se quita `"workspaces"` del `package.json` raíz y se documenta que cada app se lintea/testea de forma independiente (que es lo que CI ya hace). | S | No |
| QA-03 | `bodyshop.service.ts` / `appointments.service.ts` | Regla de negocio crítica "no permitir dos trabajos activos para la misma patente" está implementada (`bodyshop.service.ts:212-222`, análogo en `appointments.service.ts:185`) pero **sin ningún test que la ejercite**. | `rg -n "Bloquear patente duplicada" apps/api/src/modules/bodyshop/bodyshop.service.ts` confirma la implementación; `rg -ni "mismo vehiculo\|already.*active" apps/api/src -g '*.spec.ts'` no encuentra tests. | Si un refactor futuro rompe esta validación (p. ej. cambia el filtro de `status NOT IN`), no hay red de seguridad automatizada — el bug llegaría a producción y permitiría abrir dos OTs activas para el mismo vehículo, corrompiendo tracking/capacidad. | P1 | Agregar test en `bodyshop.service.spec.ts` (`describe('create')`) y en `appointments-create.service.spec.ts` que simule un entry/turno activo existente con la misma patente y verifique `BadRequestException`. | S | Recomendado antes de release, no estrictamente bloqueante (la regla funciona hoy, solo falta la red de test) |
| QA-04 | `RolesGuard` (`bodyshop-catalog.controller.ts`, `bodyshop.controller.ts`) | No existe `roles.guard.spec.ts` ni ningún test que ejercite `RolesGuard` directamente, pese a que protege 14+ endpoints mutantes admin-only del catálogo de chapa y pintura. Solo `PermissionsGuard` (mecanismo distinto, usado en `tracking.controller.ts`) tiene cobertura. | `fd -e spec.ts . apps/api/src/__tests__ \| rg -i "role\|guard"` → solo `permissions.guard.spec.ts` y `roles.service.spec.ts` (este último es de `RolesService`, CRUD de roles, no del guard). `rg "@Roles('admin')" apps/api/src/modules/bodyshop/bodyshop-catalog.controller.ts` → 14 endpoints. | Un no-admin podría potencialmente mutar catálogo de bodyshop si `RolesGuard` se rompe en un refactor futuro, sin que ningún test lo detecte. | P2 | Agregar `roles.guard.spec.ts` con casos: admin pasa, no-admin rechazado 403, sin `@Roles` pasa igual. | S | No |
| QA-05 | CI (`.github/workflows/ci.yml`) | No existe ningún job de build (`next build` / `nest build`) en el pipeline de PR — solo lint-api, typecheck-api, test-api, typecheck-web, test-web. El build recién se verifica en `deploy-qas.yml` (docker build), es decir, después del merge. | Lectura de `.github/workflows/ci.yml`: 5 jobs, ninguno llama `pnpm build`. | Un error de build (p. ej. import roto que typecheck no detecta por diferencias entre `tsc --noEmit` y el pipeline real de Next, o un error de generación de páginas estáticas) puede mergear a `develop`/`main` y solo explotar en el deploy. | P3 | Agregar jobs `build-api`/`build-web` al CI de PR, antes del deploy. | S | No |

---

## Score y veredicto — dominio QA/Tests

**Score Calidad/Tests: 82/100**

Justificación: 375/377 tests reales pasan (0 fallas), typecheck limpio en ambos apps, builds de producción limpios en ambos apps, y las reglas de negocio de mayor riesgo operativo (cálculo de capacidad, pausa de MOTHER por PARALLEL) tienen cobertura sólida y detallada con casos borde reales (incluyendo bugs de QA ya documentados en los propios tests, ej. "QA-reported bug: el botón Iniciar del kanban nunca envía technicianId"). Se descuenta por: lint de frontend completamente ausente y sin red en CI (QA-01), una regla de negocio crítica de integridad de datos sin test (QA-03: duplicidad de vehículo activo), y un mecanismo de autorización completo (`RolesGuard`) sin cobertura directa (QA-04). Ninguno de estos hallazgos es una falla activa detectada en tiempo de ejecución — todos son gaps de red de seguridad, no bugs confirmados en producción.

**GO CONDICIONADO** — para mi dominio (calidad/tests): condicionado a que QA-03 (test de duplicidad de vehículo activo) se agregue antes de la próxima release, dado que es la única regla crítica de negocio sin ninguna cobertura automatizada sobre una validación de integridad de datos ya implementada. QA-01, QA-02, QA-04 y QA-05 son deuda técnica recomendable pero no bloqueante.
