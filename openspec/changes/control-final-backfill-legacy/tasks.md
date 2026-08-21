# Tasks: Backfill FINAL_CONTROL tracking logs on legacy bodyshop entries

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~400-470 (script ~180-220, spec ~200-250, package.json/.gitignore ~2) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR; fallback split below if real diff > 400 |
| Delivery strategy | ask-on-risk (default, not overridden) |
| Chain strategy | pending (only if fallback triggers) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Full script (helpers + orchestration) + tests + wiring | PR 1 | `pnpm --filter @app-taller/api test backfill-final-control` | Dry-run against QAS: `pnpm --filter @app-taller/api db:backfill:final-control` | Revert the single new file + 2-line config diff; nothing else touched |
| 1a (fallback only if diff > 400) | Pure helpers (`parseArgs`, `resolveLogStatus`, `SELECTION_PREDICATE_SQL`, `buildAuditPayload`) + their unit tests | PR 1 | `pnpm --filter @app-taller/api test backfill-final-control` | N/A — inert, no DB connection opened | Delete file; unused, unwired, zero runtime effect |
| 1b (fallback only if diff > 400) | `run()` orchestration, transaction/audit wiring, npm script, `.gitignore` | PR 2 (base = PR 1) | Same test file, orchestration describe block | Dry-run against QAS | Revert wiring lines; helpers from 1a remain safe/unused |

## Phase 1: Foundation

- [x] 1.1 Create `apps/api/src/database/backfill-final-control.ts` bootstrap: `import 'reflect-metadata'`, local `DataSource` (`postgres`, `DATABASE_URL` fallback, `synchronize: false`), matching `bodyshop-workshop.seed.ts`.
- [x] 1.2 Implement exported `parseArgs(argv)`: default dry-run, `--apply`, `--out=<dir>`, unknown flag → `exit 1`.
- [x] 1.3 Import `FINAL_CONTROL_FIXED_HOURS` from `apps/api/src/modules/bodyshop/bodyshop-hours.util.ts` — never hardcode `0.5`.
- [x] 1.4 Define exported `SELECTION_PREDICATE_SQL` per design's interfaces section. **Requirement (locked, added by user)**: it MUST NOT filter by any date/timestamp column — covers the full historical universe with no 60-day cutoff; that cutoff is a `getBoard()`-only live-kanban rule and must never gate this data-correction script.

## Phase 2: Core Implementation

- [x] 2.1 Implement dry-run path: run `SELECT` with `SELECTION_PREDICATE_SQL`, print affected entries (id, plate, status, resolved log status) + count, `ROLLBACK`, `exit 0`.
- [x] 2.2 Implement exported `resolveLogStatus(entryStatus)`: `done` → `skipped`, else → `pending` (cancelled never reaches it, excluded by predicate).
- [x] 2.3 Implement apply path: single `INSERT ... SELECT ... RETURNING id, source_id, status` sharing `SELECTION_PREDICATE_SQL`; guard `inserted.length === preview.length`, else `throw`.
- [x] 2.4 Implement exported `buildAuditPayload(runId, rows)`: shape from design (`runId`, `changeName`, `database`, `count`, `rows`, `rollbackSql` built from `tracking_logs.id`, not `source_id`).
- [x] 2.5 Write audit JSON to `--out` or default `apps/api/backfill-audit/` **before** `COMMIT`; mirror payload to stdout; then `COMMIT`.
- [x] 2.6 Wrap in try/catch: any throw → `ROLLBACK`, `exit 1`, no audit file written. Bootstrap under `if (require.main === module)`.

## Phase 3: Integration / Wiring

- [x] 3.1 Add `"db:backfill:final-control": "ts-node -r tsconfig-paths/register src/database/backfill-final-control.ts"` to `apps/api/package.json`.
- [x] 3.2 Add `backfill-audit/` to `.gitignore`.

## Phase 4: Testing

- [x] 4.1 Test `resolveLogStatus`: `done→skipped`, `scheduled/in_progress→pending`.
- [x] 4.2 Test `parseArgs`: default dry-run, `--apply`, `--out=`, unknown flag rejected.
- [x] 4.3 Test `run()` dry-run: zero `INSERT`s issued, `ROLLBACK` called.
- [x] 4.4 Test `run()` apply: commits on success; count-mismatch and write-failure both `ROLLBACK` and skip the audit file.
- [x] 4.5 Test `buildAuditPayload`: shape + `rollbackSql` built from log `id`s.
- [x] 4.6 Test `SELECTION_PREDICATE_SQL` contains no date/`created_at` filter — asserts the full-history requirement (no 60-day cutoff) added above.

## Phase 5: Pre-Production Verification

- [ ] 5.1 Run dry-run against QAS: `pnpm --filter @app-taller/api db:backfill:final-control`; record the real affected-entry count in the PR description / audit notes.
- [ ] 5.2 Confirm dry-run status resolution matches expectation (`done`→`skipped` preview, else `pending`) before sign-off. `--apply` execution in QAS and PROD is a separate manual operator action per environment, outside this SDD apply cycle.
