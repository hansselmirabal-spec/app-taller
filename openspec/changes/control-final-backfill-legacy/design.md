# Design: Backfill FINAL_CONTROL tracking logs on legacy bodyshop entries

## Technical Approach

Standalone one-shot script `apps/api/src/database/backfill-final-control.ts`, bootstrapped exactly like `bodyshop-workshop.seed.ts`: `import 'reflect-metadata'`, a local `DataSource` (`type: 'postgres'`, `url: process.env.DATABASE_URL || <local default>`, `synchronize: false`), one `QueryRunner`, raw parameterized SQL, run via `ts-node -r tsconfig-paths/register`. No `NestFactory`, no TypeORM migration, no repository layer.

Business rules are locked by the spec: `done` → `skipped`, `cancelled` → excluded, everything else → `pending`.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| 1 | `process.argv` flag parsing, strict: unknown arg → `exit 1` | `commander`/`yargs` | Zero CLI libs in `apps/api/package.json`; adding one for a one-shot script is unjustified. Strict parsing prevents `--apply=true` silently dry-running. |
| 2 | Single transaction for the whole batch | tx per entry | Backfill is one logical fact ("legacy universe now has Control Final"). Partial application would leave an ambiguous state where a re-run's universe differs from the audit file. Volume is small (bounded by legacy entries); all-or-nothing gives an exact rollback point. |
| 3 | Apply = one `INSERT ... SELECT ... RETURNING`, sharing the same predicate constant as dry-run | loop of per-entry `INSERT` | The predicate can never drift between preview and write (same exported SQL fragment), and selection + insert are one atomic statement, so no TOCTOU window inside the run. |
| 4 | Audit file written **before** `COMMIT` | write after commit | A failed disk write must not leave committed rows with no rollback trail. Reverse failure (file written, commit rolled back) is harmless: the rollback `DELETE` is a no-op. |
| 5 | Rollback = documented `DELETE` embedded in the audit file as `rollbackSql`; no second script | `--rollback` mode / revert script | Keeps one untested-in-PROD code path instead of two. The `DELETE` is exact and additive-only. |
| 6 | Do **not** touch `bodyshop_entries.processes` (jsonb) | dual-write like `addProcessToBodyshop` | `processes` jsonb feeds capacity/occupancy math (`bodyshop.service.ts:648`) and schedule slots. Rewriting it retroactively would mutate historical capacity reports — out of scope, and tracking is the only consumer this change targets. |
| 7 | `notes = 'backfill:control-final-backfill-legacy:<runId>'` on every inserted row | no marker | DB-side fallback identification if the audit file is lost. |

## Data Flow

```
argv ──▶ parseArgs ──▶ { apply, outDir }
                          │
        DataSource.initialize ──▶ qr.connect ──▶ qr.startTransaction
                          │
      (1) preview SELECT  ├─ SELECTION_PREDICATE_SQL ──▶ rows[{id,plate,status,logStatus}]
                          │        │
              dry-run ────┘        └── print table + counts ──▶ ROLLBACK, exit 0
                          │
      (2) INSERT..SELECT  ├─ same predicate ─ RETURNING id, source_id, status
      (3) guard           ├─ inserted.length === preview.length ? : throw
      (4) audit file      ├─ fs.writeFileSync(<outDir>/backfill-final-control-<runId>.json)
      (5) COMMIT          ▼
                    stdout mirror of the same JSON
        any throw ──▶ ROLLBACK ──▶ exit 1 (no rows, no audit file)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/database/backfill-final-control.ts` | Create | Script + exported pure helpers (`parseArgs`, `resolveLogStatus`, `SELECTION_PREDICATE_SQL`, `buildAuditPayload`), bootstrap under `if (require.main === module)` so tests can import without connecting. |
| `apps/api/package.json` | Modify | `"db:backfill:final-control": "ts-node -r tsconfig-paths/register src/database/backfill-final-control.ts"` |
| `apps/api/src/__tests__/backfill-final-control.spec.ts` | Create | Unit specs (mocked QueryRunner, per existing spec style). |
| `.gitignore` | Modify | Add `backfill-audit/` (audit output is operational data, never committed). |

Invocation: `pnpm --filter @app-taller/api db:backfill:final-control` (dry-run) / `... -- --apply`.

## Interfaces / Contracts

Shared predicate (single source of truth for dry-run and apply):

```sql
FROM bodyshop_entries e
WHERE COALESCE(e.status, 'scheduled') <> 'cancelled'
  AND EXISTS (SELECT 1 FROM tracking_logs tl
              WHERE tl.source_type = 'bodyshop' AND tl.source_id = e.id::text)
  AND NOT EXISTS (SELECT 1 FROM tracking_logs tl2
                  WHERE tl2.source_type = 'bodyshop' AND tl2.source_id = e.id::text
                    AND tl2.process_code = 'FINAL_CONTROL')
```

Apply statement:

