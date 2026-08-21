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

- [ ] 3.1 RED: `__tests__/simulator-edit-rehydration.spec.ts` — `'Manual'` piece rehydrates to `mode:'manual'`, `manualHours=totalHoras/qty`, `manualCategory` from breakdown proceso.
- [ ] 3.2 `simulador/[id]/page.tsx:77-84`: implement rehydration per 3.1; cast `damageLevel as LineDamageLabel`.
- [ ] 3.3 `simulator-form.tsx:162-235`: add mode-toggle icon button per row (`List`↔`PenLine`); manual slot = free-text pieza, category select, horas input (`step=0.1 min=0.1`), qty `w-14`.
- [ ] 3.4 Verify `page.tsx:65-70` (create-mode Guardar) now persists manual-only budgets with zero/minimal change since `estimate` is non-null once derived; tighten only if a gap surfaces.
- [ ] 3.5 RED: `__tests__/simulator-manual-integration.spec.tsx` — 100%-manual budget: summary bar renders, PDF shows `Manual` (no `undefined`), WhatsApp text has no `undefined`/`NaN`.
- [ ] 3.6 GREEN: close any gap surfaced by 3.5.
- [ ] 3.7 Guard test: `__tests__/use-simulator-form-guard.spec.ts` — hook never imports `createCatalogItem`/`updateCatalogItem`; catalog row count unchanged after a manual-only save.

## Phase 4: Verification

- [ ] 4.1 `pnpm --filter web test simulador` + `pnpm --filter web type-check` (confirm a manual row cannot type-check into `SimulatorEstimateItem`).
- [ ] 4.2 Manual smoke: mixed catalog/manual row on create + edit pages — Save, PDF, WhatsApp, summary bar; confirm `GET /budget-simulator/catalog` row count unchanged.
