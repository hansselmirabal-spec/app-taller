# Proposal: Manual (off-catalog) piece rows in the Bodyshop Budget Simulator

## Intent

Today every damaged-panel row in the Simulator must be picked from `bodyshop_catalog`. When a vehicle has a panel that is not catalogued, the advisor cannot quote it at all — the row either can't be added or silently estimates 0 hours. Advisors need to enter that one panel by hand, for that budget only.

Business rule (confirmed, not reopenable): a manual piece is **single-use and ephemeral**. It MUST NOT be created or persisted in `bodyshop_catalog`. It lives only inside the resulting `BudgetAppointment` (`pieces`/`processes` jsonb).

## Scope

### In Scope

- Per-row mode toggle `catalog | manual` in the Simulator item list (create and edit modes).
- Manual rows excluded from the batch `POST /budget-simulator/estimate` call; synthesized client-side into the same line shape.
- Save/WhatsApp/PDF work for budgets that are partially or 100% manual.
- Frontend `getBudgetSimulatorConfig` wrapper (tarifa/moneda) so manual-only budgets can price hours.

### Out of Scope

- Any write to `bodyshop_catalog` (explicitly forbidden).
- Backend DTO/schema changes: `BudgetPieceDto` already accepts free-text `pieza` and string `damageLevel`; jsonb columns have no catalog FK.
- Promoting a manual piece into the catalog later; catalog admin UI.

## Capabilities

### New Capabilities

- `budget-simulator-manual-piece`: manual off-catalog row entry, its process-category attribution, pricing, and exclusion from catalog estimation.

### Modified Capabilities

- `budget-simulator-edit`: save gating must allow a manual-only budget (today `disabled={!estimate}` in both `page.tsx:162` and `[id]/page.tsx:206` — verified, they do mirror each other).

## Approach

Exploration Approach 1, approved as technical direction: one unified `items` array with `mode` per row, not a parallel manual list. Split before the debounced effect — only catalog rows hit `/budget-simulator/estimate`; manual rows are synthesized into `SimulatorLineResult`-shaped objects (`totalMdo = horas × tarifa`) and merged back in original order. Downstream consumers (`estimateToBudgetPayload`, `handleWhatsApp`, `BudgetPdfDocument`, `EstimateSummaryBar`) keep walking a single `estimate.lines` array unchanged.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/.../simulador/_shared/use-simulator-form.ts` | Modified | `SimulatorItem` type, catalog/manual split in debounced effect, merge, payload build |
| `apps/web/.../simulador/_shared/simulator-form.tsx` | Modified | Row mode toggle + manual fields; `if (!estimate) return null` (line 261) hides the summary bar for manual-only budgets |
| `apps/web/.../simulador/page.tsx`, `[id]/page.tsx` | Modified | Save gating (`disabled={!estimate}`) |
| `apps/web/src/lib/api.ts` | Modified | Loosen `damageLevel` typing; add `getBudgetSimulatorConfig` (net-new) |
| `apps/web/src/components/budget/budget-pdf.tsx` | Modified | `DAMAGE_LABEL`/`DAMAGE_COLOR` key or fallback |
| `apps/api/.../budget-appointments.service.ts` | Unchanged | `approve()` consumes the category split; correctness depends on the frontend always tagging one |

## Open Questions (need user decision before spec)

1. **Process category** — `approve()` splits hours into BODYWORK/PREP/PAINT to create real technician capacity. How is a manual row categorized: an explicit per-row selector (Chapería/Preparación/Pintura), or split some other way? Without it, workshop capacity is miscomputed.
2. **Cost (`totalMdo`)** — hours × workshop rate (same as catalog, via `GET /budget-simulator/config`), or does the advisor also type the amount by hand?
3. **Damage level** — does `DamageLevel` (Leve/Medio/Grave/Sustitución) still apply to a manual row, or is it omitted/replaced by a generic label in PDF and WhatsApp?

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Silent zeroing: a manual row sent to the batch estimate resolves to 0 hours, discarding user input | High if unhandled | Hard split before `mutateAsync`; test asserting manual rows never reach the endpoint |
| Save button permanently disabled on a 100% manual budget | High | Change gating in both page components; test an all-manual save |
| PDF prints `undefined` for damage (`DAMAGE_LABEL` has no fallback) | Medium | Add manual key or fallback; PDF snapshot test |
| Capacity miscount if a manual row lacks a category | Medium | Resolved by Open Question 1; make category required in the UI |
| Manual data leaking into `bodyshop_catalog` | Low | No catalog write path in scope; assert in review |

## Rollback Plan

Frontend-only change with no migration and no backend contract change. Revert the feature commit(s) and redeploy `apps/web`. Already-saved budgets containing a manual piece keep rendering: `pieces`/`processes` are jsonb free-text and remain valid input to `approve()` after rollback, though the row becomes non-editable as a manual row in the reverted UI.

## Dependencies

- Open Questions 1–3 answered before `sdd-spec`.
- `GET /budget-simulator/config` (exists on backend, no frontend wrapper yet).

## Success Criteria

- [ ] Advisor can add an off-catalog panel with hours in the same row list, mixed freely with catalog rows.
- [ ] A 100% manual budget can be saved, shared via WhatsApp, and exported to PDF with no `undefined` or 0-hour values.
- [ ] `bodyshop_catalog` row count is unchanged after saving a budget with manual pieces.
- [ ] Approving a budget with manual pieces produces the correct bodywork/prep/paint hour split in the bodyshop entry.
