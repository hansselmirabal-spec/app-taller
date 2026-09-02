# Proposal: Create flow lands on Agenda; budget detail becomes read-only review

## Intent

Booking a budget appointment ("+ Cita" or Simulator create mode) currently drops the advisor into `/presupuesto/[id]`, a detail screen that also exposes a second, manual "hours per process" editor. That contradicts the intended flow: booking only reserves the slot, and the Simulator is the single source for hours. Two editors mean two ways to load the same data, an inconsistent hand-off between advisor and appraiser, and a landing screen that hides the Agenda where the advisor actually works.

## Scope

### In Scope

- After creating an appointment, redirect to `/presupuesto` (Agenda) instead of `/presupuesto/[id]` — `nueva-cita/page.tsx:89` and `simulador/page.tsx:72` (create mode only).
- Strip the manual hours editor from `/presupuesto/[id]`: local `PROCESS_CATALOG`, `addProcess` / `removeProcess` / `updateHours` / `saveProcesses`, state (`processes`, `isDirty`, `newCode`, `newHours`), the "Agregar proceso" and "Guardar cambios" blocks, and the `useUpdateBudgetProcesses` import **in that file only**.
- Leave `/presupuesto/[id]` as read-only hours + Aprobar / Rechazar / Cancelar.

### Out of Scope

- Backend. `approve()` already rejects empty `processes` (`budget-appointments.service.ts:242`) and the Approve button is already disabled on the same condition.
- `useUpdateBudgetProcesses` hook itself — still used by `simulador/page.tsx` and `simulador/[id]/page.tsx`.
- `simulador/[id]/page.tsx` edit mode and its non-pending → `?readonly=1` redirect.
- New automated tests for these paths (none exist today; can be a follow-up).

## Capabilities

### New Capabilities

- `budget-detail-readonly-review`: `/presupuesto/[id]` is a read-only review + approve/reject/cancel screen; hours are authored only in the Simulator.

### Modified Capabilities

- `budget-workspace-board`: add the post-create redirect requirement (create → `/presupuesto`), alongside the existing post-save redirect.

## Approach

Front-end only, three files. Two one-line `router.push` target changes, plus a UI simplification that collapses the `isEditable` hours ternary to a static read-only display and deletes the now-dead editor code. No orphaned imports, no cross-file usage of `PROCESS_CATALOG`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/app/(dashboard)/presupuesto/nueva-cita/page.tsx` | Modified | Redirect → `/presupuesto` |
| `apps/web/src/app/(dashboard)/presupuesto/simulador/page.tsx` | Modified | Create-mode redirect → `/presupuesto` |
| `apps/web/src/app/(dashboard)/presupuesto/[id]/page.tsx` | Modified | Manual editor removed; read-only display retained |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A freshly created `pending` appointment has no `processes` until the appraiser opens the Simulator, so Approve stays disabled | High (by design) | Intentional. QA must verify the disabled state and that `/presupuesto/simulador/{id}` (already routed by `budgetNavPath()`) is the path to load hours |
| No test coverage on either touched path | Medium | Manual QA in this change; add assertions in a follow-up |
| Advisors used to landing on the detail page may look for the manual editor | Low | Agenda is the natural work surface; Simulator is one click away from any card |

## Rollback Plan

Revert the single commit/PR. All three edits are self-contained front-end changes with no schema, API, or data migration.

## Dependencies

None.

## Success Criteria

- [ ] Creating from "+ Cita" lands on `/presupuesto` with the new appointment visible in the Agenda.
- [ ] Creating from the Simulator lands on `/presupuesto`; processes saved during create are preserved.
- [ ] `/presupuesto/[id]` shows no "Agregar proceso" or "Guardar cambios" controls in any status.
- [ ] Aprobar / Rechazar / Cancelar still work; Aprobar stays disabled while `processes` is empty.
- [ ] `simulador/[id]` edit mode is unchanged and still saves via `useUpdateBudgetProcesses`.
