# Design: Chapería — Pulida + Control Final as real-capacity processes

## Technical Approach

Implements Exploration **Approach 1** (targeted 3→5 extension of the hardcoded
process model), amplified per user decision to also surface the two new processes
in the capacity/balance screens. `simulate()` gains two explicit named hour inputs
(`polishHours`, `finalControlHours`) mirroring the existing
`bodyworkHours/prepHours/paintHours` triple — **no generic map** (Approach 2 stays
deferred). A pure, shared helper owns the "0.5h per piece" and "0.5h fixed" rules
so the business rule lives in exactly one place. FINAL_CONTROL is seeded into
already-provisioned environments via an idempotent migration 008. Customer-facing
budget/invoice hours are never touched: POLISH/FINAL_CONTROL are derived
server-side and kept out of `appt.processes`.

## Architecture Decisions

### Decision: Explicit named hour fields on `SimulateInput`, not a generic map
**Choice**: Add `polishHours: number` and `finalControlHours: number` to
`SimulateInput` (bodyshop-schedule.service.ts), extend `hoursByCode` with
`POLISH`/`FINAL_CONTROL` keys.
**Alternatives considered**: Generic `extraHours: Record<code,hours>` (Approach 2).
**Rationale**: Smallest, most reviewable diff; keeps the existing sequential
booking loop (`processRepo.find({active}) order sequence ASC`) untouched — it
already books any catalog process with nonzero hours after PAINT. Matches the
established `bodyworkHours/prepHours/paintHours` pattern the two spec files mock.

### Decision: Single shared pure helper for the hour rules
**Choice**: New `apps/api/src/modules/bodyshop/bodyshop-hours.util.ts`:
```ts
export const POLISH_HOURS_PER_PIECE = 0.5;
export const FINAL_CONTROL_FIXED_HOURS = 0.5;
export const computePolishHours = (pieceCount: number): number =>
  Math.max(0, Number(pieceCount) || 0) * POLISH_HOURS_PER_PIECE;
export const computeFinalControlHours = (): number => FINAL_CONTROL_FIXED_HOURS;
```
**Choice (call site)**: `BodyshopService.create()` is the **single** place that
maps `pieceCount → hours`. `budget-appointments approve()` computes only
`pieceCount = Σ appt.pieces[].qty` and forwards the raw count into `create()` — it
does NOT precompute hours.
**Alternatives considered**: Duplicate the `0.5` rule in both `approve()` and
`create()`; or precompute hours in `approve()`.
**Rationale**: One canonical rule site eliminates drift entirely. The helper stays
exported and pure for unit tests and any future call site. FINAL_CONTROL (fixed
0.5h) is injected unconditionally by `create()` for every bodyshop entry (final QA
gate of every OT); POLISH is injected only when `pieceCount > 0`.

### Decision: Derive the 2 new processes' dashboard hours from `entry.processes` jsonb — no new entity columns
**Choice**: Capacity/balance methods read a 5-slot hour vector via a new private
helper `entryHoursByProcess(e): Record<BalanceProcess, number>` that reads
`entry.processes` (jsonb, already written with all 5 codes by `create()`), falling
back to the `bodyworkHours/prepHours/paintHours` columns for legacy entries.
**Alternatives considered**: Add `polishHours`/`finalControlHours` columns to
`bodyshop_entry` + entity + migration.
**Rationale**: `processes` jsonb is already the source of truth `create()`
populates; deriving avoids a second entity migration and keeps rollback purely
additive. No column drops, no data backfill.

### Decision: `bodyshop_processes.sequence` namespace is independent of `BODYSHOP_PROCESS_ORDER`
**Choice**: Migration assigns `POLISH=4`, `FINAL_CONTROL=5` in the
`bodyshop_processes` catalog table (Chapería 1 → Prep 2 → Pintura 3 → Pulida 4 →
Control Final 5). This is a DIFFERENT map from `BODYSHOP_PROCESS_ORDER` in
`tracking.service.ts` (which reserves 5=MECHANIC, 6=FINAL_CONTROL in its own
display-ordering namespace).
**Rationale**: No real collision — they are separate tables/maps consumed by
separate code paths (`simulate()` scheduling order vs. tracking display order).
Documented explicitly so implementers do not "align" the two numbers. `tracking.
service.ts` needs **zero** changes (verified: names/order/processType already
correct; MOTHER default is correct for the sequential flow).

## Data Flow

