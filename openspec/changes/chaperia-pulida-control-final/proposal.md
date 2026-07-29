# Proposal: Chapería — Pulida + Control Final as real-capacity processes

## Intent

Bodyshop (Chapería) scheduling reserves real technician capacity for only 3 of the
5 real steps: BODYWORK → PREP → PAINT. **Pulida** (Polish) and **Control Final**
(Final Control) happen in the shop and consume real technician time, but today they
either book zero capacity (POLISH is in the catalog yet `simulate()` never assigns
it hours) or don't exist at all (no FINAL_CONTROL row). Result: stay days,
finish dates, dedicated-tech load and capacity dashboards under-count real work, so
the shop over-promises delivery. This change makes both steps consume real
capacity across the full sequence Chapería→Prep→Pintura→Pulida→Control Final,
without touching customer-facing budget/invoice hours.

## Scope

### In Scope
- `simulate()` books real slots for **POLISH** and **FINAL_CONTROL** (5-process sequential model), feeding stayDays / estimatedFinishDate.
- **Pulida hours** = `0.5 × pieceCount`; from budget: sum of `BudgetPiece.qty`; from direct Agenda: manual "Cantidad de piezas" field. **Control Final** = fixed `0.5h`, always, injected server-side.
- Migration to insert the missing `FINAL_CONTROL` row into already-seeded `bodyshop_processes` (QAS/PROD).
- **(Scope decision 1)** Extend capacity/balance screens — `getDayCapacity`, `getWeekCapacity`, `getTechnicianAvailability`, `getMonthlyReport`, and `getSchedule` `processWindows` — to include POLISH/FINAL_CONTROL alongside BODYWORK/PREP/PAINT.
- **(Scope decision 2)** No dedicated Pulido/Control-Final tech → **warn, do not block** entry creation (same graceful-degrade as any process without capacity today).
- Frontend: "Cantidad de piezas" input in the direct-Agenda wizard; add PULIDO/CONTROL_FINAL to both duplicated `BODYSHOP_SPECIALTIES` lists + `SpecialtyBadge` branches.

### Out of Scope
- Post-creation editing of piece count / POLISH resize (`updateHours()` untouched — v1 fixes count at creation).
- Generalizing `simulate()` to a generic process map (exploration Approach 2, deferred).
- Any customer-facing budget/invoice hour changes — Pulida/Control Final are operational-only, never billed.
- Mecánica and other parallel processes.

## Capabilities

### New Capabilities
- `bodyshop-scheduling`: technician-capacity booking for the bodyshop process sequence, now covering all 5 sequential steps including POLISH and FINAL_CONTROL, their hour derivation rules, and their visibility on capacity/balance screens.

### Modified Capabilities
- None (no prior specs exist in `openspec/specs/`).

## Approach

Exploration **Approach 1** (targeted extension of the hardcoded 3→5 process model),
**amplified** to also cover the capacity/balance screens per scope decision 1:
- `bodyshop-schedule.service.ts`: add POLISH/FINAL_CONTROL to `SimulateInput` (explicit hours), `hoursByCode`, `DEFAULT_PROCESSES`, and a FINAL_CONTROL alias in `SPECIALTY_TO_CODE`. The existing sequential loop over `processRepo.find({active})` in `sequence` order books them after PAINT once given nonzero hours.
- `bodyshop.service.ts`: `create()` accepts piece count / precomputed hours and forwards them into `simulate()` (not just informational `extraProcesses`). Extend `BalanceProcess` type, `PROCESS_LABEL`, `SPECIALTY_TO_PROCESS`, `techProcess()`, `computeDayCapacity()`, `getTechnicianAvailability()`, `getMonthlyReport()`, `getSchedule` `processWindows` from 3 to 5 processes.
- `budget-appointments.service.ts` `approve()`: compute `pieceCount = Σ appt.pieces[].qty`, pass POLISH = `0.5×pieceCount` + FINAL_CONTROL = `0.5` into `create()`, **kept out of `appt.processes`** so nothing leaks to the invoice.
- Frontend wizard field + both specialty lists + badge branches.
- `tracking.service.ts`: **no changes** (names/order/processType already correct); regression-test only.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/.../bodyshop/bodyshop-schedule.service.ts` | Modified | 5-process `simulate()`, hours + specialty maps, seed array |
| `apps/api/src/database/migrations/008_*.ts` | New | Insert `FINAL_CONTROL` row into `bodyshop_processes` |
| `apps/api/.../bodyshop/bodyshop.service.ts` | Modified | `create()` plumbing + 4 capacity-dashboard methods + processWindows |
| `apps/api/.../budget-appointments/budget-appointments.service.ts` | Modified | `approve()` computes piece-based POLISH + fixed FINAL_CONTROL |
| `apps/web/.../appointments/new/page.tsx` | Modified | "Cantidad de piezas" field for no-budget path |
| `apps/web/.../technician-create-dialog.tsx`, `settings/technicians/page.tsx` | Modified | Add PULIDO/CONTROL_FINAL specialties + badge branches (lockstep) |
| `apps/api/src/__tests__/bodyshop*.spec.ts` | Modified | New cases for POLISH/FINAL_CONTROL booking |
| `apps/api/.../tracking/tracking.service.ts` | Regression only | No edits; re-test |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Review budget >400 lines (5-process dashboards + frontend) | High | Recommend chained PRs (see `risks` in return envelope) |
| Migration `sequence` collision — tracking `FINAL_CONTROL:6` reserves 5 for MECHANIC in a *different* map | Med | Assign `bodyshop_processes.sequence` consistent with catalog order (POLISH=4, FINAL_CONTROL=5) after PAINT; confirm no unique-sequence constraint clash in migration |
| POLISH/FINAL_CONTROL leak into customer invoice via manual `processes` line | Med | `approve()` derives these strictly from `pieces`; exclude the 2 codes from customer-facing/billable filtering |
| `pieceCount` = 0/invalid → zero POLISH hours | Med | Validate `pieceCount > 0`; direct-Agenda field required when Chapería selected |
| No dedicated tech → silent skip | Low | Per decision 2, surface a **warning** (not block); ensure warning is visible in create response |
| Duplicated specialty lists drift | Med | Update both files in the same PR; add regression note |

## Rollback Plan

- **Code**: revert the change branch/PRs — the 3-process behavior is fully restored; `create()`/`simulate()` ignore the new fields.
- **DB**: migration 008 is additive (one INSERT). Down-migration deletes the `FINAL_CONTROL` row from `bodyshop_processes`. Existing `BodyshopEntryProcessSlot` rows referencing it (varchar, no FK) become orphaned labels only — harmless; optionally clean in the down step. No column drops, no data loss.
- Feature is behavior-additive: rolling back cannot corrupt existing budgets/invoices (never touched).

## Dependencies

- Migration ordering: 008 follows confirmed-latest `007_budget_appointments_add_pieces.ts`.
- `BudgetPiece.qty` field (from 007) is the source for budget-path piece count — already present.

## Success Criteria

- [ ] A Chapería entry (budget or direct) books real capacity for Pulida (`0.5×pieces`) and Control Final (`0.5`), reflected in stayDays / estimatedFinishDate.
- [ ] QAS/PROD have a `FINAL_CONTROL` row after migration; POLISH books nonzero hours.
- [ ] Capacity/balance screens show POLISH/FINAL_CONTROL load alongside the legacy 3.
- [ ] Customer-facing budget/invoice hours are unchanged (regression test green).
- [ ] Workshop with no dedicated tech gets a warning, entry still created.
