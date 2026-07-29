# Tasks: Add manual Mechanic to Kanban Operativo + Pause releases technician

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~300 · PR2 ~400 |
| 400-line budget risk | PR1 Medium · PR2 High (at budget edge) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Func.1 add process) → PR 2 (Func.2 pause releases tech, child of PR1) |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

Already resolved by design (not reopened): 2-PR split, stacked-to-main, PR1 ≈300 lines, PR2 ≈400 lines.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Add PARALLEL process to bodyshop entry (backend+UI) | PR 1 | `pnpm --filter api test tracking.service.spec` | N/A — no `.test.tsx` harness; manual QA on `seguimiento/kanban` | `tracking.service.ts` (`addProcessToBodyshop`), `tracking.controller.ts` add-route, `page.tsx` add-button, `use-tracking.ts`/`api.ts` additions — revertible independent of PR2 |
| 2 | Pause releases technician, resume requires confirm | PR 2 | `pnpm --filter api test tracking.service.spec` | N/A — no `.test.tsx` harness; manual QA pause/resume flow | `blockProcess`/`unblockProcess` extensions, `resume-tech-modal.tsx`, resume-options route/hook — revertible without touching PR1's add-process flow |

## Phase 1: PR1 — Backend `addProcessToBodyshop` (TDD)

- [x] 1.1 RED: test rejecting non-PARALLEL code (e.g. PAINT) in `apps/api/src/__tests__/tracking.service.spec.ts` (repo convention: tests live in `src/__tests__/`, not co-located next to the module — see baseline `tracking.service.spec.ts` and `bodyshop.service.spec.ts`)
- [x] 1.2 RED: test rejecting duplicate process already in log/`entry.processes` (covered both cases: duplicate in `entry.processes` jsonb, and duplicate as an existing `TrackingLog` with no jsonb entry)
- [x] 1.3 RED: test successful dual-write: new `TrackingLog` + matching `entry.processes` entry, same code/hours
- [x] 1.4 RED: test rollback — failure mid-transaction leaves neither `TrackingLog` nor `entry.processes` entry (2 cases: entry-write fails, log-write fails)
- [x] 1.5 GREEN: add `buildBodyshopProcessDescriptor(code, hours)` in `tracking.service.ts` using `BODYSHOP_PROCESS_NAMES`/`BODYSHOP_PROCESS_ORDER`
- [x] 1.6 GREEN: implement `addProcessToBodyshop(entryId, processCode, hours)` in `tracking.service.ts`, inject `DataSource`, wrap both writes in `dataSource.transaction`
- [x] 1.7 REFACTOR: ran `pnpm test -- tracking.service.spec` — 48/48 green (40 baseline + 8 new). No duplication to tidy; descriptor helper already shared by both writes.

## Phase 2: PR1 — Controller endpoint (TDD)

