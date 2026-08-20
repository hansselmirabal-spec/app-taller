# Proposal: Open the Simulator from a scheduled budget appointment

## Intent

Today, clicking a scheduled `BudgetAppointment` opens `/presupuesto/[id]`, a manual hours-by-process editor. The piece-based Simulator (`/presupuesto/simulador`) always starts empty and always creates a NEW appointment, so an advisor who booked a slot cannot build the real piece-based estimate for that booking — they retype hours by hand or produce a duplicate record. The Simulator also exposes a direct "Ingresar al taller" action that creates a bodyshop entry while bypassing budget approval entirely, so workshop entry can happen with no approved budget behind it.

Scope extension (confirmed by user, mockup approved): after saving, the advisor had no place that answers "where does every budget stand this week?". The landing screen is redesigned into a two-panel workspace so the post-save destination is a real status board, not the single-appointment approval page.

## Scope

### In Scope
- New dynamic route `/presupuesto/simulador/[id]` that prefills the Simulator from the existing appointment (plate, customer, phone, budget number, notes, `pieces` → items) and re-runs the estimate.
- Edit-mode save: when an id is present, save ONLY `PATCH /budget-appointments/:id/processes` with `{processes, pieces}`. Never call `useCreateBudgetAppointment`.
- Repoint the 4 navigation call sites in `presupuesto/page.tsx` (lines 304, 330, 347, 364 — Agenda + List) to the new route.
- Remove the direct "Ingresar al taller" action from the Simulator (`handleEnterTaller`, lines ~225-252, plus its button/date/error UI and `createBodyshopEntry` import).
- Respect the existing editable gate (`status === 'pending'`) before allowing an edit-mode save.
- **Redesign `presupuesto/page.tsx` into a two-panel workspace** (replaces the `view: 'grid' | 'list'` toggle at line 181 — it becomes the single default view, not a third option):
  - **Left "Agenda"**: week selector with 5 Mon-Fri chips, each showing that day's appointment count; below, the selected day's slots (time, customer, plate, motive/note, status pill). Same behavior as today's `AgendaTimeline`, now at half width.
  - **Right "Presupuestos por estado"**: 4 fixed columns, one per `BudgetAppointment.status` (`pending`/`approved`/`rejected`/`cancelled`), each with a header count and its own scroll. Cards are compact: customer, date/time, plate, insurer (`insuranceCompany`). Empty columns render an empty state ("Sin rechazados esta semana"), never blank.
  - Status colors reuse the existing `STATUS_CONFIG` verbatim (`presupuesto/page.tsx` L20-25, `[id]/page.tsx` L28-32). No new color tokens.
- **Post-save destination changes**: edit-mode save returns to `/presupuesto` (the new board), where the edited budget appears in its status column. `[id]/page.tsx` is still opened by clicking any card or agenda slot — unchanged as the entry point to the Simulator for `pending` and to read-only for other statuses.

### Out of Scope
- Any change to approval logic. `[id]/page.tsx` stays exactly as is: the only place to approve/reject/cancel, and the only editor for POLISH / MECHANIC / FINAL_CONTROL (the estimate engine only produces BODYWORK / PREP / PAINT).
- Backend changes — **now conditional, see Risks**. Preferred path keeps the API untouched by fanning out 5 single-day queries client-side.
- Adding an `insuranceCompany` field to the Simulator (still unreachable there; PATCH never overwrites it). The board only READS it.
- Migrating the 13 pending QAS appointments with no `processes` — they keep using `[id]/page.tsx`.
- Query-param `?id=` addressing (rejected in favor of a path segment).
- Saturday/Sunday in the week strip (Mon-Fri only, per approved mockup).
- Drag-and-drop between status columns. The board is read/navigate only; status changes stay in `[id]/page.tsx`.

## Capabilities

