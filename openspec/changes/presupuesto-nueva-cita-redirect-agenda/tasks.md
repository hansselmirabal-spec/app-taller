# Tasks: Create flow lands on Agenda; budget detail becomes read-only review

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~100 (≈95 deletions / ≈5 additions, per design.md Migration/Rollout) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Redirect + read-only detail (all 3 files) | PR 1 (single) | `pnpm --filter @app-taller/web typecheck` | Manual QA matrix (Phase 3) — no RTL harness in repo | `git revert` the single PR; no other file depends on the deleted code (verified below) |

## Phase 1: Redirect create flows to the board

- [x] 1.1 `apps/web/src/app/(dashboard)/presupuesto/nueva-cita/page.tsx:89` — replace `router.push(\`/presupuesto/${result.id}\`)` with `router.replace('/presupuesto')`.
- [x] 1.2 `apps/web/src/app/(dashboard)/presupuesto/simulador/page.tsx:72` — same replacement, create-mode branch only; leave the preceding `updateProcesses` call (L65-70) untouched.

## Phase 2: Collapse `/presupuesto/[id]/page.tsx` to read-only

- [x] 2.1 Import cleanup (L6, L12, L17): remove `Plus`, `Trash2` from the `lucide-react` import (keep `Loader2`); remove `useUpdateBudgetProcesses` from the hooks import; remove `import type { BudgetProcess } from '@/types';`.
- [x] 2.2 Delete `PROCESS_CATALOG` (L19-26).
- [x] 2.3 Delete `const updateProcesses = useUpdateBudgetProcesses();` (L53).
- [x] 2.4 Delete `processes`, `isDirty`, `newCode`, `newHours` state (L58-61).
- [x] 2.5 Change L85 to `const effectiveProcesses = appt.processes ?? [];`.
- [x] 2.6 Delete `addProcess`, `removeProcess`, `updateHours`, `saveProcesses` (L89-125).
- [x] 2.7 Delete the `if (isDirty) { ... }` guard inside `openApproveModal` (L132-135); keep the `effectiveProcesses.length === 0` guard.
- [x] 2.8 Delete `usedCodes`, `availableProcesses` (L174-175).
- [x] 2.9 Collapse the process-list ternary (L331-352) to keep only the read-only `<span className="text-sm font-semibold text-slate-700">{p.hours}h</span>` branch — same wrapper `<div>`, same `key={p.code}`, same classNames.
- [x] 2.10 Delete the "Agregar proceso" block (L360-398).
- [x] 2.11 Delete the "Guardar cambios" block (L400-411).
- [x] 2.12 (Optional, copy-only) Update the empty state text to point to the Simulator, e.g. `Sin procesos cargados — se cargan desde el Simulador`. No behavior change; skip if out of scope for this pass. — Skipped: kept original "Sin procesos cargados" text, out of scope for this pass.

## Phase 3: Verification (no new automated tests — see design Decision 5)

- [x] 3.1 `pnpm --filter @app-taller/web typecheck` — passes. Note: `tsconfig.json` has no `noUnusedLocals`, so this does NOT catch leftover unused imports; Phase 2 deletions must be applied by hand.
- [x] 3.2 `next build` on `apps/web` — passes with no missing-reference errors.
- [x] 3.3 `next lint` on `apps/web` — BLOCKED: Next.js 16.2.3 removed the `next lint` command entirely (`next --help` lists no `lint` subcommand; not a pnpm arg-parsing issue). No `eslint` binary installed as a fallback. Repo-level tooling gap, unrelated to this change; backstopped by 3.4 instead.
- [x] 3.4 `rg 'PROCESS_CATALOG|addProcess|saveProcesses|isDirty|updateHours|removeProcess|setProcesses' apps/web/src` — confirmed zero hits in `[id]/page.tsx`; remaining hits are unrelated identifiers in `seguimiento/kanban/page.tsx` (`ENTRY_PROCESS_CATALOG`, `addProcessOpen`, etc.) as predicted by design.md.
- [ ] 3.5 Manual QA — "+ Cita" submit lands on `/presupuesto`; browser Back does not re-show the submitted form. — Not run by apply (no manual QA environment in this session); left for reviewer/QA.
- [ ] 3.6 Manual QA — Simulator create-mode save lands on `/presupuesto`; the appointment's saved processes are preserved (visible after opening `/presupuesto/[id]`). — Not run by apply; left for reviewer/QA.
- [ ] 3.7 Manual QA — `/presupuesto/[id]` shows no editor (no "Agregar proceso", no hours input, no "Guardar cambios") for `pending`, `approved`, `rejected`, and `cancelled` appointments. — Not run by apply; left for reviewer/QA.
- [ ] 3.8 Manual QA — Aprobar stays disabled at 0 processes; becomes enabled after processes are saved via the Simulator. — Not run by apply; left for reviewer/QA.
- [ ] 3.9 Manual QA — Rechazar and Cancelar still work on a `pending` appointment. — Not run by apply; left for reviewer/QA.
- [ ] 3.10 Manual QA — `/presupuesto/simulador/[id]` edit mode is unaffected; stale-tab redirect to `/presupuesto/[id]?readonly=1` for non-pending appointments still works. — Not run by apply; left for reviewer/QA.

## Post-review fix (critical, found on PR #93 by `review-reliability`)

- **Bug**: `budgetNavPath()` in `apps/web/src/app/(dashboard)/presupuesto/page.tsx:72-76` (preexisting, not touched by this change) routes every `pending` appointment clicked from the board to `/presupuesto/simulador/${id}` (edit mode), never to `/presupuesto/${id}`. Before this change, the only path into `/presupuesto/${id}` for a `pending` appointment was the post-create redirect — which Phase 1 replaced with `router.replace('/presupuesto')`. Net effect: after Phase 1+2, there was no reachable navigation path to Aprobar/Rechazar/Cancelar at all, since the Simulator edit screen only had "Guardar cambios".
- **Fix**: ported Aprobar/Rechazar/Cancelar (including the approve modal with repair start date) from `/presupuesto/[id]/page.tsx` into `apps/web/src/app/(dashboard)/presupuesto/simulador/[id]/page.tsx`'s sticky bottom bar, gated on `screenState === 'ready'` (this screen only ever renders for `pending` appointments — non-pending redirects to `/presupuesto/[id]?readonly=1` before hydration). Used a separate `actionError` state to avoid colliding with the `error` already returned by `useSimulatorForm()`. Aprobar gates on `appt.processes` (persisted data), not the in-progress `estimate`, so approving always reflects saved state — same rule the original screen enforced.
- **Verification**: `pnpm --filter web typecheck`, `pnpm --filter web build`, `pnpm --filter web test` (129/129) all clean. No test suite covers this file (unchanged from initial `sdd-verify` finding).
- **Not touched**: `budgetNavPath()` and the board's routing logic — out of scope per explicit decision, since the Simulator edit screen is where the board already sends `pending` clicks.

## Known, accepted, out-of-scope risk (do not fix here)

- `/presupuesto` is fixed to the current Mon-Fri week with no week navigation (`page.tsx:172`) and defaults `selectedDay` to today (`page.tsx:177-181`). An appointment created for a future day/week will not be visible in the day timeline immediately after redirect until that date is navigated to. Accepted by the proposal as out of scope. Follow-up idea for later: `/presupuesto?date=...` driving `selectedDay`/`weekStart`.
