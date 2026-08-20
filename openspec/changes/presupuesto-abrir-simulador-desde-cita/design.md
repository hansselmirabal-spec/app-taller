# Design: Open the Simulator from a scheduled budget appointment

## Technical Approach

Proposal Approach (Exploration Option 1), with the open week-data question resolved
in favor of **Option B**: `GET /budget-appointments` gains `from`/`to`, mirroring
`appointments.controller.ts:26-45`. One week query feeds BOTH panels of the new
board; the left agenda is a client-side `filter(a => a.date === selectedDay)` of
that same dataset. Simulator create/edit share one extracted form; edit mode is
PATCH-only and never auto-persists.

## Architecture Decisions

### Decision 1: Week data via `from`/`to` on the existing endpoint (Option B)

| Option | Cost | Verdict |
|---|---|---|
| A — `useQueries` fan-out, 5 single-day requests | 5 req/week change; `useQueries` has **zero precedent** in this repo; 5 loading/error states to reconcile client-side | Rejected |
| B — `from`/`to` params + `findByRange` | ~90 lines backend+client; 1 request serves both panels | **Chosen** |

**Rationale**: the identical need (week/kanban range) is already solved this exact
way three layers deep — `appointments.controller.ts:40-43` → `getAppointmentsByRange`
(`lib/api.ts:456`) → `useAppointmentsByRange` (`use-appointments.ts:17`). Option A
would invent a second, inconsistent answer to a solved problem. `date` stays
supported, so the change is additive and backward-compatible.

**Hard requirement**: `findByRange` MUST reproduce `findByDate`'s role scoping
(`budget-appointments.service.ts:163-171` — `callerRole === 'perito'` filters by
`peritoId`). Omitting it silently leaks other peritos' budgets. RED test required.

### Decision 2: Edit-mode prefill/save contract

| Concern | Rule |
|---|---|
| Loading | Full-screen `Loader2` spinner, identical to `[id]/page.tsx:56-62`. Form is NOT rendered partially (avoids the debounce effect firing on empty items). |
| 404 / fetch error | Terminal state "Presupuesto no encontrado" + "Volver a Presupuestos" button. **No auto-redirect** — a deleted/typo'd id must stay distinguishable from a working nav. |
| Hydration | Seed `items` from `appt.pieces` ONCE, guarded by a `useRef` flag — not a `useEffect` dep on `appt`. A refetch (focus/invalidate) must never wipe in-progress edits. `pieces` null/empty → `[newItem()]`. |
| Re-estimate on load | Allowed and expected (the existing debounced `POST /budget-simulator/estimate` effect). **No PATCH is ever issued from an effect.** If recomputed totals differ from `appt.processes`, show a non-blocking notice; never auto-save. |
| Save | Only `useUpdateBudgetProcesses` with `{processes, pieces}` (same payload shape as `simulador/page.tsx:200-211`). Never `useCreateBudgetAppointment`. No date/time modal — this route does not reschedule. |
| Empty guard | Block save when `processes.length === 0`; a PATCH with `processes: []` would wipe a previously saved estimate. |
| Success / failure | Success → `router.push('/presupuesto')`. Failure → inline error, stay on page (never lose the estimate). |

### Decision 3: Non-pending redirect

`router.replace('/presupuesto/{id}?readonly=1')` (replace, so Back does not bounce
into the redirecting route). Fires after fetch, **before** hydration/estimate.
`[id]/page.tsx` gains one additive amber banner when `readonly=1`: *"Este
presupuesto ya no está pendiente — se abre en modo lectura. Solo los pendientes se
editan en el Simulador."* Rejected: silent redirect (user clicks edit, lands
read-only, no explanation); a toast (no toast primitive exists project-wide).
This expands the "`[id]/page.tsx` unchanged" boundary by exactly one banner.

### Decision 4: Week anchor

`startOfWeek(new Date(), { weekStartsOn: 1 })`, computed on mount. Selected day =
today when Mon-Fri, else Friday of that week. No persistence, no localStorage.
Rejected: "week of the last-edited budget" — non-deterministic landing screen, and
saving a back-dated budget would drop the user in the past. On Sat/Sun this
naturally anchors the week that just ended (full board) instead of an empty
upcoming week.

### Decision 5: Asymmetric panel scopes — intentional

Left = one day, right = whole week. The panels answer different questions: a
timeline is unreadable at 5 days (~40 rows), a status board is useless at one day
(3 of 4 columns permanently empty). Cost of the asymmetry is zero — both derive
from the same single week query (Decision 1), and the day chips need week-wide
counts anyway. Empty-state copy stays week-scoped ("Sin rechazados esta semana").

## Data Flow

