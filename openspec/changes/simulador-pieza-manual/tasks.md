# Tasks: Manual (off-catalog) piece rows in the Budget Simulator

**Backend check (verified)**: `GET /budget-simulator/config` already exists
(`budget-simulator.controller.ts:41-44`, `JwtAuthGuard` only, no role guard) and
returns `{tarifaMdo, moneda, ivaIncluido}`. Zero backend changes — only a
frontend wrapper (`getBudgetSimulatorConfig`) is added. `apps/api/**` stays
untouched, per the design's non-negotiable: manual pieces never write to
`bodyshop_catalog`.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~450-570 (impl ~250-320, tests ~200-250) |
| 400-line budget risk | High (total) — split into 3 units, each < 400 |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (foundation) → PR 2 (core hook) → PR 3 (UI + edit + PDF/WhatsApp) |
| Delivery strategy | ask-on-risk (default, not overridden this session) |
| Chain strategy | pending — ask user: stacked-to-main vs feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (confirmed)
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Config wrapper + hook + widened damage-label types | PR 1 | `pnpm --filter web type-check` | N/A — dead code until Unit 2 consumes it | Revert `lib/api.ts` config additions, `use-budget-simulator.ts` hook, `budget-pdf.tsx` type widen |
| 2 | `estimate` becomes derived client state (`buildEstimate`) | PR 2 | `pnpm --filter web test use-simulator-form` | Dev server: add 1 manual row on `/presupuesto/simulador`, confirm no `/estimate` POST fires | Revert `use-simulator-form.ts`; `SimulatorItem.mode` is inert without PR 3's UI |
| 3 | Manual-mode UI, edit rehydration, PDF/WhatsApp/summary | PR 3 | `pnpm --filter web test simulator-manual-integration simulator-edit-rehydration` | Dev server against real API: create a 100%-manual budget end to end, verify saved `pieces[].damageLevel === 'Manual'` | Revert `simulator-form.tsx`, `[id]/page.tsx` rehydration block, `budget-pdf.tsx` label entries |

## Phase 1: Foundation (PR 1)

- [x] 1.1 `lib/api.ts`: add `LineDamageLabel = DamageLevel | 'Manual'`; change `SimulatorLineResult.damageLevel` to `LineDamageLabel`; add `BudgetSimulatorConfig` + `getBudgetSimulatorConfig()` (MOCK branch + `Number(raw.tarifaMdo)` coercion, mirrors `budgetSimulatorEstimate`).
- [x] 1.2 `hooks/use-budget-simulator.ts`: add `useBudgetSimulatorConfig()` — `useQuery({queryKey:['budget-simulator-config'], staleTime: Infinity})`.
- [x] 1.3 `components/budget/budget-pdf.tsx`: widen `DAMAGE_LABEL`/`DAMAGE_COLOR` (lines 24-38) to `Record<LineDamageLabel,…>`; add `'Manual'` entry (generic label, safe color fallback).

## Phase 2: Core hook — derived estimate (PR 2)

- [x] 2.1 RED: `__tests__/use-simulator-form.spec.ts` — `buildEstimate` order preservation (mixed rows); manual line `horas=round2(manualHours×qty)`/`totalMdo`/single breakdown entry; manual rows excluded from `/estimate` payload; stale `catalogResult` signature ⇒ `estimate === null`.
- [x] 2.2 `use-simulator-form.ts`: extend `SimulatorItem` with `mode`, `manualCategory?`, `manualHours?`; default `mode:'catalog'` in `newSimulatorItem()`.
- [x] 2.3 Implement `splitItems`, `synthesizeManualLine(tarifa)` (BODYWORK→Reparar/PREP→Preparacion/PAINT→Pintar, `descripcion: "${proceso} — ${pieza}"`), `buildEstimate(items, catalogResult, tarifa, moneda)` merging by original index.
- [x] 2.4 Replace `estimate` state with signature-keyed `catalogResult`; per-mode row-readiness gate; skip network call when zero catalog rows.
- [x] 2.5 Derive `estimate` via `buildEstimate` in hook body; reset mode-specific fields on toggle instead of `setEstimate(null)`; drop `setEstimate` from public return.
- [x] 2.6 Wire `useBudgetSimulatorConfig()`: `tarifa = config?.tarifaMdo ?? catalogResult?.result?.tarifa ?? 0`.
- [x] 2.7 GREEN: run `pnpm --filter web test use-simulator-form`, confirm 2.1 passes.