- [x] 2.1 RED: test `POST tracking/process/bodyshop/:entryId/add` in `apps/api/src/__tests__/tracking.controller.spec.ts` (new file; no e2e/supertest harness exists in repo, so unit-tested via direct controller invocation + DTO `class-validator` checks — 201 is NestJS's default `@Post` status, enforced by the framework, not testable at the unit layer)
- [x] 2.2 GREEN: add `AddProcessDto { processCode: string; hours: number }` (`@IsString`, `@IsNumber @Min(0.1)`) in `tracking.controller.ts`, exported for DTO-level test coverage
- [x] 2.3 GREEN: add route calling `addProcessToBodyshop` in `tracking.controller.ts`

## Phase 3: PR1 — Frontend wiring (no test harness — manual QA)

- [x] 3.1 [Frontend, no RED — no `.test.tsx` harness in repo] add `addTrackingProcess(entryId, processCode, hours)` in `apps/web/src/lib/api.ts`
- [x] 3.2 [Frontend, no RED] add `useAddProcess` mutation hook (invalidate board query on success) in `apps/web/src/hooks/use-tracking.ts`
- [x] 3.3 [Frontend, no RED] add always-visible "+ Agregar proceso" slot in `KanbanCard`, `apps/web/src/app/(dashboard)/seguimiento/kanban/page.tsx`, wired to `useAddProcess` — judgment call (not specified in design/tasks): slot adds hardcoded `processCode='MECHANIC'` only (matches change title "Mecánica manual"; backend endpoint itself is generic for all 4 parallel codes per spec), hours entered via an inline expanding number input + confirm/cancel icon buttons (no new modal file, matching design's File Changes list which has no new component for PR1). Slot only renders for bodyshop cards that don't already have a MECHANIC process (any status), mirroring the backend's duplicate-prevention rule.
- [ ] 3.4 [Frontend, manual QA] verify in browser: add MECHANIC to an in-progress entry, board refreshes, `getDayCapacity` unaffected — **not run**: no browser/QA environment available in this session; typecheck + backend tests are green, logic reviewed against spec, but this step needs a human/QA pass before merge.

## Phase 4: PR1 — Verification

- [x] 4.1 `pnpm test` (api) green for all PR1 tests — full suite: 22 suites, 265 passed / 2 skipped (pre-existing skips), 0 failed
- [x] 4.2 `pnpm typecheck` green across api+web — both clean, zero errors

## Phase 5: PR2 — `blockProcess` releases technician (TDD)

- [ ] 5.1 RED: test `blockProcess` snapshots `technicianId`/`technicianName` onto the log only if not already set
- [ ] 5.2 RED: test `blockProcess` deletes `bodyshop_process_techs` row for `entryId`+`processCode`
- [ ] 5.3 RED: test `blockProcess` no-op (0 rows deleted) when process has no assigned tech (MECHANIC/parallel, failed auto-assign)
- [ ] 5.4 GREEN: implement snapshot-then-delete in `blockProcess`, `tracking.service.ts`

## Phase 6: PR2 — `unblockProcess` reassign + conflict-check (TDD)

- [ ] 6.1 RED: test `isTechnicianFree(technicianId, excludeLogId?)` returns false when tech busy on another `in_progress` log, excludes own log
- [ ] 6.2 GREEN: implement `isTechnicianFree` in `tracking.service.ts`, reuse existing conflict-check query
- [ ] 6.3 RED: test `unblockProcess` throws `BadRequestException` when confirmed tech is busy elsewhere
- [ ] 6.4 RED: test `unblockProcess` upserts `bodyshop_process_techs` with provided tech (falls back to `log.technicianId`), restores status, accumulates `pausedDurationMinutes`
- [ ] 6.5 GREEN: extend `unblockProcess(logId, technicianId?, technicianName?)` in `tracking.service.ts` per Data Flow (b)

## Phase 7: PR2 — resume-options endpoint (TDD)

- [ ] 7.1 RED: test `getResumeOptions(logId)` returns `{previousTechnicianId, previousTechnicianName, previousTechnicianFree, conflictProcessName}`
- [ ] 7.2 GREEN: implement `getResumeOptions` in `tracking.service.ts`
- [ ] 7.3 RED: test `GET tracking/process/:logId/resume-options` returns 200 with expected shape
- [ ] 7.4 GREEN: add `UnblockProcessDto` optional `technicianId`/`technicianName` fields + `GET resume-options` route in `tracking.controller.ts`

## Phase 8: PR2 — Integration tests (TDD)

- [ ] 8.1 Integration (Nest test DB): paused tech drops out of `getTechnicianAvailability`, reappears on resume
- [ ] 8.2 Integration (Nest test DB): 2+ paused processes on one entry release/restore independently

## Phase 9: PR2 — Frontend wiring (no test harness — manual QA)

- [ ] 9.1 [Frontend, no RED] create `apps/web/src/components/kanban/resume-tech-modal.tsx`, copying `ProcessTechRow` interaction pattern
- [ ] 9.2 [Frontend, no RED] update `unblockTrackingProcess` signature + add `getResumeOptions` in `apps/web/src/lib/api.ts`
- [ ] 9.3 [Frontend, no RED] update `useUnblockProcess` params + add `useResumeOptions` hook in `apps/web/src/hooks/use-tracking.ts`
- [ ] 9.4 [Frontend, no RED] wire `ResumeTechModal` in `page.tsx`: pause triggers `blockProcess`; resume opens modal pre-filled from resume-options
- [ ] 9.5 [Frontend, no RED] unify parallel resume in `page.tsx`: `status==='blocked'` → `onUnblock` (modal); `'pending'` → `onStart` (unchanged)
- [ ] 9.6 [Frontend, manual QA] verify: pause BODYWORK frees tech on capacity screens; resume modal suggests prior tech or alternatives when busy; parallel MECHANIC resume also goes through modal

## Phase 10: PR2 — Verification

- [ ] 10.1 `pnpm test` (api) green for all PR2 unit + integration tests
- [ ] 10.2 `pnpm typecheck` green across api+web