```sql
INSERT INTO tracking_logs
  (id, source_type, source_id, process_name, process_code, order_index,
   planned_hours, status, process_type, started_at, completed_at,
   technician_id, technician_name, notes)
SELECT gen_random_uuid(), 'bodyshop', e.id::text, 'Control Final', 'FINAL_CONTROL', 6,
       $1, CASE WHEN e.status = 'done' THEN 'skipped' ELSE 'pending' END,
       'MOTHER', NULL, NULL, NULL, NULL, $2
<predicate above>
RETURNING id, source_id, status;
```

`$1 = FINAL_CONTROL_FIXED_HOURS` (imported from `modules/bodyshop/bodyshop-hours.util`, never re-hardcoded), `$2 = notes marker`.

### Inserted `TrackingLog` — explicit value per column

| Column | Value | Why |
|---|---|---|
| `id` | `gen_random_uuid()` (DB) | Seed-script precedent (`seed-test-complete.ts:152`). |
| `source_type` / `source_id` | `'bodyshop'` / `e.id::text` | `source_id` is `varchar`; cast required. |
| `process_name` / `process_code` | `'Control Final'` / `'FINAL_CONTROL'` | Matches `BODYSHOP_PROCESS_NAMES` in `tracking.service.ts:28`. |
| `order_index` | `6` | `BODYSHOP_PROCESS_ORDER.FINAL_CONTROL`; last mother step. |
| `planned_hours` | `0.5` | `FINAL_CONTROL_FIXED_HOURS`. |
| `status` | `skipped` if entry `done`, else `pending` | Locked decision. `buildCard()` counts `skipped` as done (`tracking.service.ts:863`), so closed cards stay closed; `pending` breaks `allMothersDone` and routes active cards into the Control Final column. |
| `process_type` | `'MOTHER'` | Sequential gate, not parallel. |
| `started_at` / `completed_at` | `NULL` | Never fabricate events; `skipped` rows legitimately have no timestamps. |
| `technician_id` / `technician_name` | `NULL` | Unknown for legacy rows; also sidesteps the FK (migration 011) and the partial unique index on `in_progress` technicians. |
| `blocked_reason` / `paused_at` | `NULL` | Not blocked, never paused. |
| `paused_duration_minutes` | DB default `0` | Column omitted from the INSERT list. |
| `notes` | `backfill:control-final-backfill-legacy:<runId>` | Traceability / rollback fallback. |
| `created_at` | DB default `now()` | `@CreateDateColumn`; omitted from the INSERT list, same as existing seeds. |

Audit file `backfill-final-control-<runId>.json` (runId = compact ISO of run start), written to `--out=<dir>` or default `apps/api/backfill-audit/`, and mirrored to stdout:

```jsonc
{
  "runId": "2026-08-21T18-04-11Z",
  "changeName": "control-final-backfill-legacy",
  "database": "<host>/<db>",          // no credentials
  "count": 37,
  "rows": [{ "entryId": "…", "plate": "ABC123", "entryStatus": "in_progress",
             "insertedLogId": "…", "logStatus": "pending", "insertedAt": "…" }],
  "rollbackSql": "DELETE FROM tracking_logs WHERE id IN ('…','…');"
}
```

`rollbackSql` targets `tracking_logs.id` (not `source_id`), so a revert can never delete a legitimately created FINAL_CONTROL row added after the backfill.

## Idempotency and Concurrency

The `NOT EXISTS (… process_code='FINAL_CONTROL')` predicate is evaluated inside the same statement that inserts, so a second `--apply` run selects zero rows and inserts nothing — verified as a design property, not assumed. Two overlapping runs are not a real risk (manual, single-operator script), and PostgreSQL's default READ COMMITTED would let two concurrent `INSERT..SELECT` statements both see an empty `NOT EXISTS` and duplicate a row. Accepted, mitigated by the preview-vs-inserted count guard (step 3), which aborts the transaction on any mismatch; no advisory lock is added for a manual one-shot script.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `resolveLogStatus`: `done→skipped`, `scheduled/in_progress→pending`; `cancelled` never reaches it | Pure function specs |
| Unit | `parseArgs`: default dry-run, `--apply`, `--out=`, unknown flag rejected | Pure function specs |
| Unit | `run()` orchestration with a mocked QueryRunner: dry-run issues zero INSERTs and rolls back; apply commits; count mismatch and write failure both roll back and skip the audit file | Jest mocks, matching existing `tracking.service.spec.ts` style |
| Unit | `buildAuditPayload` shape + `rollbackSql` built from log ids | Pure function spec |
| Manual | Dry-run → `--apply` → verify board → rollback in QAS before PROD | Operator runbook in tasks |

## Threat Matrix

N/A — no routing, shell command, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. All matrix rows (documentation-like paths, git repository selection, commit state, push state, PR commands) are N/A: the script only opens a DB connection and writes one JSON file. The one trust boundary is the `--apply` argv gate, covered as a first-class requirement and unit test above.

## Migration / Rollout

No schema change. Additive `INSERT` only. Rollout: run dry-run in QAS → `--apply` in QAS → verify Control Final column appears on active cards and closed cards stay closed → verify rollback with `rollbackSql` → repeat dry-run/apply in PROD. Never wired into deploy pipelines or startup.

## Open Questions

None. Both proposal decisions (`done → skipped`, `cancelled → excluded`) are locked by the user.
