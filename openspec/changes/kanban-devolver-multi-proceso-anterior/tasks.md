# Tasks: Kanban — return card to any earlier MOTHER process

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~815 (calibrated against real files, not assumed) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (~150) → PR2a (~360) → PR2b (~130, parallel w/ PR3) → PR3 (~170) |
| Delivery strategy | ask-on-risk (default; not overridden by orchestrator) |
| Chain strategy | pending — orchestrator must ask user: feature-branch-chain (suggested) vs stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | `listAvailableMothers()` + `buildCard` contract | PR1 (base: tracker) | `pnpm --filter api test -- tracking.service.spec -t "listAvailableMothers\|buildCard"` | N/A — pure unit, no live API needed | Revert `tracking.service.ts` L115-116/996-1023/1108-1143 + spec suites |
| 2a | `returnToProcess()` transaction + DTO | PR2a (base: PR1) | `pnpm --filter api test -- tracking.service.spec -t returnToProcess` | N/A — mocked manager | Revert L591-716 + DTO + controller call + spec + `makeManager` |
| 2b | Real cascade integration scenario | PR2b (base: PR2a) | `pnpm test:integration` (auto-skips w/o live API on :3001) | Live API + Postgres, migration 011 index | Remove new `describeIfApi` block, no prod code touched |
| 3 | Frontend selector + wiring | PR3 (base: PR2a) | `pnpm --filter web test` (if present) + manual kanban smoke | Dev server, manual return-flow click-through | Revert 4 web files, backend contract unaffected |

Units 2b and 3 touch disjoint files (test-only vs web-only) — may run in parallel once PR2a is merged/stacked.

## Phase 1: Backend foundation (PR1)

- [ ] 1.1 `tracking.service.ts` ~L996-1023: replace `pickPreviousMother` with `listAvailableMothers(logs, current)` per design (status-agnostic, dedup by `processCode`, orderIndex DESC)
- [ ] 1.2 `tracking.service.ts` L115-116: export `ReturnTarget` interface; card type gains `availableReturnTargets: ReturnTarget[]`
- [ ] 1.3 `tracking.service.ts` L1108-1143: `buildCard()` computes `availableReturnTargets` via `listAvailableMothers`; `canReturn = availableReturnTargets.length > 0`; `parallelBlocking` branch (L1142) returns `availableReturnTargets: []`
- [ ] 1.4 `tracking.service.spec.ts` L1494-1543, L1680-1694: rewrite `pickPreviousMother` suites → `listAvailableMothers` (array assertions, dedup length checks)
- [ ] 1.5 `tracking.service.spec.ts` L1638-1676: rewrite `canReturn/previousProcessName` suite → `availableReturnTargets`; add parallel-branch case asserting `[]`

## Phase 2: Backend transaction (PR2a, stacked on PR1)

- [ ] 2.1 `tracking.service.spec.ts` L155-201: `makeManager()` gains `find()` mock — MUST land before 2.5/2.6 or all `returnToProcess` tests break
- [ ] 2.2 `tracking.controller.ts` L44-48: `ReturnProcessDto` gains `targetProcessCode: string` (`@IsString @IsNotEmpty`)
- [ ] 2.3 `tracking.service.ts` L591-716: rewrite `returnToProcess()` — 4th param `targetProcessCode`, recompute `listAvailableMothers` inside `withTechnicianLock`, reject stale target, validate skipped intermediates are `'completed'`, write skipped `'returned'` passes before destination `in_progress` insert
- [ ] 2.4 `tracking.controller.ts` L156: forward `dto.targetProcessCode`
- [ ] 2.5 `tracking.service.spec.ts` L1696-1831: add 4th arg to 7 existing calls; rewrite "no hay proceso anterior" case to use invalid target
- [ ] 2.6 Add 3 new cases: multi-hop write order (3 saves, history preserved), non-completed intermediate rejected, invalid target (`AGENDA`/`MECHANIC`) rejected
- [ ] 2.7 `tracking.controller.spec.ts` L159-167: update call assertion with 4th arg; add missing-`targetProcessCode` DTO case

## Phase 3: Integration test (PR2b, stacked on PR2a)

- [ ] 3.1 `integration.int.spec.ts`: new `describeIfApi` — PAINT→BODYWORK skipping PREP, then chained reactivation of PREP then PAINT
- [ ] 3.2 Negative HTTP cases: invalid `targetProcessCode` → 400; missing `targetProcessCode` → 400

## Phase 4: Frontend wiring (PR3, stacked on PR2a)

- [ ] 4.1 `apps/web/src/lib/api.ts` L1388-1389, L1471-1482: export `ReturnTarget`, replace `previousProcessName` in card type, `returnTrackingProcess()` gains `targetProcessCode`
- [ ] 4.2 `apps/web/src/hooks/use-tracking.ts` L58-66: `useReturnProcess` mutation vars gain `targetProcessCode`
- [ ] 4.3 `apps/web/src/components/kanban/return-process-modal.tsx`: `targets: ReturnTarget[]` prop, radio destination selector (RETURN_REASONS visual pattern) before reason/technician, cascade hint, static "Devolver proceso" title, `onConfirm` gains `targetProcessCode`
- [ ] 4.4 `page.tsx` 7 sites: L844 `onReturn` type, L1253-1258 static button label + `availableReturnTargets`, L1859 state shape, L1942-1943 `handleReturnOpen`, L2045 `targets` prop, `handleReturnConfirm` forwards `targetProcessCode`

## Phase 5: Rollout

- [ ] 5.1 Confirm API+web deploy together (contract-breaking payload change, fail-closed per design); no migration needed
