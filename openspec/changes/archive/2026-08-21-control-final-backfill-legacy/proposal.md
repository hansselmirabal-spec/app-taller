# Proposal: Backfill FINAL_CONTROL tracking logs on legacy bodyshop entries

## Intent

`chaperia-pulida-control-final` added Control Final as a real process, but
`TrackingService.initForBodyshop()` (`tracking.service.ts:205-233`) returns early
when an entry already has ANY `TrackingLog`. Every bodyshop entry created before
that feature therefore skips Control Final forever: cards jump straight to done,
the last quality gate is never recorded, and productivity reports understate work.
`getBoard()` only auto-initializes entries with ZERO logs, so this never self-heals.
A one-off backfill is the only path.

## Scope

### In Scope
- One-off script `apps/api/src/database/backfill-final-control.ts` (+ `db:backfill:final-control` npm script).
- Selection query: entries with >=1 `tracking_log` but none with `process_code='FINAL_CONTROL'` (`e.id::text` cast required).
- Insert `FINAL_CONTROL`, `orderIndex 6`, `processType MOTHER`, `plannedHours 0.5`, status per decision below.
- Dry-run by default; `--apply` required to write. Single wrapping transaction.
- Audit file listing touched `entryId`s, enabling a targeted revert.

### Out of Scope
- Changing `initForBodyshop()`'s one-shot guard (separate hardening change).
- Backfilling any other missing process code.
- Frontend/board changes; scheduled or recurring reconciliation jobs.

## Capabilities

### New Capabilities
- `bodyshop-final-control-backfill`: selection criteria, per-status insert policy, dry-run/apply contract, idempotency, transaction and audit-trail requirements for the one-off backfill.

### Modified Capabilities
- None.

## Approach

Exploration **Approach 1** (approved): standalone script following the existing
`db:seed:*` pattern (`ts-node -r tsconfig-paths/register`, raw `DataSource`, no
`NestFactory`). Inserting the log as `pending` is sufficient for any non-terminal
entry: `completeProcess()` already advances to the next pending MOTHER by
`orderIndex ASC`, and a pending step 6 correctly breaks `buildCard()`'s
`allMothersDone`, so cards route into the Control Final column instead of `__DONE__`.

TypeORM migration (Approach 2) rejected: the inserted state depends on a
conditional per-row read, encodes an unresolved business decision, and is hard to
revert once PROD data advances.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/database/backfill-final-control.ts` | New | Backfill script (dry-run default) |
| `apps/api/package.json` | Modified | `db:backfill:final-control` script |
| `apps/api/src/__tests__/` | New | Selection + status-policy tests |
| PROD/QAS `tracking_logs` | Data | Additive INSERTs only |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Closed cards resurface on live kanban | Low | Already mitigated by query: `getBoard()` excludes `status IN ('done','cancelled')` and cuts at 60 days |
| Dangling `pending` row in historical detail (`getCardProcesses`) | Med | Cosmetic; governed by the open decision below |
| Accidental write in PROD | Med | Dry-run default, `--apply` gate, transaction, audit file |
| Double execution | Med | Selection query is inherently idempotent (skips entries already having FINAL_CONTROL) |
| Distorted productivity metrics | Med | Depends on decision below; `pending`/`skipped` stay out of completed metrics |

## Rollback Plan

Delete rows matching `source_type='bodyshop' AND process_code='FINAL_CONTROL' AND
source_id IN (<audit file ids>)`. No schema change, no updates to pre-existing rows,
so revert is exact and lossless.

## Dependencies

- `chaperia-pulida-control-final` deployed (FINAL_CONTROL catalog row present).
- PROD/QAS DB access to run the script.

## Success Criteria

- [ ] Dry-run reports the exact affected universe with zero writes.
- [ ] After `--apply`, every in-scope entry has exactly one FINAL_CONTROL log.
- [ ] Active bodyshop cards show the Control Final column.
- [ ] Re-running the script reports 0 pending entries.
- [ ] Audit file written and revert verified in QAS before PROD.

## Proposal question round

**Only open decision — needs the user, not the agent.** What should the backfill do
with entries already `status='done'` (vehicle delivered)?

| Option | Effect | Tradeoff |
|---|---|---|
| (a) Insert as `pending` (same as active) | Uniform, simple | Leaves a permanently pending step on a closed entry in historical detail views |
| (b) Insert as `completed` with synthetic timestamps | Preserves productivity-report continuity | Fabricates work events that never happened |
| (c) Insert as `skipped` | Clean "N/A" marker, excluded from completed metrics | Reports show a gap; historically the step truly did not run |
| (d) Exclude `done` entries entirely | Zero fabricated data | Those entries never show Control Final in history |

Verified from exploration: `TrackingLog.status` enum is
`pending | in_progress | blocked | completed | skipped`, so **option (c) is
technically available** — no schema change needed.

**Assumption pending confirmation**: entries with `status='cancelled'` are EXCLUDED
from the backfill (a cancelled job has no quality gate to record). Confirm or override.

Secondary (answer only if you want to narrow scope): should the backfill be limited
to entries within the 60-day board window, or cover the full history?