### New Capabilities
- `budget-simulator-edit`: opening, prefilling and updating an existing budget appointment from the Simulator, with create-vs-update save branching and the status gate.
- `budget-workspace-board`: the two-panel landing screen — week agenda plus status-grouped budget board, its counts, empty states, and navigation targets.

### Modified Capabilities
- None (no `openspec/specs/` baseline exists yet; approval behavior is unchanged).

## Approach

Exploration Option 1. Add `simulador/[id]/page.tsx` reusing `useBudgetAppointment(id)` for the prefill fetch and `useUpdateBudgetProcesses` for the save; seed the Simulator's local `Item[]` from `pieces` and let the existing debounced `POST /budget-simulator/estimate` effect recompute `breakdown`/`totalHoras` so saved data stays consistent with the engine. Extract shared Simulator UI/logic so create-mode and edit-mode do not fork into duplicated screens.

The board reuses the existing `AgendaTimeline`, `BudgetCard` and `STATUS_CONFIG` from `presupuesto/page.tsx` rather than introducing new primitives; `BudgetCard` gains a compact variant for the narrower columns. The approved HTML mockup is a visual reference for structure and hierarchy only — implementation is React/Tailwind on existing components, not a port of that markup.

Removing `handleEnterTaller` makes "Aprobar e ingresar al taller" in `[id]/page.tsx` the only way to create a bodyshop entry from a budget — a deliberate tightening, not a refactor side effect.

### Week data (decision needed at design time)

`GET /budget-appointments` accepts exactly `workshopId` + `date`, both required and regex-validated (`budget-appointments.controller.ts` L22-31); `useBudgetAppointments` mirrors that single-date shape. The approved week-scoped design therefore needs one of:

| Option | Cost | Effect on scope |
|---|---|---|
| A — 5 parallel single-day queries (`useQueries`) client-side | Frontend only; 5 requests per week change | Keeps "no backend changes" true. **Preferred for slice 1.** |
| B — add `from`/`to` range params to the endpoint | Controller + service + client + hook | Breaks the frontend-only boundary and the rollback story |