**Post-review fix (PR 2, before merge)**: `review-reliability` found a CRITICAL —
`buildEstimate`'s aggregate `totalMdo` summed each line's already-rounded
`totalMdo` (`sum(l => l.totalMdo)`), instead of rounding the aggregate hours
once like the backend does (`Math.round(totalHoras agregado × tarifa)`,
`budget-simulator.service.ts:225`). Sum-of-roundings ≠ rounding-of-sum: 2
catalog lines at 0.5h/tarifa=3 gave `4` instead of the backend's `3`. This
affected ordinary catalog-only budgets already in production, not just manual
rows. Fixed by computing `totalMdo: Math.round(totalHoras × tarifa)` off the
aggregate hours instead of summing per-line `totalMdo`; also switched
`synthesizeManualLine`'s per-line `totalMdo` from `round2` to `Math.round` for
the same backend-consistency reason (per-line `totalMdo` is otherwise unused
downstream). Added a regression test reproducing the exact counter-example.
Two lower-severity WARNINGs from the same review were left as documented,
non-blocking gaps: the stale-signature/race test exercises the pure guard
function directly rather than the async debounce path (would need net-new
`renderHook` + fake-timer test infra not yet present in this repo), and the
edit-mode rehydration hardcoding `mode:'catalog'` is correctly Phase 3 scope
(unreachable today — no UI can create a `manual` row yet, so no saved budget
can contain `damageLevel:'Manual'`).

## Phase 3: UI + edit rehydration + PDF/WhatsApp (PR 3)

