# Proposal: Perito hourly availability on budget appointments

## Intent

`presupuesto/nueva-cita` lets the user type any `timeStart`/`timeEnd` with no feedback. The backend only blocks a duplicate plate at the exact same slot, so the same perito can be booked into two overlapping appointments, on a day off, or outside his workday. Result: double-booked peritos, manual rescheduling, and customers waiting for someone who is already busy. The system already knows the perito's workday (`Technician.dailyHours`, `isPerito=true`), his absences (`TechnicianAbsence`), and his booked appointments — it just never uses them here.

## Scope

### In Scope

- Backend-authoritative overlap block in `BudgetAppointmentsService.create()`: reject (`BadRequestException`) any appointment whose range overlaps an existing active appointment for the same perito on the same date.
- New backend endpoint returning the perito's 1-hour availability blocks for a given date, computed from `dailyHours` + `TechnicianAbsence` + already-booked `BudgetAppointment` rows.
- Its own permissions guard + workshop scoping (must not inherit the unprotected `GET /capacity/absences` pattern).
- `nueva-cita` UI: render the returned blocks as a clickable grid once a date is chosen; refresh when an admin changes the perito.

### Out of Scope

- Unifying the four desynchronized `08:00` constants (`bodyshop.service.ts:173`, `capacity.service.ts:437`, `settings/calendar/page.tsx`, `appointments/new/page.tsx`) — separate change.
- Fixing the broken "Caso especial" (`type:'partial'`) absence mode, and hardening `GET /capacity/absences`.
- Mechanic-side scheduling, `workshop.config.weeklySchedule`/`lunchBreak`, per-technician start times, reschedule flows (none exist: only `PATCH :id/processes` and `:id/cancel`).

## Capabilities

### New Capabilities

- `budget-appointment-perito-availability`: perito workday/absence/booking-derived hourly availability and overlap rejection at booking time.

### Modified Capabilities

- None.

## Approach

Mirror the pattern already in production in `create()` for the plate check: `pg_advisory_xact_lock(hashtext('workshopId:date:peritoId'))` plus a transactional range query (`existing.timeStart < new.timeEnd AND existing.timeEnd > new.timeStart`). No `EXCLUDE USING gist` / `btree_gist` — that extension is unused in this repo and unjustified at this perito volume; the advisory lock gives the same guarantee level as the shipped pattern, with no new DB constraint or migration.

Availability is computed **server-side** so the grid and the create-time block can never disagree. Business rules: workday starts at `08:00` (same hardcoded value, not refactored); absence `full`/`holiday` → no blocks; absence `half` → available from `08:00` for `dailyHours / 2`, afternoon blocked (chosen convention, since `TechnicianAbsence` stores no time range); booked appointments subtract their blocks.

UI reuses the visual slot-grid precedent from `appointments/new/page.tsx` / `AlternativeDatesPanel` — pattern only, not its client-side conflict logic.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/modules/budget-appointments/budget-appointments.service.ts` | Modified | Overlap guard in `create()`; availability computation |
| `apps/api/src/modules/budget-appointments/budget-appointments.controller.ts` | Modified | New guarded availability endpoint |
| `apps/web/src/app/(dashboard)/presupuesto/nueva-cita/page.tsx` | Modified | Availability grid, perito/date refetch |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Concurrent double-booking slips past the advisory lock | Low | Same guarantee as the shipped plate guard; serialized per `workshop:date:perito` |
| "Half day = afternoon" convention wrong for some perito | Med | Explicit product decision; revisit only with a stored time range |
| New endpoint leaks absences cross-workshop | Low | Own guard + workshop scoping; does not reuse `/capacity/absences` |
| Legacy overlapping rows already in DB | Low | Validation applies on create only; existing rows untouched |

## Rollback Plan

Revert the commit. No migration, no schema change, no data backfill — behavior returns to free-text time entry with plate-only blocking.

## Dependencies

- None. Uses existing `Technician`, `TechnicianAbsence`, `BudgetAppointment` data.

## Success Criteria

- [ ] Creating an appointment overlapping the same perito's existing active appointment returns 400 with a clear message.
- [ ] Non-overlapping adjacent bookings (e.g. 09:00–10:00 then 10:00–11:00) are accepted.
- [ ] Choosing a date shows 1-hour blocks; hours outside the workday, absent, or already booked are not selectable.
- [ ] `half` absence shows only morning blocks up to `dailyHours / 2`; `full`/`holiday` shows none.
- [ ] Admin switching perito refetches the grid.
- [ ] The availability endpoint rejects unauthorized users and out-of-workshop peritos.
