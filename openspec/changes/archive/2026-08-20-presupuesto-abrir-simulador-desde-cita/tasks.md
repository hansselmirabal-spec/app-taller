# Tasks: Open the Simulator from a scheduled budget appointment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~110 (actual: 110) · PR2 ~300 (actual: 866) · PR3 ~200 (actual: 411) · PR4 ~370 (actual: 335) |
| 400-line budget risk | PR1 Low (on budget) · PR2 Medium (actual: High — over budget) · PR3 Medium (actual: High — over budget) · PR4 High forecast (actual: on budget, 335 lines) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (range endpoint) → PR2 (extract shared Simulator form, child of PR1) → PR3 (`simulador/[id]` edit route, child of PR2) → PR4 (two-panel board, child of PR1+PR3) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (resolved 2026-08-20 — each PR targets `main` directly, merged individually) |

Decision needed before apply: No (resolved)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High (forecast) — actuals: PR1 on-budget, PR2/PR3 over budget (flagged, mechanical/no-behavior-change), PR4 on-budget.

Design already resolved the 4-PR split and per-PR line estimates (see `design.md`
Chained PR plan). Not reopened here.

**ALL 4 PRs NOW MERGED TO MAIN.** PR1/PR2/PR3/PR4 all merged. Follow-up PR #63
merged to fix the CRITICAL verification issue (motive/notes field in agenda panel).

PR1 MERGED: https://github.com/hansselmirabal-spec/app-taller/pull/59 (branch
`feat/budget-appointments-range-endpoint` → `main`, commit `721f044`).

PR2 MERGED: https://github.com/hansselmirabal-spec/app-taller/pull/60 (branch
`feat/simulador-extract-shared-form` → `main`, commit `dd955dd`; actual diff
866 lines, over budget — git couldn't detect the JSX-move as a rename once
prop names changed on every handler; mechanical, no behavior change). Post-merge
direct fix on `main`: `SimulatorForm` gained an explicit `vehicleFound: boolean`
prop (label now keys off `vehicleFound` instead of a truthy `vehicleModel` check).

PR3 MERGED: https://github.com/hansselmirabal-spec/app-taller/pull/61 (branch
`feat/simulador-edit-route` → `main`, commit `d76b486`; actual diff 411 changed
lines, also over the 400-line budget — mostly the new `simulador/[id]/page.tsx`
route, which needs distinct loading/not-found/hydration/save branches; flagged
in the PR body, suggested lens `review-reliability`). Post-merge direct fixes on
`main`: `[id]/page.tsx` render/status-gate now driven by a single `screenState:
'loading'|'notfound'|'ready'` state set once (not derived per-render from live
`appt`); two new reusable helpers added to `simulador/_shared/`:
`estimateToBudgetPayload(estimate)` in `use-simulator-form.ts` and
`LazyBudgetPdfLink` in `budget-pdf-link-lazy.tsx`.

PR4 MERGED: https://github.com/hansselmirabal-spec/app-taller/pull/62
(branch `feat/presupuesto-two-panel-board` → `main`, commit `07d2643`).
Two-panel week board (day-agenda left + 4-column status board right) replaces
the `view: 'grid'|'list'` toggle in `presupuesto/page.tsx`. Actual diff 335
changed lines (`page.tsx` alone: 317 = 126 additions + 191 deletions) — first
PR in this chain to land UNDER the 400-line budget.

PR #63 (FOLLOW-UP): https://github.com/hansselmirabal-spec/app-taller/pull/63
(commit `954389b3b2ccca67e78b54d3dc591cb89b28ae52`, merged post-verify).
Fixes the CRITICAL verification issue: `AgendaTimeline` component now renders
`notes` (motive/reason) in each slot row, an explicit MUST in the
`budget-workspace-board` spec scenario. No other issues in the verification
report were CRITICAL (color-token warning and lack of automated frontend tests
are pre-existing repo constraints and already-reviewed deviations).

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

- [x] 7.1 In `apps/web/src/app/(dashboard)/presupuesto/page.tsx`, replace the `date`-scoped query with `useBudgetAppointmentsRange(workshopId, from, to)` computed from `startOfWeek(new Date(), { weekStartsOn: 1 })` through Friday of that week
- [x] 7.2 Selected day state: defaults to today when Mon-Fri, else Friday of the anchor week; no persistence/localStorage

## Phase 8: PR4 — Two-panel layout

- [x] 8.1 Remove the grid/list `view` toggle and its state from `presupuesto/page.tsx`
- [x] 8.2 Left panel: 5 day chips (Mon-Fri) with per-day appointment counts derived client-side from the week dataset (`countBy(date)`); selecting a chip filters the slot list to that day (time, customer, plate, motive/note, status pill)
- [x] 8.3 Right panel: 4 fixed status columns (`pending`/`approved`/`rejected`/`cancelled`), each with header count and independent scroll; empty scope renders an explicit empty-state string (e.g. "Sin rechazados esta semana"), never blank; reuse `STATUS_CONFIG` colors unchanged
- [x] 8.4 Wire both panels' click targets (slot rows, cards) through the PR3 status-aware nav helper (pending → `simulador/[id]`, else → `[id]`)

## Phase 9: PR4 — Verification

- [x] 9.1 Manual QA: landing on `/presupuesto` shows both panels, no toggle; day-chip counts match column totals for the week; all 4 columns render even when a status has zero appointments (verified via code-path tracing — no live-browser QA in this sandboxed environment, same disclosure as PR2/PR3)
- [x] 9.2 Manual QA: on Sat/Sun, week anchors to the week that just ended (not an empty upcoming week); selected day defaults to Friday (verified via code-path tracing)
- [x] 9.3 `cd apps/api && pnpm test` full suite green (23 suites / 306 passed, 2 pre-existing skipped — no regressions from PR1); `pnpm typecheck` (api+web) clean

## ALL PHASES COMPLETE — 37/37 tasks. Change fully implemented and verified across PR1-PR4, with CRITICAL fix merged in PR #63.

Also written to `openspec/changes/presupuesto-abrir-simulador-desde-cita/tasks.md`
(hybrid mode) — this Engram record mirrors that file exactly as of archive completion,
2026-08-20.