### Flow A — Approve budget → entry with Pulida/Control Final
```
Perito UI ─approve(id)─▶ BudgetAppointmentsService.approve()
  processes → bodyworkHours/prepHours/paintHours  (LEGACY_CODES, invoice source)
  pieceCount = Σ appt.pieces[].qty                (NOT from processes)
  extraProcesses = processes minus LEGACY_CODES   (never POLISH/FINAL_CONTROL)
        │  create({ ...legacyHours, pieceCount, extraProcesses })
        ▼
BodyshopService.create()
  polishHours        = computePolishHours(pieceCount)      (if pieceCount>0)
  finalControlHours  = computeFinalControlHours()          (always, 0.5)
        │  simulate({ bodyworkHours, prepHours, paintHours,
        │             polishHours, finalControlHours, ... })
        ▼
BodyshopScheduleService.simulate()
  hoursByCode += POLISH, FINAL_CONTROL
  sequential loop books slots after PAINT (sequence 4,5)
  ─▶ slots + stayDays + estimatedFinishDate  (now include Pulida/Control Final)
        ▼
  entry.processes jsonb = all 5 codes   ·   slots persisted   ·   invoice untouched
```

### Flow B — Direct Agenda entry with manual piece count
```
BodyshopNewForm (step 2) ─▶ "Cantidad de piezas" input (pieceCount, required, >0)
  create.mutateAsync({ bodyworkHours, prepHours, paintHours, pieceCount })
        ▼
POST /bodyshop  → CreateBodyshopEntryDto.pieceCount (validated ≥ 1 when chapería)
        ▼
BodyshopService.create()  ── identical downstream path as Flow A ──▶ simulate() …
```

## File Changes

| File | Action | Change |
|------|--------|--------|
| `apps/api/src/modules/bodyshop/bodyshop-hours.util.ts` | Create | Pure hour-rule helpers |
| `apps/api/src/database/migrations/008_bodyshop_seed_final_control.ts` | Create | Idempotent INSERT of POLISH(4)+FINAL_CONTROL(5) |
| `apps/api/src/modules/bodyshop/bodyshop-schedule.service.ts` | Modify | `SimulateInput` +2 fields; `hoursByCode` +2 keys; `SPECIALTY_TO_CODE` FINAL_CONTROL alias; `DEFAULT_PROCESSES` +FINAL_CONTROL |
| `apps/api/src/modules/bodyshop/bodyshop.service.ts` | Modify | `CreateBodyshopEntryDto.pieceCount`; `create()` derive+inject POLISH/FINAL_CONTROL + pass to `simulate()`; **PR2**: widen `BalanceProcess` 3→5, `PROCESS_LABEL`, `SPECIALTY_TO_PROCESS`, `techProcess()`, `entryHoursByProcess()`, `computeDayCapacity()`, `getTechnicianAvailability()`, `getMonthlyReport()`, `getSchedule()` `processWindows`, auto-assign of Pulido/Control-Final techs |
| `apps/api/src/modules/budget-appointments/budget-appointments.service.ts` | Modify | `approve()` compute `pieceCount = Σ pieces[].qty`; pass into `create()`; keep out of `processes` |
| `apps/web/.../appointments/new/page.tsx` | Modify | "Cantidad de piezas" field + wire into create call |
| `apps/web/src/components/appointments/technician-create-dialog.tsx` | Modify | +PULIDO/CONTROL_FINAL specialty |
| `apps/web/src/app/(dashboard)/settings/technicians/page.tsx` | Modify | +PULIDO/CONTROL_FINAL specialty + `isPolish/isFinalControl` SpecialtyBadge branches |
| `apps/api/src/__tests__/bodyshop-schedule.service.spec.ts` | Modify | New cases: POLISH/FINAL_CONTROL book real slots |
| `apps/api/src/__tests__/bodyshop.service.spec.ts` | Modify | pieceCount→hours; dashboards reflect 5 processes; invoice-isolation regression |

## Interfaces / Contracts

```ts
// SimulateInput (added)
polishHours: number;
finalControlHours: number;

// CreateBodyshopEntryDto (added)
@IsOptional() @IsNumber() @Min(0)
pieceCount?: number;   // required (>0) from UI when chapería; Σ qty from approve()

// bodyshop.service.ts (PR2)
type BalanceProcess = 'BODYWORK' | 'PREP' | 'PAINT' | 'POLISH' | 'FINAL_CONTROL';
```

