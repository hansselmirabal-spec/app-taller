# Design: Manual (off-catalog) piece rows in the Bodyshop Budget Simulator

## Technical Approach

One `items[]` array with a per-row `mode`. `estimate` stops being mutation output and becomes **derived client state**: `buildEstimate(items, catalogResult, tarifa, moneda)`. Only `mode === 'catalog'` rows reach `POST /budget-simulator/estimate`; manual rows are synthesized locally into the same `SimulatorLineResult` shape and spliced back at their original index. Every downstream consumer (`estimateToBudgetPayload`, `handleWhatsApp`, `BudgetPdfDocument`, `EstimateSummaryBar`, the per-row breakdown at `simulator-form.tsx:164`) keeps walking one `estimate.lines` array, unchanged.

Confirmed inputs: category selector per row; `totalMdo = horas × tarifa` from `GET /budget-simulator/config`; no damage level in manual mode.

## Architecture Decisions

### Decision: `'Manual'` as a widened line-level label, not an optional field, not a new `DamageLevel`

| Option | Tradeoff |
|---|---|
| Add `'Manual'` to `DamageLevel` | `SimulatorEstimateItem.damageLevel` would accept it → a manual row could type-check into the batch request; backend `@IsEnum(['Leve','Medio','Grave','Sustitucion'])` (`budget-simulator.service.ts:58`) 400s at runtime |
| `damageLevel?: DamageLevel` | `Record<DamageLevel,…>` keeps compiling; forgetting a `??` at any of the 3 consumers silently prints `undefined` — exactly the risk we must remove |
| **Chosen: `type LineDamageLabel = DamageLevel \| 'Manual'`, used only in `SimulatorLineResult.damageLevel`** | `DamageLevel` stays 1:1 with the backend enum, so a manual row **cannot** type-check into `SimulatorEstimateItem` — the compiler enforces the split. `DAMAGE_LABEL`/`DAMAGE_COLOR` become `Record<LineDamageLabel, …>`, so TS *forces* adding the `Manual` key |

`BudgetPiece.damageLevel` is already `string` (`budget-appointment.entity.ts:21`, `BudgetPieceDto` `@IsString()`), so `'Manual'` persists with **zero backend change** and doubles as the round-trip marker for edit mode.

### Decision: manual rows keep `qty`; hours is an added field, not a replacement

`approve()` derives `pieceCount` from `appt.pieces[].qty` (`budget-appointments.service.ts:266`). Dropping `qty` would under-count physical pieces. Line hours = `round2(manualHours × qty)`, mirroring the backend's `horas * item.qty`.

### Decision: manual breakdown uses real `proceso` keys

`BODYWORK→'Reparar'`, `PREP→'Preparacion'`, `PAINT→'Pintar'` — the keys already present in `PROCESO_CATEGORY` (api) and `PROCESS_CATEGORY` (`budget-pdf.tsx:213`), so PDF colour/label lookup hits instead of falling back to the grey default. `descripcion: \`${proceso} — ${pieza}\`` matches the backend format exactly.

### Decision: `catalogResult` is signature-keyed; `estimate` is derived

Store `{ signature, result }` where `signature = JSON.stringify(catalogRows.map(r => [r.pieza, r.damageLevel, r.qty]))`. `buildEstimate` returns `null` when the stored signature ≠ the current one. This replaces today's manual `setEstimate(null)` invalidation in `updateItem`/`removeItem` **and** closes a latent out-of-order-response race. `setEstimate` is dropped from the hook's public return — verified unused by both pages.

## Data Flow

    items[] ──split by mode──┬─ catalog rows ─debounce 300ms→ POST /estimate ─→ {signature, result}
                             │                                                        │
                             └─ manual rows ─→ synthesizeManualLine(tarifa) ──┐        │
                                                                              ▼        ▼
    GET /budget-simulator/config (staleTime: Infinity) ── tarifa ──→   buildEstimate(order-preserving)
                                                                              │
                        estimate ──→ SummaryBar · per-row breakdown · PDF · WhatsApp · estimateToBudgetPayload

