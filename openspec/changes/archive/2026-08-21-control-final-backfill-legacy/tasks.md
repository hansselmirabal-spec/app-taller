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

**Post-review fixes (before merge)**: full 4R came back with 0 CRITICAL, 7 WARNING, 2 SUGGESTION. Fixed 6 directly:
- **Real bug (reliability)**: `notes` written to `tracking_logs` and the audit file's `runId` were built from two separate `new Date()` calls — they'd never actually match, breaking the documented DB-side correlation fallback if the audit file is lost. Fixed: one `runId` computed once, reused for both.
- **Silent data-integrity gap (readability→correctness)**: the preview↔inserted join used `Map.get(...) ?? ''` — a miss (possible if a concurrent write changes which entries match the predicate between the `SELECT` and the `INSERT...SELECT`, keeping the count equal but not the membership; the existing count-only guard can't catch this) silently wrote a blank plate/status into the audit record instead of failing. Fixed: throws and aborts before commit on a miss, consistent with the script's own "audit before commit" design principle. Added a test reproducing the exact scenario.
- **Swallowed root-cause error (resilience)**: `catch` called `rollbackTransaction()` unguarded — if the rollback itself threw (e.g. connection already dead), the real cause of the original failure never reached the console.error/logs. Fixed: nested try/catch, original error always logged regardless of rollback outcome. Added a test.
- **Plaintext audit file (risk)**: written with default permissions, containing plate numbers, with no operator-identity field. Fixed: `fs.writeFileSync(..., { mode: 0o600 })`, and `AuditPayload` gained an `executedBy` field (`os.userInfo().username`).
- **Duplicated business rule with no cross-reference (readability)**: `done→skipped` policy exists twice — the SQL `CASE` in `APPLY_INSERT_SQL` and the TS `resolveLogStatus()` used for the dry-run preview — with no comment linking them, so an edit to one could silently drift from the other. Added comments at both sites.
- **Missing idempotency test (reliability)**: idempotency was a load-bearing design claim (the selection predicate already excludes entries with a prior `FINAL_CONTROL` log) but no test exercised a second run against an already-backfilled universe. Added one.

Left as documented, non-blocking (matches the risk lens's own severity/causal classification):
- No environment/target-database safety check before a live `--apply` write — `causal_disposition: pre-existing`, matches the exact same unguarded `DATABASE_URL` fallback pattern already used by every `db:seed:*` script in this repo. Not introduced by this change; addressing it would mean hardening the whole family of scripts, out of scope here.
- The audit file is written before `COMMIT` (not after) — deliberate design tradeoff already documented in `design.md` (a failed disk write must not leave committed rows without a rollback trail; a lost/orphaned audit file for a transaction that never committed is the accepted asymmetric failure mode).
- `SELECTION_PREDICATE_SQL` naming (SUGGESTION, includes `FROM` + `WHERE`, not just a predicate) and lack of an executable (vs. string-assertion) test for `cancelled` never reaching `resolveLogStatus` (SUGGESTION) — both low-value for a one-off script, left as-is.

## Phase 5: Pre-Production Verification

- [x] 5.1 Run dry-run against QAS: ran the compiled script directly in the QAS API container (`node /app/dist/database/backfill-final-control.js`, image rebuilt from `main`@739d9f5 via `develop` sync) on 2026-08-21. **Result: 18 affected entries** (`AB123`, `GLA 200 D`, `ABC123`, `QATEST01`, `BNR523`, `AACA898`, `AANN177`, `BNR 523`, `AAXB971`, `ZZTEST99`, `AAKZ786`, `AVP 825`, `CD456`, `CAEY010`, `QATEST02`, `AAVR380`, `CD789`, `PDT001`). Zero rows inserted (dry-run), zero errors.
- [x] 5.2 Dry-run status resolution confirmed correct: all 18 entries in QAS today are `status ∈ {scheduled, in_progress, paused}` (none `done`), so all 18 resolve to log status `pending` — the `done`→`skipped` branch exists in code and is unit-tested (4.1) but has no live QAS example to exercise end-to-end yet. `--apply` execution in QAS and PROD remains a separate manual operator action per environment, outside this SDD cycle — the script is ready, not yet run with `--apply` anywhere.