Recommend A now, B only if the 5-request fan-out measurably degrades the week switch.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/app/(dashboard)/presupuesto/simulador/[id]/page.tsx` | New | Edit-mode entry point: fetch, prefill, PATCH-only save |
| `apps/web/src/app/(dashboard)/presupuesto/simulador/page.tsx` | Modified | 684 lines today; extract shared form/logic, remove `handleEnterTaller` + its UI |
| `apps/web/src/app/(dashboard)/presupuesto/page.tsx` | Rewritten | 388 lines today; two-panel layout, week strip, 4 status columns, `view` toggle removed |
| `apps/web/src/hooks/use-budget-appointments.ts` | Modified | Week fan-out hook (Option A) |
| `apps/web/src/app/(dashboard)/presupuesto/[id]/page.tsx` | Unchanged | Approval + non-piece processes remain here |
| `apps/api/**` | Unchanged | Existing PATCH endpoint suffices (unless Option B is chosen) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Combined diff far exceeds the 400-line review budget** | **High** | See forecast below — chained PRs required |
| Week-scoped UI on a single-date API forces an unplanned backend change | Med | Option A keeps it frontend-only; decide in `sdd-design` before `sdd-tasks` |
| Appointments with `pieces == null` (51 of 52 in QAS) open an empty Simulator | High | Confirmed as the intended "build the estimate now" state; keep a visible link back to `/presupuesto/[id]` |
| Re-estimate on load rewrites `breakdown`/`totalHoras` for an already-saved estimate | Med | Only persist on explicit save; never auto-PATCH on load |
| Non-pending appointment reached via a stale/typed URL | Med | Confirmed: redirect to read-only `/presupuesto/[id]` |
| Users relied on the removed direct "Ingresar al taller" shortcut | Med | Intentional per scope decision; announce in release notes |
| Removing the `list` view removes the only dense multi-status view some users rely on | Low | The right panel is strictly richer — 4 statuses at once instead of 3 stacked sections |
| Week fan-out multiplies requests (5x per week change) | Low | 30s `staleTime` already caches per day; days are shared across weeks |

### PR size forecast (flag for `sdd-tasks`)

Grounded on current file sizes, not estimates of intent:

- `presupuesto/page.tsx` — 388 lines today, body fully restructured: ~150 deletions + ~220 additions ≈ **370 lines on its own**.
- Simulator shared extraction out of a 684-line file: **200-350 lines** (mostly moves, but `additions + deletions` counts them).
- New `simulador/[id]/page.tsx` + hook + call-site repointing + shortcut removal: **100-150 lines**.

**400-line budget risk: High.** The board redesign alone nearly consumes the full budget, and it is additive to work that was already forecast as Medium. A single PR is not defensible here. Suggested chain (final decision belongs to `sdd-tasks`, which holds `chained PR strategy: auto-forecast`):

1. Extract shared Simulator form/logic (no behavior change).
2. Add `simulador/[id]` edit route + repoint the 4 call sites + remove "Ingresar al taller".
3. Redesign `presupuesto/page.tsx` into the two-panel board + week fan-out + post-save redirect to `/presupuesto`.

Slice 3 depends on slice 2 only for the post-save redirect target; it is otherwise autonomous and independently revertible.

## Rollback Plan

Frontend-only (assuming Option A), no migrations. Revert per slice: slice 3 restores the previous `presupuesto/page.tsx` including the `view` toggle; slice 2 restores the 4 navigation targets and `handleEnterTaller`, deletes `simulador/[id]/`; slice 1 is a pure move. No data written by this change is structurally new — edit-mode writes use the same PATCH payload the Simulator already sends today.

## Dependencies

- None. `useBudgetAppointment`, `useUpdateBudgetProcesses` and `PATCH /budget-appointments/:id/processes` already exist.
- Approved visual mockup (external artifact) — reference only, not a build dependency.

## Success Criteria

- [ ] Clicking a budget appointment in the agenda or in any status column opens the Simulator prefilled with that appointment's data.
- [ ] Saving from edit mode updates the same `BudgetAppointment` (record count unchanged; no duplicate created) and lands on `/presupuesto` with the budget visible in its status column.
- [ ] Saving without `pieces` never wipes previously saved piece detail.
- [ ] `/presupuesto` shows the two-panel layout as its only view; the `grid`/`list` toggle is gone.
- [ ] All 4 status columns always render, with a per-status empty state when the week has none.
- [ ] Status colors are byte-identical to the current `STATUS_CONFIG` values.
- [ ] The Simulator no longer offers any direct path into the workshop; the only bodyshop entry creation from a budget is via approval in `[id]/page.tsx`.
- [ ] `[id]/page.tsx` still edits POLISH / MECHANIC / FINAL_CONTROL and still approves/rejects/cancels, unchanged.

## Proposal question round

Round 1 assumptions are now **CLOSED** — all three confirmed by the user in conversation:

1. **CLOSED — confirmed.** An appointment with no `pieces` opens an empty Simulator; that is the normal, intended state, not an error.
2. **CLOSED — confirmed, superseded by an approved mockup.** Post-save no longer lands on `/presupuesto/[id]`. It lands on the redesigned two-panel `/presupuesto` board.
3. **CLOSED — confirmed.** Non-pending appointments redirect to the read-only `/presupuesto/[id]` instead of opening an editable Simulator.

Open for round 2 (non-blocking; can also be settled in `sdd-design`):

1. Which week does the board default to on load — the current week, or the week containing the last-edited budget?
2. Do the 4 status columns scope to the selected week (implied by "Sin rechazados esta semana") while the agenda panel scopes to the selected day? Confirm the two panels use different time scopes on purpose.
3. Option A vs B for week data (see Approach) — product-visible only if the week switch feels slow.

Artifact store: hybrid — also written to `openspec/changes/presupuesto-abrir-simulador-desde-cita/proposal.md`.