- [x] 3.1 RED: `__tests__/simulator-edit-rehydration.spec.ts` — `'Manual'` piece rehydrates to `mode:'manual'`, `manualHours=totalHoras/qty`, `manualCategory` from breakdown proceso.
- [x] 3.2 `simulador/[id]/page.tsx:77-84`: implement rehydration per 3.1; cast `damageLevel as LineDamageLabel`.
- [x] 3.3 `simulator-form.tsx:162-235`: add mode-toggle icon button per row (`List`↔`PenLine`); manual slot = free-text pieza, category select, horas input (`step=0.1 min=0.1`), qty `w-14`.
- [x] 3.4 Verify `page.tsx:65-70` (create-mode Guardar) now persists manual-only budgets with zero/minimal change since `estimate` is non-null once derived; tighten only if a gap surfaces. **Verified — no gap.** `if (estimate) { const {processes, pieces} = estimateToBudgetPayload(estimate); if (processes.length > 0) {...} }` already works for a manual-only budget because `estimate` is now always derived (Phase 2) and a valid manual row contributes to `bodyworkHours`/`prepHours`/`paintHours`, so `processes.length > 0`. Zero lines changed in `page.tsx`.
- [x] 3.5 RED: `__tests__/simulator-manual-integration.spec.ts` — 100%-manual budget: PDF shows `Manual` (no `undefined`), WhatsApp text has no `undefined`/`NaN`. **File extension note**: written as `.spec.ts`, not `.spec.tsx` — this repo's jest `testRegex` (`.*\.spec\.ts$`) doesn't pick up `.tsx` and there is no `@testing-library/react` dependency (confirmed absent from `package.json`); attempting to import `budget-pdf.tsx` directly also fails under this jest config (`@react-pdf/renderer` ships ESM jest can't parse — confirmed by a real `SyntaxError` before reverting the import). Tests instead assert against the same pure functions/exported data every consumer reads (`buildEstimate`, `buildWhatsAppMessage`, `estimateToBudgetPayload`) plus a source-level check that `budget-pdf.tsx`'s `DAMAGE_LABEL`/`DAMAGE_COLOR` declare a real `Manual` entry — same static-assertion style as the Phase 2/3 guard tests. Summary-bar coverage for a 100%-manual budget is structurally covered by Phase 2's `buildEstimate` "100%-manual budget without catalogResult" test (estimate is non-null ⇒ `EstimateSummaryBar` renders, since its only gate is `if (!estimate) return null`).
- [x] 3.6 GREEN: `pnpm --filter web test simulator-manual-integration` → all pass; no gap surfaced.
- [x] 3.7 Guard test: `__tests__/use-simulator-form-guard.spec.ts` — source-scans `use-simulator-form.ts`, `simulator-form.tsx`, `page.tsx`, `[id]/page.tsx` for `createCatalogItem`/`updateCatalogItem` references (none found) and asserts `estimateToBudgetPayload`'s manual-only output is `{processes, pieces}`-shaped only, never catalog-shaped (`active`/`descripcionFinal`).

**PR 3 diff size note**: implementation (`[id]/page.tsx`, `simulator-form.tsx`, `use-simulator-form.ts`) ≈ 234 changed lines; 3 new test files ≈ 259 lines. Combined ≈ 493 lines, above the general 400-line guard but consistent with the already-confirmed `stacked-to-main` chain split (PR 3 is the last of 3 chained PRs; PR 1 and PR 2 already merged separately keeping each unit under budget individually). Full 4R review ran given the >400-line total.

**Post-review fixes (PR 3, before merge)**: full 4R (risk/resilience/readability/reliability) came back clean on risk and resilience; 3 non-blocking WARNINGs across readability/reliability, 2 fixed directly:
- `MANUAL_CATEGORY_BY_PROCESO` was hand-maintained as a separate inverse of `MANUAL_PROCESO_BY_CATEGORY` with no compile-time guarantee the two stayed in sync — now derived programmatically via `Object.fromEntries`/`Object.entries`, so a future edit to one can't silently desync the other.
- Round-trip precision drift: `manualHours` input allowed unlimited decimals while `synthesizeManualLine`/`round2` only preserves 2 — saving `1.234h` and reopening could return `1.2333...`. Fixed at both ends: the input now clamps to 2 decimals on change (matches storage precision), and `pieceToItem` applies `round2` to the recovered `manualHours` too (division can reintroduce floating-point noise even from a clean stored value, e.g. `14.7/3 === 4.8999999999999995` — caught by a real round-trip test that failed before this fix and passes after). Added `it.each` round-trip test (`synthesizeManualLine` → `pieceToItem`, 5 cases) in `simulator-edit-rehydration.spec.ts` that actually exercises both functions together, closing the gap the review flagged (the prior "round-trip" test only hand-built a `BudgetPiece`, never called `synthesizeManualLine`).
- Left as a documented, non-blocking gap: the anti-catalog guard test (`use-simulator-form-guard.spec.ts`) is a static source-text scan, not an execution-level interception of the save flow — it can't detect an indirect or aliased call to a catalog-mutation endpoint. Building a true execution-level guard would need `renderHook`/mocked-fetch test infrastructure this repo doesn't have yet (same constraint already noted for the race-condition test in PR 2). No live catalog-mutation call exists in the Simulator tree today (confirmed by grep), so this is a defense-in-depth gap, not a known bug.

## Phase 4: Verification

- [ ] 4.1 `pnpm --filter web test simulador` + `pnpm --filter web type-check` (confirm a manual row cannot type-check into `SimulatorEstimateItem`).
- [ ] 4.2 Manual smoke: mixed catalog/manual row on create + edit pages — Save, PDF, WhatsApp, summary bar; confirm `GET /budget-simulator/catalog` row count unchanged.