Order is preserved by index mapping: collect `catalogIdx: number[]`, then `lines[catalogIdx[k]] = result.lines[k]` (the backend preserves input order — `for (const item of dto.items) lines.push(...)`). Aggregates (`bodyworkHours`/`prepHours`/`paintHours`/`totalHoras`/`totalMdo`) are recomputed client-side from the merged array, never taken from the batch response.

## Correction to the proposal (verified)

The proposal states save gating is `disabled={!estimate}` at `page.tsx:162` and `[id]/page.tsx:206`. **Both of those lines are the WhatsApp button.** Create-mode Guardar (`page.tsx:170-176`) has no `disabled` prop at all; its real defect is `if (estimate)` + `if (processes.length > 0)` at `page.tsx:65-70`, which today creates the appointment and silently drops all pieces for a manual-only budget. Edit-mode Guardar is `disabled={isSaving}`, guarded by the `processes.length === 0` check at `[id]/page.tsx:99`. Because `estimate` is now always derived, all three sites — plus `EstimateSummaryBar`'s `if (!estimate) return null` (`simulator-form.tsx:261`) — are fixed without editing any `disabled` prop.

## Interfaces / Contracts

```ts
// use-simulator-form.ts
export type ManualCategory = 'BODYWORK' | 'PREP' | 'PAINT';
export interface SimulatorItem {
  id: string; pieza: string; damageLevel: DamageLevel; qty: number;  // unchanged
  mode: 'catalog' | 'manual';        // default 'catalog'
  manualCategory?: ManualCategory;   // manual only, required by row-readiness
  manualHours?: number;              // manual only, > 0
}
// lib/api.ts
export type LineDamageLabel = DamageLevel | 'Manual';
export interface BudgetSimulatorConfig { tarifaMdo: number; moneda: string; ivaIncluido: boolean }
export async function getBudgetSimulatorConfig(): Promise<BudgetSimulatorConfig>;
```

`getBudgetSimulatorConfig` must coerce `Number(raw.tarifaMdo)`: it is a TypeORM `decimal` and serializes as a string — the backend itself does `Number(cfg.tarifaMdo)` (`budget-simulator.service.ts:161`). MOCK branch follows the existing `if (MOCK) return delay(...)` convention.

`useBudgetSimulatorConfig()` in `hooks/use-budget-simulator.ts`: `useQuery({ queryKey: ['budget-simulator-config'], staleTime: Infinity })` — identical to `useBudgetSimulatorPiezas`; the rate is session-invariant, so one fetch per app load, shared across create and edit pages via the React Query cache.

`tarifa = config?.tarifaMdo ?? catalogResult?.tarifa ?? 0`. While tarifa is `0`/unresolved, the summary bar renders `—` for cost. Saving stays enabled: `estimateToBudgetPayload` persists only `hours`/`totalHoras`/`breakdown`/`qty` — **no money field is ever persisted** — so a transient tarifa gap cannot corrupt data.

## Row readiness

