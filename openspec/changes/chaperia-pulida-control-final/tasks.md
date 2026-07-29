# Tasks: Chapería — Pulida + Control Final as Real-Capacity Processes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950 total (PR1 ~330, PR2 ~420, PR3 ~120) |
| 400-line budget risk | High (per-PR: PR1 Medium, PR2 High, PR3 Low) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 (already decided in design, not reopened) |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Note: split and chain order were already resolved in design's "Chained PR plan" section under `delivery_strategy=auto-forecast`; this forecast documents, not re-decides, that outcome.

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|-----------------------|-----------------|--------------------|
| 1 | Core engine: helper, migration, `simulate()`, `create()`/`approve()` pieceCount plumbing | PR1 | `pnpm --filter api test bodyshop-schedule bodyshop.service budget-appointments` | Manual: approve a 4-piece budget, confirm entry `processes` jsonb has 5 codes, slots booked through FINAL_CONTROL | Revert PR1 → 3-process behavior restored; migration `down()` drops FINAL_CONTROL row only |
| 2 | Capacity dashboards widened to 5 processes | PR2 | `pnpm --filter api test bodyshop.service` | Manual: `getDayCapacity`/`getMonthlyReport` for a day with POLISH bookings shows the 2 new rows | Revert PR2 → `BalanceProcess` back to 3; PR1 booking behavior unaffected |
| 3 | Frontend: pieceCount field + specialty lists + badge | PR3 | N/A — no frontend test harness in repo | Manual QA: direct-Agenda Chapería submit blocked without pieceCount; technician settings shows Pulido/Control Final options | Revert PR3 → form/labels revert; backend unaffected |

## PR1: Core Engine (bodyshop-hours.util, migration 008, simulate/create/approve)

- [x] 1.1 RED `apps/api/src/__tests__/bodyshop-hours.util.spec.ts`: table tests `computePolishHours(0/1/4)`→0/0.5/2.0, `computeFinalControlHours()`→0.5
- [x] 1.2 GREEN create `apps/api/src/modules/bodyshop/bodyshop-hours.util.ts` per design (pure helpers)
- [x] 1.3 Create `apps/api/src/database/migrations/008_bodyshop_seed_final_control.ts` — idempotent `INSERT ... ON CONFLICT (code) DO NOTHING`, class `BodyshopSeedFinalControl1753900000000`, `down()` deletes `WHERE code='FINAL_CONTROL'` only
- [x] 1.4 RED `bodyshop-schedule.service.spec.ts`: extend `processRepo.find` mock to 5 rows; assert `simulate()` books POLISH(0.5×n)+FINAL_CONTROL(0.5) after PAINT, `stayDays`/`estimatedFinishDate` shift
- [x] 1.5 GREEN `bodyshop-schedule.service.ts`: `SimulateInput` +`polishHours`/`finalControlHours`; `hoursByCode` +2 keys; `SPECIALTY_TO_CODE` +`FINAL_CONTROL`/`CONTROL_FINAL` aliases; `DEFAULT_PROCESSES` +FINAL_CONTROL row
- [x] 1.6 RED `bodyshop.service.spec.ts`: `create()` with `pieceCount` derives+forwards polish/finalControl hours (budget-derived + direct-Agenda scenarios); missing/invalid `pieceCount` on a Chapería (BODYWORK>0) entry rejected
- [x] 1.7 GREEN `bodyshop.service.ts`: `CreateBodyshopEntryDto.pieceCount` (`@IsOptional @IsNumber @Min(0)`, `@ValidateIf(o => o.bodyworkHours > 0)` required `>0`); `create()` computes `polishHours` via helper when `pieceCount>0`, `finalControlHours` always, passes both to `simulate()`
- [x] 1.8 RED `budget-appointments.service.spec.ts`: `approve()` derives `pieceCount = Σ appt.pieces[].qty` (never from `processes`), forwards to `create()`; `appt.processes` unchanged after approve incl. manual "Pulido" line
- [x] 1.9 GREEN `budget-appointments.service.ts` `approve()`: compute `pieceCount`, pass into `bodyshopService.create()` call, keep out of `processes`
- [x] 1.10 Regression: confirm existing `totalPlannedHours`/extras test in `bodyshop.service.spec.ts` stays green unmodified
- [x] 1.11 Verify: `pnpm --filter api test`, `pnpm --filter api typecheck`

## PR2: Capacity Dashboards (BalanceProcess 3→5)

- [x] 2.1 RED `bodyshop.service.spec.ts`: `computeDayCapacity`/`getWeekCapacity` include POLISH+FINAL_CONTROL in `byProcess`
- [x] 2.2 GREEN widen `type BalanceProcess` to 5 values; update `PROCESS_LABEL`, `SPECIALTY_TO_PROCESS` (+PULIDO/POLISH, +FINAL_CONTROL/CONTROL_FINAL), all `Record<BalanceProcess>` initializers in `computeDayCapacity()`
- [x] 2.3 GREEN add private `entryHoursByProcess(e)` reading `entry.processes` jsonb (5 codes), fallback to legacy hour columns; wire into `computeDayCapacity()`
- [x] 2.4 RED `getTechnicianAvailability()` spec: `hoursAssigned`/`hoursFree` cover 5 processes
- [x] 2.5 GREEN extend `getTechnicianAvailability()` via `entryHoursByProcess()`
- [x] 2.6 RED `getMonthlyReport()` spec: rows include POLISH/FINAL_CONTROL technicians
- [x] 2.7 GREEN extend `getMonthlyReport()` `techProcess()`/`entryHours()` to 5 processes
- [x] 2.8 RED `getSchedule()` spec: `processWindows` include POLISH/FINAL_CONTROL windows
- [x] 2.9 GREEN extend `getSchedule()` `baseDailyCap`/`processWindows`/`procOrder` to 5 processes
- [x] 2.10 GREEN extend `create()` auto-assign `processAssignments` loop with POLISH/FINAL_CONTROL techs (best-effort try/catch, non-blocking)
- [x] 2.11 RED spec: no dedicated POLISH tech → entry created + warning surfaced, not blocked
- [x] 2.12 GREEN confirm `simulate()`/`create()` warning propagates when POLISH/FINAL_CONTROL `dailyCap=0`
- [x] 2.13 Verify: `pnpm --filter api test`, `pnpm --filter api typecheck`

## PR3: Frontend

- [x] 3.1 `apps/web/.../appointments/new/page.tsx`: add `pieceCount` state near hours stepper (~line 1449), input field required when `bodyworkH>0`, wire into `create.mutateAsync` payload
- [x] 3.2 `technician-create-dialog.tsx` + `settings/technicians/page.tsx`: add `PULIDO`/`CONTROL_FINAL` to both `BODYSHOP_SPECIALTIES` lists in lockstep (lines ~12 and ~16)
- [x] 3.3 `settings/technicians/page.tsx`: extend `specialtyToText()` and `SpecialtyBadge()` with `isPolish`/`isFinalControl` branches + colors
- [x] 3.4 Manual QA: direct-Agenda Chapería submit without `pieceCount` blocked; technician settings shows new specialties with distinct badge colors — **NOTE: not executed by this agent** (no frontend test/browser harness available in this environment); code-level verification only (`step2Valid` gates the "Siguiente" button on `pieceCountN > 0` when `bodyworkH > 0`; `BODYSHOP_SPECIALTIES` + `SpecialtyBadge` verified by direct code read + `tsc --noEmit` clean). Recommend a maintainer/QA pass in a running instance before merge.
