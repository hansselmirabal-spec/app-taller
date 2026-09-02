# Design: Create flow lands on Agenda; budget detail becomes read-only review

## Technical Approach

Front-end only, three files, no new modules. (1) Both create call sites navigate to `/presupuesto` instead of `/presupuesto/${result.id}`, switching `push` → `replace`. (2) `/presupuesto/[id]/page.tsx` loses its manual hours editor: the `isEditable` ternary in the process list collapses to the already-existing read-only branch, and everything that only fed the editor is deleted. `useUpdateBudgetProcesses` keeps its definition — only this file's import goes.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| 1 | `router.replace('/presupuesto')` in both create flows | `router.push` | Back must not return to an already-submitted form. Both forms create unconditionally on submit, so a Back + resubmit is a real duplicate-appointment path. `replace` collapses `/presupuesto → nueva-cita → /presupuesto` into a single board entry. |
| 2 | No cache/refetch work added | Pass created id/date in query params; manual `refetch()` | `useCreateBudgetAppointment.onSuccess` already invalidates `['budget-appointments']` (`use-budget-appointments.ts:53`), and `updateProcesses` invalidates the same key. The board refetches on mount without help. |
| 3 | Read-only list reuses the existing non-editable JSX verbatim | New read-only sub-component | The `else` branch of the ternary (`<span className="text-sm font-semibold text-slate-700">{p.hours}h</span>`) is already the read-only rendering. Deleting the `if` branch is the whole change; extracting a component adds surface for zero gain. |
| 4 | Keep `isEditable` and the `effectiveProcesses.length === 0` guard in `openApproveModal` | Delete both | `isEditable` still gates the Aprobar/Rechazar/Cancelar block. The length guard is defense-in-depth behind an already-disabled button; removing the `isDirty` guard is enough. |
| 5 | No new automated test | Source-text assertion that the file no longer imports the hook; RTL component test | The repo's pattern (`return-process-modal.spec.ts`, `kanban-return-process-order.spec.ts`) is *extract pure function, test in isolation — no RTL harness*. This change extracts nothing and deletes stateful UI. A source-text test asserts on the diff, not behavior. Verification is `pnpm typecheck` + `next build` + manual QA. |

## Data Flow

    "+ Cita" / Simulador (create) ──create──→ API
              │                                │
              │                    invalidate ['budget-appointments']
              ▼                                │
       replace('/presupuesto') ────────────────┴──→ Agenda refetches week range

    /presupuesto/[id]:  appt.processes ──read-only──→ list  (no write path)
    Hours are authored ONLY at /presupuesto/simulador/[id].

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web/src/app/(dashboard)/presupuesto/nueva-cita/page.tsx` | Modify | L89 `router.push(\`/presupuesto/${result.id}\`)` → `router.replace('/presupuesto')` |
| `apps/web/src/app/(dashboard)/presupuesto/simulador/page.tsx` | Modify | L72 same change (create mode only; the `updateProcesses` call at L65-70 stays and still runs before navigating) |
| `apps/web/src/app/(dashboard)/presupuesto/[id]/page.tsx` | Modify | Delete the editor (below) |

### Exact deletions in `[id]/page.tsx` (line refs = pre-change)

| Lines | Delete |
|---|---|
| 6 | `Plus`, `Trash2` from the `lucide-react` import (last uses: 394, 347). `Loader2` stays. |
| 12 | `useUpdateBudgetProcesses,` from the hooks import |
| 17 | `import type { BudgetProcess } from '@/types';` (only use is L58) |
| 19-26 | `PROCESS_CATALOG` |
| 53 | `const updateProcesses = useUpdateBudgetProcesses();` |
| 58-61 | `processes`, `isDirty`, `newCode`, `newHours` state |
| 85 | Becomes `const effectiveProcesses = appt.processes ?? [];` |
| 89-125 | `addProcess`, `removeProcess`, `updateHours`, `saveProcesses` |
| 132-135 | `if (isDirty) { ... }` inside `openApproveModal` |
| 174-175 | `usedCodes`, `availableProcesses` |
| 331-352 | Ternary → keep only the read-only `<span>` branch |
| 360-398 | "Agregar proceso" block |
| 400-411 | "Guardar cambios" block |

Resulting list (unchanged wrapper, `key`, and classNames):

```tsx
{effectiveProcesses.map(p => (
  <div key={p.code} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
    <span className="flex-1 text-sm font-medium text-slate-700">{p.name}</span>
    <span className="text-sm font-semibold text-slate-700">{p.hours}h</span>
  </div>
))}
```

The `effectiveProcesses.length > 0 ? … : <p>Sin procesos cargados</p>` wrapper, the `Total: {totalHours}h` badge, `error`, the approve modal, and the actions block are untouched.

**Optional (copy only, no behavior):** in the empty state, point to the Simulator — e.g. `Sin procesos cargados — se cargan desde el Simulador`. Low reach (`budgetNavPath()` sends `pending` budgets to `/presupuesto/simulador/[id]`, so this screen is reached for `pending` mainly by direct URL). Take it or drop it in tasks; not required by spec.

## Interfaces / Contracts

None. No API, type, or hook signature changes. `useUpdateBudgetProcesses` is untouched and still consumed by `simulador/page.tsx:42` and `simulador/[id]/page.tsx`.

## Dead-Reference Verification

`rg 'PROCESS_CATALOG|addProcess|saveProcesses|isDirty|updateHours|removeProcess|setProcesses' apps/web/src` returns hits only in `[id]/page.tsx` plus `seguimiento/kanban/page.tsx`, whose hits are unrelated identifiers (`ENTRY_PROCESS_CATALOG`, `addProcessOpen`, `addProcessHours`, `addProcessMutation`, `onAddProcess`). Nothing in `[id]/page.tsx` is exported — it has a single `export default`. Zero cross-file breakage.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Static | No orphaned imports/identifiers | `pnpm --filter @app-taller/web typecheck` + `next build`. `tsconfig.json` has no `noUnusedLocals`, so unused imports do NOT fail typecheck — the deletions in the table above must be applied by hand, and `next lint` is the backstop. |
| Unit | — | None added (Decision 5). |
| Manual QA | "+ Cita" → lands `/presupuesto`, Back does not re-open the form; Simulator create → lands `/presupuesto` with processes preserved; `/presupuesto/[id]` shows no editor in any status; Aprobar disabled at 0 processes, enabled after Simulator save; Rechazar/Cancelar work; `simulador/[id]` edit mode unchanged | Per spec scenarios |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The routing change is client-side Next.js navigation to a static in-app path, with no user-controlled URL construction.

## Migration / Rollout

No migration. Revert the single PR to roll back. Diff forecast ≈ 95 deletions / ≈ 5 additions — well under the 400-line review budget; single PR.

## Open Questions

- [ ] Spec says the new appointment "appears in the Agenda for its scheduled day". `/presupuesto` anchors to the current Mon-Fri week with **no week navigation** (`page.tsx:172`) and defaults `selectedDay` to today (`page.tsx:177-181`). An appointment booked for another weekday is visible in the right-hand status board but not in the day timeline until that day is clicked; one booked outside the current week is not visible at all. Accept as-is (proposal scope), or follow up with `/presupuesto?date=…` driving `selectedDay`/`weekStart`.