Catalog row ready ⟺ `pieza !== ''`. Manual row ready ⟺ `pieza.trim() !== '' && manualCategory != null && manualHours > 0`. `estimate` is `null` until every row is ready (preserves today's all-or-nothing behaviour). When zero catalog rows exist, no network call is made at all and `buildEstimate` resolves synchronously.

## Edit mode (`simulador/[id]/page.tsx:77-84`)

Rehydrate per piece: `p.damageLevel === 'Manual'` → `mode: 'manual'`, `manualHours = p.totalHoras / Math.max(p.qty, 1)`, `manualCategory = CATEGORY_BY_PROCESO[p.breakdown?.[0]?.proceso] ?? 'BODYWORK'`; otherwise `mode: 'catalog'` as today. Cast becomes `as LineDamageLabel`. Behaviour is otherwise identical to create mode — both pages consume the same hook and the same `SimulatorForm`.

## UI (`simulator-form.tsx:162-235`)

Leading `h-9 w-9 flex-shrink-0` icon toggle button in **both** modes (`List` ↔ `PenLine`, `title="Pieza del catálogo" / "Pieza manual"`), so the row keeps a single stable layout. Then:

| Slot | Catalog | Manual |
|---|---|---|
| flex-1 | `<select>` pieza | `<input type="text">` free-text pieza |
| w-32 | Daño select | **Categoría** select (Chapería/Preparación/Pintura) |
| w-16 | — | **Horas** `<input type="number" step="0.1" min="0.1">` |
| w-16 / w-14 | Qty | Qty (narrowed to `w-14`) |
| auto | Trash | Trash |

Toggling a row resets its mode-specific fields (`pieza: ''`) so a stale catalog selection can never leak into a manual row. The existing per-row breakdown strip is unchanged — a manual row shows hours in exactly one of the three categories.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web/src/lib/api.ts` | Modify | `LineDamageLabel`; `SimulatorLineResult.damageLevel: LineDamageLabel`; `BudgetSimulatorConfig` + `getBudgetSimulatorConfig` |
| `apps/web/src/hooks/use-budget-simulator.ts` | Modify | `useBudgetSimulatorConfig()` |
| `apps/web/src/app/(dashboard)/presupuesto/simulador/_shared/use-simulator-form.ts` | Modify | `SimulatorItem` + `mode`, split/synthesize/merge, derived `estimate`, signature-keyed `catalogResult` |
| `apps/web/src/app/(dashboard)/presupuesto/simulador/_shared/simulator-form.tsx` | Modify | Row mode toggle + manual fields |
| `apps/web/src/app/(dashboard)/presupuesto/simulador/[id]/page.tsx` | Modify | Manual-aware rehydration |
| `apps/web/src/components/budget/budget-pdf.tsx` | Modify | `Record<LineDamageLabel, …>` + `Manual` entry in `DAMAGE_LABEL`/`DAMAGE_COLOR` |
| `apps/web/src/app/(dashboard)/presupuesto/simulador/page.tsx` | Modify | Only if the `if (estimate)` guard needs tightening after the derivation lands |
| `apps/api/**` | **Unchanged** | No DTO, entity, migration, or catalog change |

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `buildEstimate` order preservation with mixed catalog/manual rows | jest, `apps/web/src/__tests__/` |
| Unit | Manual line: `horas = manualHours × qty`, `totalMdo = totalHoras × tarifa`, exactly one breakdown entry with the right `proceso` | jest |
| Unit | **Manual rows never appear in the `/estimate` payload** (mocked mutation, assert arg) | jest |
| Unit | Stale `catalogResult` signature ⇒ `estimate === null` | jest |
| Unit | Edit rehydration: `'Manual'` piece → `mode: 'manual'` + category/hours restored | jest |
| Integration | 100% manual budget: PDF renders `Manual`, no `undefined`/0h; WhatsApp string well-formed | jest + render |
| Guard | `use-simulator-form` never imports `createCatalogItem`/`updateCatalogItem`; catalog row count unchanged after save | jest import assertion + manual/e2e check |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Frontend-only, existing authenticated endpoints.

## Migration / Rollout

No migration. Frontend-only; `bodyshop_catalog` is never written. The manual row exists solely in client memory until serialized into the `BudgetAppointment` `pieces`/`processes` jsonb. Rollback = revert the `apps/web` commits; already-saved budgets keep rendering (`damageLevel: 'Manual'` is a valid `string`, `DAMAGE_COLOR` has a `?? COLOR.slate700` fallback at `budget-pdf.tsx:264`; only `DAMAGE_LABEL` at line 274 would print `undefined` after a revert — acceptable, pre-existing shape tolerance).

## Open Questions

- [ ] None blocking. The three proposal questions are resolved and treated as requirements.
