# Proposal: Return a Kanban card to the immediately previous process

## Intent

When a bodyshop car reaches a MOTHER process (e.g. PREP) and the workshop discovers the previous stage (BODYWORK) was left incomplete or defective, there is no way to send it back. Today `completeProcess()` is terminal and irreversible: the only workarounds are leaving the card in the wrong column or faking a pause, both of which corrupt the timeline and keep an idle technician counted as occupied. Workshop supervisors need an auditable "send back one step" action that preserves both passes as history and frees the abandoned pass's capacity.

## Scope

### In Scope
- New supervisor-only action "Devolver a proceso anterior" on the Kanban card detail, restricted to the **immediately previous** MOTHER process by `orderIndex`.
- Single confirmation step capturing **mandatory reason** (dropdown, `PAUSE_REASONS` pattern) **and** the technician for the reopened process.
- New terminal `'returned'` status on `TrackingLog`: the current log is marked returned (never deleted or reset) and its `bodyshop_process_techs` row is deleted, releasing capacity.
- A **new** log for the previous process created `in_progress` with the chosen technician plus a `bodyshop_process_techs` upsert; the original first-pass log stays intact as history.
- `completeProcess()` fallback: when no plain `pending` MOTHER exists, recreate as pending the `'returned'` MOTHER log with the **smallest** `orderIndex` greater than the just-completed one.
- Stable chronological ordering (`orderIndex` then `createdAt`) wherever two logs share a `processCode`.

### Out of Scope
- Returning to any non-adjacent earlier process.
- Returning parallel (non-MOTHER) processes.
- Changing capacity math, `BALANCE_PROCESSES`, or introducing a capacity reservation table.
- Notifications/toasts on return; reporting on return frequency.

## Capabilities

### New Capabilities
- `tracking-return-to-previous-process`: returning a bodyshop card one MOTHER step back with mandatory reason, explicit technician reassignment, capacity release, dual-pass history, and re-generation of the returned process on re-completion.

### Modified Capabilities
- None (no existing spec covers the tracking/kanban flow).

## Approach

Exploration Approach 1, single-step return + explicit reassignment. One transactional `returnToProcess()` in `tracking.service.ts`: (a) current log → `status:'returned'` + reason; (b) delete `bodyshop_process_techs(entryId, currentProcessCode)` — the same capacity-release call `pauseLog()` already uses; (c) create the previous-process log `in_progress` with the picked technician; (d) upsert `bodyshop_process_techs(entryId, targetProcessCode)` — the same pattern `unblockProcess()` uses. A dedicated endpoint (not the generic "Iniciar") is required so `resolveAssignedTechnician()` can never silently reuse the first-pass technician. `completeProcess()` gains the returned-log fallback so the returned process reappears once the reopened stage completes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/modules/tracking/tracking-log.entity.ts` | Modified | Widen `status` union with `'returned'` (varchar(20), no CHECK, no migration) |
| `apps/api/src/modules/tracking/tracking.service.ts` | Modified | New `returnToProcess()`; `completeProcess()` returned-log fallback; secondary `createdAt` sort in `buildCard()` |
| `apps/api/src/modules/tracking/tracking.controller.ts` | Modified | `PATCH process/:logId/return` + DTO (required `reason`, `technicianId`), `@Roles('admin','admin_taller')` |
| `apps/web/src/app/(dashboard)/seguimiento/kanban/page.tsx` | Modified | "Devolver a proceso anterior" action gated by `isAdminOrManager()`; `buildTimeline()` secondary sort |
| `apps/web/src/components/kanban/` | New | Return modal (reason + technician), modeled on `PauseModal` + `ResumeTechModal` |
| `apps/web/src/hooks/use-tracking.ts`, `src/lib/api.ts` | Modified | `useReturnProcess` mutation + client call |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Two logs sharing `processCode`/`orderIndex` render out of chronological order (`buildCard()`/`buildTimeline()` sort only by `orderIndex`) | High | Add `createdAt` ASC as secondary sort key everywhere `orderIndex` is the sole display sort; regression test on the two-pass timeline |
| `'returned'` accidentally treated like `'skipped'`, making `allMothersDone` true and letting an incomplete card reach "Entregado" | Med | Explicit spec scenario + regression test: `'returned'` counts as NOT complete; `'skipped'` unchanged |
| `completeProcess()` fallback picks the wrong returned log when multiple returns stack | Med | Rule: smallest `orderIndex` among `'returned'` MOTHER logs greater than the just-completed one; dedicated spec scenario + test |
| Stale `bodyshop_process_techs` row lets the generic "Iniciar" silently reuse the first-pass technician | Med | Dedicated endpoint forces explicit technician; return transaction deletes the abandoned row |
| Planned/real hours double-count across two passes | Low | Verified business-correct in `buildCard()` — both passes legitimately sum; assert in test rather than change |

## Rollback Plan

Backend is purely additive: no migration (the `status` column is `varchar(20)` with no CHECK constraint). Revert the controller endpoint, `returnToProcess()`, the `completeProcess()` fallback, and the entity union to disable the feature. Any log already persisted as `'returned'` remains readable but stops being special-cased — before deploying a revert, run a one-off update setting surviving `'returned'` logs to `'blocked'` with the return reason preserved, so no card is stranded outside the known status set. Frontend changes (modal, action button, hook, sort key) are additive and revert cleanly.

## Dependencies

- None external. Reuses shipped `pauseLog()` capacity release, `unblockProcess()` technician upsert, `RolesGuard`/`@Roles`, and `isAdminOrManager()`.

## Success Criteria

- [ ] An `admin`/`admin_taller` user can return a card from a MOTHER process to the immediately previous one, supplying a mandatory reason and a technician in one confirmation.
- [ ] The returned pass is preserved as a `'returned'` log; the first pass of the reopened process remains intact; a new `in_progress` log appears for the reopened process.
- [ ] The returned process's technician is freed on capacity/availability screens immediately after confirmation.
- [ ] Completing the reopened process regenerates the returned process as pending (smallest `orderIndex` among returned logs).
- [ ] A card with any `'returned'` log cannot reach "Entregado" until that process is completed again.
- [ ] The card timeline shows both passes in chronological order.
- [ ] Non-supervisor roles receive 403 and never see the action.
