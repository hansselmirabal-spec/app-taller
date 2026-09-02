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

- [ ] 1.1 `apps/web/src/app/(dashboard)/presupuesto/nueva-cita/page.tsx:89` — replace `router.push(\`/presupuesto/${result.id}\`)` with `router.replace('/presupuesto')`.
- [ ] 1.2 `apps/web/src/app/(dashboard)/presupuesto/simulador/page.tsx:72` — same replacement, create-mode branch only; leave the preceding `updateProcesses` call (L65-70) untouched.

## Phase 2: Collapse `/presupuesto/[id]/page.tsx` to read-only

- [ ] 2.1 Import cleanup (L6, L12, L17): remove `Plus`, `Trash2` from the `lucide-react` import (keep `Loader2`); remove `useUpdateBudgetProcesses` from the hooks import; remove `import type { BudgetProcess } from '@/types';`.
- [ ] 2.2 Delete `PROCESS_CATALOG` (L19-26).
- [ ] 2.3 Delete `const updateProcesses = useUpdateBudgetProcesses();` (L53).
- [ ] 2.4 Delete `processes`, `isDirty`, `newCode`, `newHours` state (L58-61).
- [ ] 2.5 Change L85 to `const effectiveProcesses = appt.processes ?? [];`.
- [ ] 2.6 Delete `addProcess`, `removeProcess`, `updateHours`, `saveProcesses` (L89-125).
- [ ] 2.7 Delete the `if (isDirty) { ... }` guard inside `openApproveModal` (L132-135); keep the `effectiveProcesses.length === 0` guard.
- [ ] 2.8 Delete `usedCodes`, `availableProcesses` (L174-175).
- [ ] 2.9 Collapse the process-list ternary (L331-352) to keep only the read-only `<span className="text-sm font-semibold text-slate-700">{p.hours}h</span>` branch — same wrapper `<div>`, same `key={p.code}`, same classNames.
- [ ] 2.10 Delete the "Agregar proceso" block (L360-398).
- [ ] 2.11 Delete the "Guardar cambios" block (L400-411).
- [ ] 2.12 (Optional, copy-only) Update the empty state text to point to the Simulator, e.g. `Sin procesos cargados — se cargan desde el Simulador`. No behavior change; skip if out of scope for this pass.

## Phase 3: Verification (no new automated tests — see design Decision 5)

- [ ] 3.1 `pnpm --filter @app-taller/web typecheck` — passes. Note: `tsconfig.json` has no `noUnusedLocals`, so this does NOT catch leftover unused imports; Phase 2 deletions must be applied by hand.
- [ ] 3.2 `next build` on `apps/web` — passes with no missing-reference errors.
- [ ] 3.3 `next lint` on `apps/web` — backstop for orphaned imports/identifiers Phase 2 may have missed.
- [ ] 3.4 `rg 'PROCESS_CATALOG|addProcess|saveProcesses|isDirty|updateHours|removeProcess|setProcesses' apps/web/src` — confirm zero hits in `[id]/page.tsx` (remaining hits, if any, must be unrelated identifiers like `seguimiento/kanban/page.tsx`'s `ENTRY_PROCESS_CATALOG`/`addProcessOpen`/etc.).
- [ ] 3.5 Manual QA — "+ Cita" submit lands on `/presupuesto`; browser Back does not re-show the submitted form.
- [ ] 3.6 Manual QA — Simulator create-mode save lands on `/presupuesto`; the appointment's saved processes are preserved (visible after opening `/presupuesto/[id]`).
- [ ] 3.7 Manual QA — `/presupuesto/[id]` shows no editor (no "Agregar proceso", no hours input, no "Guardar cambios") for `pending`, `approved`, `rejected`, and `cancelled` appointments.
- [ ] 3.8 Manual QA — Aprobar stays disabled at 0 processes; becomes enabled after processes are saved via the Simulator.
- [ ] 3.9 Manual QA — Rechazar and Cancelar still work on a `pending` appointment.
- [ ] 3.10 Manual QA — `/presupuesto/simulador/[id]` edit mode is unaffected; stale-tab redirect to `/presupuesto/[id]?readonly=1` for non-pending appointments still works.

## Known, accepted, out-of-scope risk (do not fix here)

- `/presupuesto` is fixed to the current Mon-Fri week with no week navigation (`page.tsx:172`) and defaults `selectedDay` to today (`page.tsx:177-181`). An appointment created for a future day/week will not be visible in the day timeline immediately after redirect until that date is navigated to. Accepted by the proposal as out of scope. Follow-up idea for later: `/presupuesto?date=...` driving `selectedDay`/`weekStart`.
