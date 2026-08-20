# Tasks: Open the Simulator from a scheduled budget appointment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~110 · PR2 ~300 · PR3 ~200 · PR4 ~370 |
| 400-line budget risk | PR1 Low · PR2 Medium · PR3 Medium · PR4 High (at budget edge) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (range endpoint) → PR2 (extract shared Simulator form, child of PR1) → PR3 (`simulador/[id]` edit route, child of PR2) → PR4 (two-panel board, child of PR1+PR3) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (resolved 2026-08-20 — each PR targets `main` directly) |

Decision needed before apply: No (resolved)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Design already resolved the 4-PR split and per-PR line estimates (see `design.md`
Chained PR plan). Not reopened here.

PR1 merged: https://github.com/hansselmirabal-spec/app-taller/pull/59 (branch
`feat/budget-appointments-range-endpoint` → `main`, commit `721f044`).
PR2 merged: https://github.com/hansselmirabal-spec/app-taller/pull/60 (branch
`feat/simulador-extract-shared-form` → `main`, commit `dd955dd`; actual diff
866 lines, over budget — see PR2 apply-progress note).
PR3 open, not yet merged: https://github.com/hansselmirabal-spec/app-taller/pull/61
(branch `feat/simulador-edit-route` → `main`; actual diff 411 changed lines,
also over the 400-line budget — mostly the new `simulador/[id]/page.tsx`
route, which needs distinct loading/not-found/hydration/save branches;
flagged in the PR body, suggested lens `review-reliability`). PR4 must NOT
start until PR3 is merged.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `from`/`to` range query, role-scoped, on `GET /budget-appointments` | PR 1 | `cd apps/api && pnpm test -- budget-appointments.service.spec` | N/A — no supertest/e2e harness in repo; manual QA with `curl` against dev API | `budget-appointments.controller.ts`/`.service.ts` `from`/`to` branch, `getBudgetAppointmentsRange` (`lib/api.ts`), `useBudgetAppointmentsRange` (`use-budget-appointments.ts`) — additive, unused by any page, revertible in isolation |
| 2 | Extract shared Simulator form/state, create mode unchanged | PR 2 | `cd apps/web && pnpm test -- use-vehicle-lookup` (no new spec expected — pure refactor; typecheck is the real proof) | N/A — no `.test.tsx` harness; manual QA: full create flow (lookup, items, estimate, save) behaves byte-identical to pre-refactor | New `presupuesto/simulador/_shared/*` files + `simulador/page.tsx` now consuming them — revert by restoring `page.tsx` from git, no other file depends on `_shared/*` yet |
| 3 | `simulador/[id]` edit route + status-aware nav + remove "Ingresar al taller" + readonly banner | PR 3 | N/A — no `.test.tsx` harness | Manual QA: edit pending appt, save, non-pending redirect+banner, no "Ingresar al taller" button anywhere in Simulador | New `simulador/[id]/page.tsx`, 4 `router.push` call sites in `presupuesto/page.tsx`, removed modal in `simulador/page.tsx`, additive banner in `[id]/page.tsx` — each revertible without touching PR4's board rewrite |
| 4 | Two-panel workspace: week Agenda + 4-column status board | PR 4 | N/A — no `.test.tsx` harness | Manual QA: week anchor Mon (or Fri on weekend), day-chip counts, 4 columns always render incl. empty states, `STATUS_CONFIG` colors unchanged | Full `presupuesto/page.tsx` rewrite — revert by restoring prior grid/list version from git; does not touch `[id]/page.tsx` or `simulador/*` |

## Phase 1: PR1 — `findByRange` service (TDD)

