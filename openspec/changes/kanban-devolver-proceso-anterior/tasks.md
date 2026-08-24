# Tasks: Return a Kanban card to the immediately previous process

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~300 · PR2 ~250 · PR3 ~270 (≈820 total) |
| 400-line budget risk | High (single-PR would blow the 400-line budget) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend foundation: entity + ordering + dedup) → PR 2 (backend return endpoint, child of PR1) → PR 3 (frontend, child of PR2) |
| Delivery strategy | ask-on-risk (default — not overridden by orchestrator) |
| Chain strategy | pending — user must pick stacked-to-main vs feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

Calibrated against real files: `tracking.service.ts` (1092 lines), `tracking.controller.ts` (149),
`resume-tech-modal.tsx` (106, closest precedent for the new modal). PR1 touches 1 entity line +
~155 service lines + ~150 new unit-test lines. PR2 adds `returnToProcess()` (~70), the resolver
swap (~45), DTO+route (~20), plus ~110 test lines. PR3 is `api.ts`/`use-tracking.ts` (~30), a new
~140-line modal, and ~100 lines of `page.tsx` wiring.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Entity widening + `createdAt` field + ordering comparator + `pickPreviousMother()` + `allMothersDone` dedup | PR 1 | `pnpm --filter api test tracking.service.spec` | N/A — no Nest test-DB/supertest harness in repo; logic-only unit tests | `tracking-log.entity.ts` status union, `ProcessSummary`/`toProcessSummary()` `createdAt`, comparator sites, `pickPreviousMother()`, dedup fix — inert until PR2 ships (no `'returned'` logs can exist yet) |
| 2 | `returnToProcess()` transaction + `PATCH process/:logId/return` + `completeProcess()` resolver | PR 2 | `pnpm --filter api test tracking.service.spec` and `tracking.controller.spec` | N/A — same constraint; controller route unit-tested via direct invocation (201/200 are Nest defaults, not unit-testable) | New method + route + DTO + resolver swap — revertible independently, PR1's refactors remain valid without it |
| 3 | Frontend data layer + `return-process-modal.tsx` + `page.tsx` wiring (button, highlight fix, sort, status maps) | PR 3 | N/A — no `.test.tsx` harness; manual QA on `seguimiento/kanban` | Manual QA scenario: return PREP→BODYWORK, verify capacity release, redo BODYWORK, confirm PREP reappears and card reaches Entregado | `api.ts`/`use-tracking.ts` additions, new modal file, `page.tsx` hunks — endpoint stays directly callable if reverted |

## Phase 1: PR1 — Backend foundation: ordering + dedup (TDD)

- [x] 1.1 RED: `pickPreviousMother()` table test — skips PARALLEL/AGENDA, jumps FINAL_CONTROL(6)→POLISH(4) never MECHANIC(5) — `apps/api/src/__tests__/tracking.service.spec.ts`
- [x] 1.2 RED: `allMothersDone` dedup test — latest-pass `'returned'` ⇒ false; superseded `'returned'` + newer `completed` ⇒ true; `'skipped'` ⇒ true
- [x] 1.3 RED: sort-stability test — two logs, same `orderIndex`, different `createdAt` → chronological order in `buildCard()`'s `sorted`
- [x] 1.4 GREEN: widen `TrackingLog.status` union with `'returned'`, `tracking-log.entity.ts:40`
- [x] 1.5 GREEN: add `createdAt: string` to `ProcessSummary` (`tracking.service.ts:78-93`) and populate in `toProcessSummary()` (`:1172`)
- [x] 1.6 GREEN: implement `pickPreviousMother(logs, current)` private helper in `tracking.service.ts`
- [x] 1.7 GREEN: dedup `allMothersDone` by latest pass per `processCode` in `buildCard()`, `tracking.service.ts:863-864`
- [x] 1.8 GREEN: add `order: { orderIndex: 'ASC', createdAt: 'ASC' }` at the 6 sort sites: `tracking.service.ts:621,680,696,718,823,986`
- [x] 1.9 GREEN: compute `currentProcess.canReturn`/`previousProcessName` in `buildCard()` via `pickPreviousMother()`

## Phase 2: PR1 — Verification

- [x] 2.1 `pnpm test` (api) green
- [x] 2.2 `pnpm typecheck` green (api+web)

## Phase 3: PR2 — Return transaction, endpoint, and `completeProcess()` resolver (TDD)