```
GET /budget-appointments?workshopId&from&to   (1 request, role-scoped)
        │
        ▼  week: BudgetAppointment[]
  ┌─────┴──────────────────────────────┐
  │ left: week.filter(date===selected) │ → AgendaTimeline → /presupuesto/simulador/{id}
  │ chips: countBy(date)               │
  │ right: groupBy(status) × 4 columns │ → BudgetCard(compact) → /presupuesto/simulador/{id}
  └────────────────────────────────────┘

/presupuesto/simulador/{id}
  useBudgetAppointment(id) ─┬─ error → "no encontrado" (terminal)
                            ├─ status !== pending → replace(/presupuesto/{id}?readonly=1)
                            └─ pending → hydrate once → debounced estimate (read-only)
                                          └─ explicit Guardar → PATCH :id/processes → /presupuesto
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/.../budget-appointments.controller.ts` | Modify | `find()`: keep `date` branch, add `from`+`to` branch (`DATE_RE` on both, `from <= to`) |
| `apps/api/.../budget-appointments.service.ts` | Modify | `findByRange(workshopId, from, to, callerId, callerRole)` with `Between` + identical perito scoping |
| `apps/web/src/lib/api.ts` | Modify | `getBudgetAppointmentsRange(workshopId, from, to)` next to `getBudgetAppointments` (L1597) |
| `apps/web/src/hooks/use-budget-appointments.ts` | Modify | `useBudgetAppointmentsRange(workshopId, from, to)`, key `[KEY,'range',ws,from,to]`, `staleTime: 30_000` |
| `apps/web/.../presupuesto/simulador/_shared/*` | Create | Extracted Simulator form + estimate/items state, shared by create and edit |
| `apps/web/.../presupuesto/simulador/page.tsx` | Modify | Consume shared form; delete `handleEnterTaller`, its modal/button/state and `createBodyshopEntry` import |
| `apps/web/.../presupuesto/simulador/[id]/page.tsx` | Create | Edit mode: fetch, status gate, hydrate-once, PATCH-only save |
| `apps/web/.../presupuesto/page.tsx` | Rewrite | Two-panel board, week chips + counts, 4 status columns, `view` toggle removed |
| `apps/web/.../presupuesto/[id]/page.tsx` | Modify | `?readonly=1` banner only |

## Interfaces / Contracts

```ts
// controller — additive, `date` branch unchanged
@Get() find(@Query('workshopId') workshopId, @Query('date') date?,
            @Query('from') from?, @Query('to') to?, @CurrentUser() user?)

// service
findByRange(workshopId: string, from: string, to: string,
            callerId?: string, callerRole?: string): Promise<BudgetAppointment[]>
// where: { workshopId, date: Between(from, to), ...(role==='perito' && { peritoId: callerId }) }
// order: { date: 'ASC', timeStart: 'ASC' }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (api) | `findByRange` perito scoping identical to `findByDate` | Service spec: perito caller sees only own rows |
| Unit (api) | `from`/`to` validation; `date` branch still works | Controller spec: bad format → 400, `from > to` → 400 |
| Unit (web) | Hydration runs once; refetch does not wipe edits | Render, mutate items, trigger refetch, assert items intact |
| Unit (web) | No PATCH from any effect; save blocked on empty processes | Assert mutation not called after load/estimate |
| Integration | Non-pending → `replace` to `?readonly=1`; 404 → terminal state | Route-level test with mocked query states |
| Manual | Board counts, 4 empty states, colors byte-identical to `STATUS_CONFIG` | QAS smoke |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, or executable-file classification.
Client-side page routing only. The `status === 'pending'` gate is a UX guard, not
the security boundary: `updateProcesses` already rejects non-pending server-side
(`budget-appointments.service.ts:192-195`). The one real authorization surface is
perito role scoping on the new range query — covered as a RED test above.

## Migration / Rollout

No migration. Endpoint change is additive and backward-compatible. Rollback per
slice; PR1 can ship and sit unused with zero user-visible effect.

### Chained PR plan (400-line budget risk: **High**)

| # | Slice | Est. lines | Depends on |
|---|-------|-----------|------------|
| 1 | `from`/`to` endpoint + service + api client + hook + specs (no UI consumer) | ~110 | — |
| 2 | Extract shared Simulator form/logic; create mode behavior identical | ~300 | — |
| 3 | `simulador/[id]` edit route + repoint 4 nav call sites + remove "Ingresar al taller" + `readonly` banner | ~200 | 2 |
| 4 | Two-panel board: week chips, 4 status columns, `view` toggle removed | ~370 | 1, 3 |

Adjusts the proposal's 3 slices to 4: the backend range work is a different review
surface (API contract + authorization test) and must not be buried inside the
370-line board rewrite. Linear chain 1 → 2 → 3 → 4. PR4 is the tightest against
budget; if it overruns, split the week strip out of the columns.

## Open Questions

- [ ] None blocking. All 5 questions carried from the proposal are resolved above.