- [x] 1.1 RED: `findByRange` — perito caller sees only own `peritoId` rows (mirror `findByDate`'s scoping test), in `apps/api/src/__tests__/budget-appointments.service.spec.ts`
- [x] 1.2 RED: `findByRange` — non-perito caller (admin/asesor) sees all rows in range, no `peritoId` filter applied
- [x] 1.3 RED: `findByRange` — results ordered `date ASC, timeStart ASC`, scoped to `workshopId` and `Between(from, to)`
- [x] 1.4 GREEN: implement `findByRange(workshopId, from, to, callerId?, callerRole?)` in `apps/api/src/modules/budget-appointments/budget-appointments.service.ts`, reusing the exact `callerRole === 'perito'` guard from `findByDate` (lines 163-171)

## Phase 2: PR1 — Controller `from`/`to` branch (TDD)

- [x] 2.1 RED: `GET /budget-appointments?workshopId&from&to` (valid dates) → 200, calls `service.findByRange` with `user.id`/`user.role`, in `apps/api/src/__tests__/budget-appointments.controller.spec.ts` (new file — no controller spec exists yet for this module)
- [x] 2.2 RED: `from`/`to` with invalid `YYYY-MM-DD` format on either param → 400 (`DATE_RE` reused, not redefined)
- [x] 2.3 RED: existing `date` branch untouched — regression test proving `date` still routes to `findByDate`
- [x] 2.4 GREEN: add `@Query('from')`/`@Query('to')` params + branch in `find()`, `apps/api/src/modules/budget-appointments/budget-appointments.controller.ts` (pattern: `appointments.controller.ts:26-45`)
- [x] 2.5 REFACTOR: run full `apps/api` suite, confirm no regression in existing `findByDate`/`findByPlate` tests

## Phase 3: PR1 — Web client + hook (no RED — thin wrapper, matches untested `getBudgetAppointments`/`useBudgetAppointments` precedent)

- [x] 3.1 [Frontend, no RED] add `getBudgetAppointmentsRange(workshopId, from, to)` next to `getBudgetAppointments`, `apps/web/src/lib/api.ts` (~L1597)
- [x] 3.2 [Frontend, no RED] add `useBudgetAppointmentsRange(workshopId, from, to)` in `apps/web/src/hooks/use-budget-appointments.ts`, key `[KEY, 'range', workshopId, from, to]`, `staleTime: 30_000`
- [x] 3.3 `cd apps/api && pnpm test` green (all PR1 tests) + `pnpm typecheck` (api+web) clean

## Phase 4: PR2 — Extract shared Simulator form

- [x] 4.1 Create `apps/web/src/app/(dashboard)/presupuesto/simulador/_shared/use-simulator-form.ts`: move `plate`/`customerName`/`phone`/`budgetNumber`/`notes`/`items`/`estimate`/`error` state + `handlePlateLookup` + estimate-debounce effect out of `simulador/page.tsx`
- [x] 4.2 Create `apps/web/src/app/(dashboard)/presupuesto/simulador/_shared/simulator-form.tsx`: move the vehicle-header + items-list + estimate-summary JSX out of `simulador/page.tsx`, parameterized by the hook's state/handlers
- [x] 4.3 Rewrite `apps/web/src/app/(dashboard)/presupuesto/simulador/page.tsx` to consume `_shared/*`; create-mode behavior (lookup, items, estimate, save-as-modal) unchanged — no new/removed capability in this PR
- [x] 4.4 Manual QA: full create flow identical to pre-refactor (plate lookup, add/remove items, estimate recompute, save creates appointment, redirect to `/presupuesto/{id}`) — verified via line-by-line handler/prop equivalence against the pre-refactor file (no live-browser QA available in this environment); every state setter, mutation call, and JSX branch was preserved 1:1, only re-wired through props
- [x] 4.5 `pnpm typecheck` (web) clean; no `apps/api` changes in this PR

## Phase 5: PR3 — `simulador/[id]` edit route

- [x] 5.1 Create `apps/web/src/app/(dashboard)/presupuesto/simulador/[id]/page.tsx` using `use-simulator-form`/`simulator-form` from PR2, fetching via `useBudgetAppointment(id)`
- [x] 5.2 Loading state: full-screen `Loader2` spinner (mirror `[id]/page.tsx:56-62`); form not rendered until data resolves
- [x] 5.3 404/error state: terminal "Presupuesto no encontrado" + "Volver a Presupuestos" button, no auto-redirect
- [x] 5.4 Status gate: `appt.status !== 'pending'` → `router.replace('/presupuesto/{id}?readonly=1')`, fired after fetch and before hydration/estimate
- [x] 5.5 Hydration: seed `items` from `appt.pieces` exactly once via a `useRef` flag (not a `useEffect` dep on `appt`); `pieces` null/empty → `[newItem()]`
- [x] 5.6 Save handler: only `useUpdateBudgetProcesses({id, processes, pieces})`, never `useCreateBudgetAppointment`; block save when `processes.length === 0`; success → `router.push('/presupuesto')`; failure → inline error, stay on page

## Phase 6: PR3 — Nav repoint + cleanup

- [x] 6.1 Add a small status-aware nav helper (e.g. `presupuesto/${id}` for non-pending, `presupuesto/simulador/${id}` for pending) and apply it to the 4 existing `router.push(\`/presupuesto/${a.id}\`)` call sites in `apps/web/src/app/(dashboard)/presupuesto/page.tsx` (lines 304, 330, 347, 364)
- [x] 6.2 Remove `handleEnterTaller`, the "Ingresar al taller" button/modal/state, and the `createBodyshopEntry` import from `apps/web/src/app/(dashboard)/presupuesto/simulador/page.tsx` (lines ~74-78, 225, 550-598)
- [x] 6.3 Add additive amber readonly banner to `apps/web/src/app/(dashboard)/presupuesto/[id]/page.tsx` when `?readonly=1` is present: "Este presupuesto ya no está pendiente — se abre en modo lectura. Solo los pendientes se editan en el Simulador."
- [x] 6.4 Manual QA: edit a pending appointment end-to-end (prefill, edit, save, redirect to `/presupuesto`); open a non-pending appointment via a repointed nav site → lands on `[id]?readonly=1` with banner; confirm no "Ingresar al taller" action exists anywhere in the Simulador — verified via code-path tracing (redirect effect runs before hydration; nav sites all route through `budgetNavPath`; no "Ingresar al taller" references remain in `simulador/page.tsx`); no live-browser QA available in this sandboxed environment, flagged as pre-merge follow-up in the PR body
- [x] 6.5 `pnpm typecheck` (web) clean

## Phase 7: PR4 — Week data wiring

- [ ] 7.1 In `apps/web/src/app/(dashboard)/presupuesto/page.tsx`, replace the `date`-scoped query with `useBudgetAppointmentsRange(workshopId, from, to)` computed from `startOfWeek(new Date(), { weekStartsOn: 1 })` through Friday of that week
- [ ] 7.2 Selected day state: defaults to today when Mon-Fri, else Friday of the anchor week; no persistence/localStorage

## Phase 8: PR4 — Two-panel layout

- [ ] 8.1 Remove the grid/list `view` toggle and its state from `presupuesto/page.tsx`
- [ ] 8.2 Left panel: 5 day chips (Mon-Fri) with per-day appointment counts derived client-side from the week dataset (`countBy(date)`); selecting a chip filters the slot list to that day (time, customer, plate, motive/note, status pill)
- [ ] 8.3 Right panel: 4 fixed status columns (`pending`/`approved`/`rejected`/`cancelled`), each with header count and independent scroll; empty scope renders an explicit empty-state string (e.g. "Sin rechazados esta semana"), never blank; reuse `STATUS_CONFIG` colors unchanged
- [ ] 8.4 Wire both panels' click targets (slot rows, cards) through the PR3 status-aware nav helper (pending → `simulador/[id]`, else → `[id]`)

## Phase 9: PR4 — Verification

- [ ] 9.1 Manual QA: landing on `/presupuesto` shows both panels, no toggle; day-chip counts match column totals for the week; all 4 columns render even when a status has zero appointments
- [ ] 9.2 Manual QA: on Sat/Sun, week anchors to the week that just ended (not an empty upcoming week); selected day defaults to Friday
- [ ] 9.3 `cd apps/api && pnpm test` full suite green (no regressions from PR1); `pnpm typecheck` (api+web) clean