`SPECIALTY_TO_CODE` gains `FINAL_CONTROL: 'FINAL_CONTROL', CONTROL_FINAL:
'FINAL_CONTROL', 'CONTROL FINAL': 'FINAL_CONTROL'`. `SPECIALTY_TO_PROCESS` gains
`PULIDO/POLISH → 'POLISH'` and the FINAL_CONTROL aliases.

### Migration 008 (idempotent)
```sql
INSERT INTO bodyshop_processes (id, name, code, sequence, type, active)
VALUES
  (gen_random_uuid(), 'Pulida',        'POLISH',        4, 'MOTHER', true),
  (gen_random_uuid(), 'Control Final', 'FINAL_CONTROL', 5, 'MOTHER', true)
ON CONFLICT (code) DO NOTHING;   -- code has UNIQUE; POLISH already present is a no-op
```
Class name `BodyshopSeedFinalControl1753900000000` (timestamp > 007's
`1753650000000`). `down()` deletes `WHERE code = 'FINAL_CONTROL'` only (POLISH
predates this change). `type='MOTHER'` matches the sequential flow.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `computePolishHours/computeFinalControlHours` | Pure fn table tests (0, 1, N pieces) |
| Unit | `simulate()` books POLISH(0.5×n)+FINAL_CONTROL(0.5) after PAINT | Extend spec mock `processRepo.find` to 5 rows; assert slots/stayDays/finish shift |
| Integration | `approve()` derives pieceCount from `pieces`, never from `processes` | Assert invoice hours unchanged; POLISH absent from `appt.processes` |
| Integration | dashboards reflect 5 processes | `computeDayCapacity`/`getMonthlyReport`/`processWindows` include POLISH/FINAL_CONTROL |
| Regression | existing `totalPlannedHours` extras test | Must stay green unmodified |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file
classification, or process-integration boundary. Pure in-process domain logic +
one additive DB migration.

## Migration / Rollout

Additive. Migration 008 inserts catalog rows only (idempotent). Rollback: revert
PRs → 3-process behavior restored, new fields ignored; `down()` removes
FINAL_CONTROL row. `varchar(20)` slot `process` fits `'FINAL_CONTROL'` (13). No
column drops, no data loss, budgets/invoices never touched.

### Chained PR plan (delivery_strategy = auto-forecast, >400-line risk: HIGH)
- **PR1 — core engine (end-to-end minimal slice)**: `bodyshop-hours.util.ts`,
  migration 008, `bodyshop-schedule.service.ts` (SimulateInput/hoursByCode/
  SPECIALTY_TO_CODE/DEFAULT_PROCESSES), `create()` pieceCount plumbing +
  `CreateBodyshopEntryDto.pieceCount`, `approve()` pieceCount computation, backend
  scheduling specs. `BalanceProcess` stays at 3 here (untouched) so the type widen
  does not bleed in. POLISH/FINAL_CONTROL slots are booked; dedicated-tech
  auto-assign for them deferred to PR2 (best-effort, non-blocking).
- **PR2 — capacity dashboards**: atomic widen `BalanceProcess` 3→5 + all
  `Record<BalanceProcess>` initializers, `PROCESS_LABEL`, `SPECIALTY_TO_PROCESS`,
  `techProcess()`, new `entryHoursByProcess()` (jsonb-derived), `computeDayCapacity`
  5-stage sequential day model, `getTechnicianAvailability`, `getMonthlyReport`,
  `getSchedule` processWindows, POLISH/FINAL_CONTROL auto-assign, dashboard specs.
- **PR3 — frontend**: "Cantidad de piezas" field + both `BODYSHOP_SPECIALTIES`
  lists (lockstep) + `SpecialtyBadge` `isPolish/isFinalControl` branches.

PR1 + PR3 form the minimal working direct-Agenda slice; PR2 makes the new load
visible on balance screens. Each slice has autonomous scope, tests, and rollback.

## Open Questions

- [ ] Graceful-degrade confirmed (decision 2): no dedicated Pulido/Control-Final
  tech → WARN, do not block. `simulate()` pushes "Sin técnicos disponibles" and
  skips — acceptable for v1 (entry still created via other processes' first slot).
- [ ] `pieceCount` required only when Chapería (BODYWORK) is part of the job;
  validation is conditional (`@ValidateIf`) — confirm with spec's acceptance
  scenarios in sdd-tasks.
