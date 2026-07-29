## Exploration: Add Pulida + Control Final as real-capacity bodyshop processes

### Current State

Bodyshop scheduling today only reserves real technician capacity for 3 processes
(BODYWORK/PREP/PAINT). `BodyshopProcess` catalog table (seeded once by
`onApplicationBootstrap()` from `DEFAULT_PROCESSES` in
`apps/api/src/modules/bodyshop/bodyshop-schedule.service.ts`) already lists 4 rows
including POLISH (sequence 4, "Pulida") but has **no FINAL_CONTROL row**, and the
catalog seed only runs when the table is empty — QAS/PROD are already seeded, so
adding a 5th entry to `DEFAULT_PROCESSES` alone will NOT create it there; a data
migration/insert is required.

`BodyshopScheduleService.simulate()` — the engine that actually books slots
against technician capacity, computes `stayDays`, and `estimatedFinishDate` — only
knows about 3 hardcoded inputs: `SimulateInput.{bodyworkHours,prepHours,paintHours}`
→ `hoursByCode` (lines 23-31, 86-90). It loops `processRepo.find({active:true})`
(so POLISH is fetched from the catalog) but `hoursByCode['POLISH']` is always
`undefined` → `remaining <= 0` → the loop `continue`s and no slot is ever produced
for POLISH, regardless of what's in the catalog. `SPECIALTY_TO_CODE` already maps
PULIDO/PULIDOR/POLISH → 'POLISH' (line 20) but has no alias for FINAL_CONTROL, and
`buildCapacityInfo()` will compute `dailyCap.get('FINAL_CONTROL')` as `0` for any
technician regardless, since nothing maps to that code.

