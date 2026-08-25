# Proposal: Return a Kanban card to any earlier MOTHER process

## Intent

The shipped return action only reaches the **immediately previous** MOTHER process. Real defects are often found two stages later: from Pintura, a supervisor must be able to send the car back to Chapería directly. Today the only workaround is a chain of single-step returns, which fabricates intermediate passes nobody worked on, pollutes the timeline, and briefly occupies technicians who never touched the car. Supervisors need one confirmation that names the real destination.

## Scope

### In Scope
- Return destination is any MOTHER process with `orderIndex` lower than the current one (deduped by `processCode`, newest pass wins).
- Skipped intermediate MOTHER processes get a **new** `'returned'` log each, created in the same transaction; their original `'completed'` logs stay untouched as history.
- Endpoint DTO gains required `targetProcessCode` (string) alongside existing `reason` / `technicianId`.
- `currentProcess.availableReturnTargets: {processCode, processName, orderIndex}[]` replaces `previousProcessName`.
- Return modal gains a destination selector shown before reason/technician; the card button opens the modal instead of firing a fixed single-destination action.

### Out of Scope
- Returning to `AGENDA` — Chapería (`orderIndex` 1) is the earliest valid destination.
- Returning to or from PARALLEL processes.
- Changes to `completeProcess()` — its unified resolver already reactivates stacked `'returned'` logs by smallest `orderIndex`.
- New migration, schema change, or backfill; capacity math; notifications.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `tracking-return-to-previous-process`: "Return scope limited to immediate previous MOTHER process" becomes "return to any earlier MOTHER process"; single-transaction execution extends to creating `'returned'` logs for skipped intermediates.

### Renamed Capabilities
- None (capability keeps its name; only requirements change).

## Approach

Exploration Approach 1 (approved). Generalize private `pickPreviousMother()` → `listAvailableMothers()`: same filters (`processType !== 'PARALLEL'`, `processCode !== 'AGENDA'`, `orderIndex <` current), but return the full deduped list instead of `[0]`. Processes planned at 0 hours never produce logs (`initForBodyshop()` filters them), so they are excluded for free.

`returnToProcess()` keeps its single `withTechnicianLock()` transaction and additionally iterates every MOTHER strictly between current and target, inserting one `'returned'` log per skipped process before creating the destination's `in_progress` log. Chaining N calls to the existing singular endpoint was rejected: it breaks the atomicity requirement already in spec and can trip migration 011's partial unique index mid-chain.

`canReturn` stays in the payload but becomes derived (`availableReturnTargets.length > 0`) so the parallel-placeholder branch and the frontend gate keep working unchanged.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/modules/tracking/tracking.service.ts` | Modified | `pickPreviousMother()` → `listAvailableMothers()`; `returnToProcess()` intermediate-log loop + target validation; `buildCard()` L1108-1144 and the `ProcessSummary` type at L115-116 |
| `apps/api/src/modules/tracking/tracking.controller.ts` | Modified | `ReturnProcessDto` gains `@IsString() @IsNotEmpty() targetProcessCode` |
| `apps/web/src/lib/api.ts` | Modified | `availableReturnTargets` in the tracking types (L1388-1389); `returnTrackingProcess()` payload |
| `apps/web/src/components/kanban/return-process-modal.tsx` | Modified | Destination selector (radio list, `RETURN_REASONS` visual pattern) replacing the fixed `previousProcessName` prop |
| `apps/web/src/app/(dashboard)/seguimiento/kanban/page.tsx` | Modified | Button label/gate (L1253-1257), `returnModal` state and `handleReturnOpen`/`handleReturnConfirm` (L1859, L1942-1955, L2045) |
| `apps/api/src/__tests__/tracking.service.spec.ts` | Modified | L1638-1674 `canReturn`/`previousProcessName` suite rewritten for `availableReturnTargets` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A skipped intermediate is not `'completed'` at return time (unreachable today — a higher-`orderIndex` MOTHER only activates after all earlier ones complete) but becomes reachable if that invariant changes | Low | Explicit defensive validation in `returnToProcess()` rejecting a non-`completed` intermediate, plus a spec scenario; never assume the invariant silently |
| Client sends a `targetProcessCode` that is not in `availableReturnTargets` (stale card, direct API call) | Med | Server recomputes the list and rejects any target outside it; never trust the request |
| Multiple `'returned'` logs created in one transaction confuse the `completeProcess()` resolver | Low | Confirmed agnostic to origin transaction (`tracking.service.spec.ts:1858` covers two stacked `'returned'` at `orderIndex` 2 and 4); add an end-to-end cascade test PAINT→BODYWORK skipping PREP |
| Migration 011's `tracking_logs_one_in_progress_per_technician` partial unique index fires mid-transaction | Low | Intermediates are inserted as `'returned'`, never `'in_progress'`; only the destination log is `in_progress` |
| Frontend breaks on the removed `previousProcessName` | Low | Typed contract change; `pnpm typecheck` surfaces every call site (6 known) |

## Rollback Plan

Purely additive at the data layer — no migration, no schema change; `'returned'` is already a shipped status. Reverting the commit restores single-destination behavior. Logs written by a multi-hop return remain valid `'returned'` rows that the reverted `completeProcess()` resolver still handles correctly (it already reactivates any stacked `'returned'` by smallest `orderIndex`), so no data cleanup is required — unlike the original change, no `'returned'` → `'blocked'` sweep is needed.

## Dependencies

- Requires the shipped `tracking-return-to-previous-process` capability (archived `2026-08-24-kanban-devolver-proceso-anterior`) as its baseline.

## Success Criteria

- [ ] From Pintura, an `admin`/`admin_taller` user can choose Preparación **or** Chapería as destination in one confirmation.
- [ ] Returning Pintura → Chapería marks Pintura **and** Preparación as `'returned'` and creates one `in_progress` Chapería log with the chosen technician.
- [ ] Completing the reopened Chapería reactivates Preparación, and completing Preparación reactivates Pintura.
- [ ] The whole multi-hop return is one transaction: any failure leaves zero new logs and no capacity change.
- [ ] `AGENDA` never appears as a destination; the first MOTHER process still reports `canReturn: false`.
- [ ] A `targetProcessCode` outside the server-computed list is rejected without side effects.