- [ ] 3.1 RED: reject non-MOTHER (`PARALLEL`) log → 400 — `tracking.service.spec.ts`
- [ ] 3.2 RED: reject status not in `in_progress|blocked|pending` → 400 (covers double-return of `completed`/`skipped`/`returned`)
- [ ] 3.3 RED: reject when no previous MOTHER exists (BODYWORK/AGENDA) → 400
- [ ] 3.4 RED: reject when the previous process's latest pass is already `pending|in_progress|blocked` → 400
- [ ] 3.5 RED: technician already `in_progress` elsewhere → 400 via `withTechnicianLock`'s existing `23505` mapping, not a raw DB error
- [ ] 3.6 RED: successful return tx — current log → `'returned'` + `blockedReason`; old `bodyshop_process_techs` row deleted; new `in_progress` log created for `prev`; new `bodyshop_process_techs` row upserted; assert step order (status flip before insert, per the partial-unique-index constraint)
- [ ] 3.7 RED: forced failure mid-transaction (e.g. tech upsert) → no partial writes persist
- [ ] 3.8 RED: `completeProcess()` resolver — `'returned'` at `orderIndex` 2 wins over plain `pending` at `orderIndex` 3; regenerated log is created `pending`, not `in_progress`
- [ ] 3.9 RED: `completeProcess()` resolver — two stacked `'returned'` logs (`orderIndex` 2 and 4) pick `orderIndex` 2
- [ ] 3.10 RED: explicit test asserting planned hours are NOT deduplicated across passes — both passes' `plannedHours` sum into duration/`suggestedExitDate` (locks the accepted-duplication decision, not a silent QAS discovery)
- [ ] 3.11 GREEN: implement `returnToProcess(logId, reason, technicianId, technicianName?)` in `tracking.service.ts` inside `withTechnicianLock()`, steps a-f per design's Data Flow
- [ ] 3.12 GREEN: replace `completeProcess()` next-MOTHER resolution (`tracking.service.ts:619-639`) with the unified `pending | returned` resolver
- [ ] 3.13 GREEN: add `ReturnProcessDto` (`reason` `@IsNotEmpty @MaxLength(120)`, `technicianId` `@IsUUID`, `technicianName` optional) in `tracking.controller.ts`
- [ ] 3.14 GREEN: add `PATCH process/:logId/return` with `@UseGuards(RolesGuard)` + `@Roles('admin','admin_taller')` at the route level (not class-level), `tracking.controller.ts`
- [ ] 3.15 RED+GREEN: controller test — non-`admin`/`admin_taller` role rejected 403, no service call — `tracking.controller.spec.ts`

## Phase 4: PR2 — Verification

- [ ] 4.1 `pnpm test` (api) green
- [ ] 4.2 `pnpm typecheck` green (api+web)

## Phase 5: PR3 — Frontend data layer

- [ ] 5.1 [no RED — no `.test.tsx` harness] add `returnTrackingProcess(logId, reason, technicianId, technicianName?)` in `apps/web/src/lib/api.ts`
- [ ] 5.2 [no RED] add `createdAt`, `canReturn`, `previousProcessName` to `TrackingProcessSummary`, `api.ts:1351-1365`
- [ ] 5.3 [no RED] add `useReturnProcess()` mutation hook invalidating `['tracking-board']` in `apps/web/src/hooks/use-tracking.ts`

## Phase 6: PR3 — Frontend UI

- [ ] 6.1 [no RED] create `apps/web/src/components/kanban/return-process-modal.tsx` — reason radios (`PAUSE_REASONS`-style + "Otro") and technician list, both required; merge `PauseModal` (page.tsx:632-688) + `resume-tech-modal.tsx` patterns
- [ ] 6.2 [no RED] fix `isCurrent` to compare by `logId`, not `processCode` — `page.tsx:911`
- [ ] 6.3 [no RED] add `'returned'` entries to the `statusColors`/`statusLabel`/`statusBadge` maps and a `ProcessStatusIcon` branch — `page.tsx:912-931`
- [ ] 6.4 [no RED] dedup `BodyshopScheduleBlock.allDone` by latest pass per `processCode` — `page.tsx:176-178`
- [ ] 6.5 [no RED] apply shared `byProcessOrder` (`orderIndex` ASC, `createdAt` ASC) comparator at `page.tsx:88,156,1041`
- [ ] 6.6 [no RED] add "Devolver a {previousProcessName}" button in `CardDetailModal`'s action footer (`page.tsx:1219-1261`), gated on `isAdminOrManager() && cp.canReturn && !isParallelPlaceholder`, wired to `ReturnProcessModal` + `useReturnProcess()`

## Phase 7: PR3 — Verification

- [ ] 7.1 [manual QA] return PREP→BODYWORK, confirm technician freed on capacity screen, redo BODYWORK, confirm PREP reappears `pending` and the card can then reach "Entregado"
- [ ] 7.2 `pnpm typecheck` green (web)

## Scope note

`blockedReason` in `ProcessSummary`/timeline display (design's Open Question #2) is deliberately
**out of scope** for this slice — no task created; `currentProcess.blockedReason` already covers
the live-state UI. Design's Open Question #1 (spec wording) is already resolved: the disk spec's
"Re-completion regenerates the returned process" requirement is the corrected, unified-resolver
version implemented by 3.8-3.9/3.12 — no further spec sync needed.