`BodyshopService.create()` (bodyshop.service.ts ~125-303) already has a generic
`extraProcesses?: {code,name,hours}[]` DTO field. It creates informational
`TrackingLog` rows via `trackingService.initForBodyshop()` for anything in
`allProcesses` (legacy 3 + extras) and stores them on `BodyshopEntry.processes`
(jsonb), and `getSchedule()`'s `totalPlannedHours` (line 1177-1187) already sums
these extra `tracking_logs.plannedHours` into the Kanban/Seguimiento total — this
is the exact "operational-only, doesn't touch the customer invoice" separation the
business wants, and it is **already covered by an existing passing test**
(`bodyshop.service.spec.ts` "getSchedule … totalPlannedHours suma también los
procesos extra (Pulido, Mecánica)"). BUT `extraProcesses` never reaches
`scheduleService.simulate()`, so those hours are informational only: they do not
reserve real technician capacity, do not affect `stayDays`/`estimatedFinishDate`
(both derived only from `sim.slots`), and are invisible to every capacity/balance
endpoint (`getDayCapacity`, `getWeekCapacity`, `getTechnicianAvailability`,
`getMonthlyReport`, and the Gantt in `getSchedule`'s `processWindows`) — those are
ALL separately hardcoded to `BalanceProcess = 'BODYWORK'|'PREP'|'PAINT'` throughout
`bodyshop.service.ts` (types, `PROCESS_LABEL`, `SPECIALTY_TO_PROCESS`,
`techProcess()`, `computeDayCapacity()`, `getTechnicianAvailability()`,
`getMonthlyReport()`, `getSchedule()`'s `processWindows`). Adding real capacity for
POLISH/FINAL_CONTROL in `simulate()` will make them consume real slots, but they
will remain invisible on every capacity-dashboard view unless those are also
extended — this is a distinct, larger piece of work from "make simulate() book
them."

`TrackingLog` classification (`tracking.service.ts`): `BODYSHOP_PARALLEL_CODES =
{MECHANIC, DIAMANTADO, LLANTAS, ELECTRICO}` does not include POLISH/FINAL_CONTROL,
so any `TrackingLog` created for them via `initForBodyshop()` defaults to
`processType: 'MOTHER'` (line 202: `p.processType ?? (BODYSHOP_PARALLEL_CODES.has(p.code) ? 'PARALLEL' : 'MOTHER')`).
**This default is actually correct, not a gap** — MOTHER means sequential/blocking
(only one MOTHER `in_progress` per source at a time, per the comment at line
270-278), which matches the required sequence Chapería→Prep→Pintura→Pulida→Control
Final. No tracking.service.ts change is needed for processType.
`BODYSHOP_PROCESS_ORDER`/`BODYSHOP_PROCESS_NAMES` (lines 13-29) already contain
correct entries for both POLISH (order 4, "Pulido") and FINAL_CONTROL (order 6,
"Control Final") — these are used in the self-healing "auto-init missing tracking
logs" fallback path (~line 458-472) that reconstructs process lists from
`entry.processes` when a bodyshop entry has no tracking logs yet. So
tracking.service.ts needs zero changes for names/order display; the only real gaps
are in `bodyshop-schedule.service.ts` (capacity engine) and `bodyshop.service.ts`
(DTO plumbing + capacity dashboards).

`budget-appointments.service.ts` `approve()` (139-189) builds
`bodyworkHours/prepHours/paintHours` strictly from `appt.processes` (the
customer-facing `BudgetProcess[]`, code/name/hours — this IS what shows on the
invoice) and forwards anything else in `processes` as `extraProcesses`. Critically,
Pulida must NOT be derived from `appt.processes` (that would leak into
customer-facing totals if a process line item's hours were ever reused for
billing) — it must be computed server-side from `appt.pieces` (`BudgetPiece[]`
jsonb, confirmed field `qty: number` on each piece, added by migration
`007_budget_appointments_add_pieces.ts`, currently informational/traceability
only, described in that migration's own comment as "sin tocar `processes` (sigue
siendo la fuente de verdad para aprobar el presupuesto)"). `007` is confirmed the
latest migration file in `apps/api/src/database/migrations/` — no newer template
exists.

The direct-to-Agenda wizard (`apps/web/src/app/(dashboard)/appointments/new/page.tsx`,
`BodyshopNewForm`, step 2 ~line 1000-1130) has only
`directBodyworkHours/directPrepHours/directPaintHours` state and calls
`create.mutateAsync({...bodyworkHours, prepHours, paintHours...})` with no
`extraProcesses`/piece-count field at all — a "Cantidad de piezas" input plus the
wiring to pass computed POLISH/FINAL_CONTROL hours (or a raw piece count for the
backend to compute) must be added here for the no-budget path.

`BODYSHOP_SPECIALTIES` is duplicated (not shared) in two frontend files, both only
listing CHAPERIA/PREPARACION/PINTURA and both need the same 2 additions:
`apps/web/src/components/appointments/technician-create-dialog.tsx` (lines 12-15)
and `apps/web/src/app/(dashboard)/settings/technicians/page.tsx` (lines 16-19).
The settings page also has hardcoded `isBodywork/isPrep/isPaint` boolean helpers
(~line 495-497) feeding a `SpecialtyBadge` component — these need matching
`isPolish/isFinalControl` branches or new specialties will render as an unstyled
generic badge.

`updateHours()` (bodyshop.service.ts 474-503) only accepts/touches
`bodyworkHours/prepHours/paintHours` and calls `recalculateSchedule()` +
`trackingService.syncBodyshopPlannedHours()` for those 3 codes only. Given the
confirmed v1 scope (piece count fixed at creation, no post-creation edit designed
in this iteration), `updateHours()` correctly stays out of scope for this change —
no changes needed there for v1, but flagged as a known gap for a future iteration
if piece-count editing is ever added (it would silently fail to resize the POLISH
slot/hours today).

`BodyshopEntryProcessSlot.process` is `varchar(20)` (no DB enum/check
constraint) — 'FINAL_CONTROL' (13 chars) fits with no schema change needed on that
table.

Existing unit tests: `bodyshop-schedule.service.spec.ts` mocks `processRepo.find()`
to return a hardcoded 3-row `PROCESSES` array (BODYWORK/PREP/PAINT only) — adding
POLISH/FINAL_CONTROL support to `hoursByCode`/`SPECIALTY_TO_CODE` will NOT break
these existing tests (the mock simply won't return the new rows), but new test
cases will be needed to cover the 2 new processes end-to-end.
`bodyshop.service.spec.ts` already has a passing `getSchedule` test asserting
`totalPlannedHours` sums extra tracking-log hours (including a POLISH example)
correctly — this test should continue to pass unmodified and is useful regression
coverage for the "operational total ≠ customer hours" requirement.

### Affected Areas
- `apps/api/src/modules/bodyshop/bodyshop-schedule.service.ts` — `SimulateInput`, `hoursByCode`, `DEFAULT_PROCESSES`, `SPECIALTY_TO_CODE` need POLISH/FINAL_CONTROL wiring so `simulate()` actually books real slots/capacity for them.
- `apps/api/src/database/migrations/` — new migration (008) to insert the missing `FINAL_CONTROL` row into `bodyshop_processes` for already-seeded environments (QAS/PROD), following the `007_budget_appointments_add_pieces.ts` pattern.
- `apps/api/src/modules/bodyshop/bodyshop.service.ts` — `create()` DTO/plumbing to accept piece count (or pre-computed POLISH/FINAL_CONTROL hours) and pass them into `simulate()` instead of (or in addition to) `extraProcesses`; capacity-dashboard methods (`computeDayCapacity`, `getTechnicianAvailability`, `getMonthlyReport`, `getSchedule` processWindows) are a separate, larger decision (see Risks).
- `apps/api/src/modules/budget-appointments/budget-appointments.service.ts` — `approve()` (~139-189) must compute `pieceCount` from `appt.pieces[].qty` (sum) and pass POLISH hours = `0.5 * pieceCount` + FINAL_CONTROL = `0.5` fixed into `bodyshopService.create()`, kept separate from `appt.processes` (customer-facing).
- `apps/web/src/app/(dashboard)/appointments/new/page.tsx` (`BodyshopNewForm`, step 2) — needs a "Cantidad de piezas" field for the no-budget path, wired into the create call.
- `apps/web/src/components/appointments/technician-create-dialog.tsx` and `apps/web/src/app/(dashboard)/settings/technicians/page.tsx` — both have independently duplicated `BODYSHOP_SPECIALTIES` arrays needing PULIDO/CONTROL_FINAL entries; the settings page also needs matching `SpecialtyBadge` branches.
- `apps/api/src/modules/tracking/tracking.service.ts` — verified NO changes needed (names/order/processType already correct for both new codes); include only as regression-risk area to re-test, not to edit.
- `apps/api/src/__tests__/bodyshop-schedule.service.spec.ts`, `apps/api/src/__tests__/bodyshop.service.spec.ts` — extend with new cases for POLISH/FINAL_CONTROL capacity booking; existing tests confirmed non-breaking as-is.

### Approaches

1. **Extend `simulate()`'s hardcoded 3-process model to 5 processes, piece count computed by caller (budget-appointments.service / wizard) and passed as explicit hours** — add `polishHours`/`finalControlHours` (or a generic `extraHours: Record<string,number>`) to `SimulateInput`, extend `hoursByCode`, add FINAL_CONTROL alias to `SPECIALTY_TO_CODE`, seed `FINAL_CONTROL` via migration.
   - Pros: minimal surface change to the scheduling engine; keeps `simulate()`'s existing sequential-loop logic (which already iterates `processRepo.find({active})` in `sequence` order, so POLISH/FINAL_CONTROL naturally schedule after PAINT once given nonzero hours); Control Final's fixed 0.5h needs zero UI input, can be injected server-side unconditionally whenever any bodywork process runs.
   - Cons: `SimulateInput`/`hoursByCode` stay as named fields rather than a generic map — every future process addition repeats this pattern; capacity dashboards remain unaddressed (separate decision).
   - Effort: Medium.

2. **Generalize `simulate()` to accept an arbitrary `Record<processCode, hours>` map instead of named fields**, sourced from the `BodyshopProcess` catalog directly (already ordered by `sequence`).
   - Pros: no more hardcoded field per process; future processes (e.g. Mecánica-adjacent chapería work) plug in without touching `SimulateInput`'s shape; also simplifies `create()`'s `allProcesses` construction.
   - Cons: larger refactor touching every caller of `simulate()` (`create()`, `recalculateSchedule()`, the wizard, `approve()`); higher regression risk against the two existing spec files' explicit `bodyworkHours/prepHours/paintHours` mocks; goes beyond the stated v1 scope.
   - Effort: High.

### Recommendation

Approach 1 (targeted extension) — it directly satisfies the confirmed v1 scope
(2 new processes, fixed sequence, no post-creation edit) with the smallest,
most reviewable diff, reuses `simulate()`'s existing sequential day-by-day booking
loop unchanged, and defers the "generalize the process model" refactor (approach 2)
to a future iteration if more processes are ever added. The capacity-dashboard
question (whether `getDayCapacity`/`getWeekCapacity`/`getTechnicianAvailability`/
`getMonthlyReport`/Gantt `processWindows` need to show POLISH/FINAL_CONTROL) should
be explicitly resolved in `sdd-propose` as an in/out-of-scope decision — the user's
stated requirement only mentions Kanban/Seguimiento (`totalPlannedHours`, already
working today via the extras mechanism), not these balance/report screens.

### Risks
- Capacity-dashboard blind spot: even after `simulate()` books real POLISH/FINAL_CONTROL slots, `getDayCapacity`, `getWeekCapacity`, `getTechnicianAvailability`, and `getMonthlyReport` will not show or account for those technicians' load (all hardcoded to `BalanceProcess = BODYWORK|PREP|PAINT`) — needs an explicit scope decision, not an oversight to silently leave broken.
- QAS/PROD already have `bodyshop_processes` seeded — a migration (not just a `DEFAULT_PROCESSES` array edit) is mandatory to add `FINAL_CONTROL`, and it must also assign it a `sequence` position consistent with `BODYSHOP_PROCESS_ORDER`'s `FINAL_CONTROL: 6` in tracking.service.ts (note: that map currently reserves 5 for MECHANIC, a Mecánica-only parallel process irrelevant to chapería's sequential flow — confirm the intended `bodyshop_processes.sequence` value for FINAL_CONTROL doesn't collide with MECHANIC's separate numbering scheme, since these are two different tables/maps).
- If a dedicated Pulido/Control Final technician doesn't exist yet in a given workshop's `technicians` table, `dailyCap.get('POLISH'|'FINAL_CONTROL')` will be 0 and `simulate()` will push a "Sin técnicos disponibles" warning and skip the process silently rather than fail loudly — worth deciding whether that should block entry creation or degrade gracefully (current PREP-without-dedicated-tech fallback pattern shares BODYWORK's pool; POLISH/FINAL_CONTROL have no such fallback defined and per the given scope should require dedicated techs).
- Frontend specialty lists are duplicated in 2 files with no shared constant — both must be updated in lockstep or one screen will silently support the new specialties while the other doesn't (existing tech-debt pattern, not introduced by this change, but a real regression risk if only one file is touched).
- `pieceCount` must be validated as `> 0` for POLISH hours to compute meaningfully; and `approve()` must not accidentally include a manually-entered POLISH/FINAL_CONTROL line in `appt.processes` (customer-facing) as billable hours — the delta spec should be explicit that `LEGACY_CODES`/customer-facing filtering excludes these 2 codes from ever reaching the invoice, even if a perito manually adds a "Pulido" line to `processes` in the budget simulator UI.

### Ready for Proposal
Yes. All orchestrator-supplied technical findings were independently verified against the current code (bodyshop-schedule.service.ts, bodyshop.service.ts, tracking.service.ts, budget-appointment.entity.ts, both frontend specialty files, both spec files, migration 007). One correction/nuance found: tracking.service.ts needs NO changes (names/order/processType already correct) — remove it from the implementation task list, keep it only as a regression-test area. One new material risk surfaced: the capacity/balance dashboard endpoints (getDayCapacity/getWeekCapacity/getTechnicianAvailability/getMonthlyReport) are entirely separate from simulate() and will not reflect the new processes unless explicitly scoped in — sdd-propose should make an explicit in/out decision on this before sdd-design.

### Open Decisions Pending User Confirmation (as of this artifact)
1. Do capacity/balance dashboard screens (getDayCapacity/getWeekCapacity/getTechnicianAvailability/getMonthlyReport) need to reflect POLISH/FINAL_CONTROL in this change, or stay out of scope (Kanban/Seguimiento only, as explicitly requested)?
2. If a workshop has no dedicated Pulido/Control Final technician yet, should entry creation be blocked, or should it degrade gracefully (current silent-skip-with-warning behavior)?
