# Budget Appointment Perito Availability Specification

## Purpose

Prevent double-booking a perito and give the `presupuesto/nueva-cita` UI a
backend-authoritative source of truth for which 1-hour blocks of a perito's
workday are actually free on a given date, derived from his workday length,
absences, and already-booked appointments.

## Requirements

### Requirement: Overlap rejection at appointment creation

The system MUST reject creation of a `BudgetAppointment` whose
`timeStart`/`timeEnd` range overlaps another active (`status` in `pending` or
`approved`) `BudgetAppointment` for the same `peritoId` on the same
`workshopId` + `date`, using the same transactional-lock pattern already used
for the duplicate-plate check (`pg_advisory_xact_lock` on
`workshopId:date:peritoId` plus a transactional range query). No new database
constraint or migration is introduced.

#### Scenario: Overlapping range is rejected

- GIVEN perito P has an active appointment on 2026-08-25 from 09:00 to 11:00
- WHEN a new appointment is created for perito P on 2026-08-25 from 10:00 to 12:00
- THEN the request is rejected with a 400 error identifying the conflicting time range

#### Scenario: Contiguous ranges are accepted

- GIVEN perito P has an active appointment on 2026-08-25 from 09:00 to 10:00
- WHEN a new appointment is created for perito P on 2026-08-25 from 10:00 to 11:00
- THEN the appointment is created successfully, since a shared boundary is not an overlap

#### Scenario: Cancelled or rejected appointments do not block

- GIVEN perito P has an appointment on 2026-08-25 from 09:00 to 11:00 with `status` `cancelled` or `rejected`
- WHEN a new appointment is created for perito P on 2026-08-25 from 09:00 to 11:00
- THEN the appointment is created successfully, since inactive appointments do not count as booked time

### Requirement: Perito hourly availability endpoint

The system MUST expose a backend endpoint that, given a `peritoId`,
`workshopId`, and `date`, returns the perito's availability for that date as
a set of 1-hour blocks starting at `08:00`, each marked available or
unavailable. A block MUST be computed as available only when all of the
following hold: it falls within the perito's workday (`Technician.dailyHours`
hours starting at `08:00`), it is not covered by an active `TechnicianAbsence`
for that date, and it does not overlap an active (`pending`/`approved`)
`BudgetAppointment` already booked for that perito on that date. This
computation MUST be the single source of truth shared by both the UI grid and
the create-time overlap check — no separate client-side conflict logic.

#### Scenario: Full workday with no absence and no bookings

- GIVEN perito P has `dailyHours = 8` and no absence or bookings on 2026-08-25
- WHEN the availability endpoint is called for perito P on 2026-08-25
- THEN it returns 8 available 1-hour blocks from 08:00 to 16:00

#### Scenario: Full-day or holiday absence blocks the entire day

- GIVEN perito P has a `TechnicianAbsence` of type `full` or `holiday` on 2026-08-25
- WHEN the availability endpoint is called for perito P on 2026-08-25
- THEN no block on that date is returned as available

#### Scenario: Half-day absence blocks the afternoon

- GIVEN perito P has `dailyHours = 8` and a `TechnicianAbsence` of type `half` on 2026-08-25
- WHEN the availability endpoint is called for perito P on 2026-08-25
- THEN blocks from 08:00 up to `dailyHours / 2` hours later (08:00–12:00) are returned as available
- AND the remaining afternoon blocks are returned as unavailable, as `half` absences always block the afternoon by convention (no stored time range exists to derive this precisely)

#### Scenario: Existing booking removes a block

- GIVEN perito P has an active appointment on 2026-08-25 from 10:00 to 11:00
- WHEN the availability endpoint is called for perito P on 2026-08-25
- THEN the 10:00–11:00 block is returned as unavailable and all other in-workday blocks are returned as available

### Requirement: Availability endpoint access control

The availability endpoint MUST enforce its own authorization guard and
workshop-scoping check on every request. It MUST NOT reuse or inherit the
unguarded pattern of the existing `GET /capacity/absences` endpoint. A caller
without a valid session, or requesting a perito outside their permitted
workshop(s), MUST receive an authorization error and no availability data.

#### Scenario: Unauthenticated request is rejected

- GIVEN a request with no valid session
- WHEN the availability endpoint is called
- THEN the request is rejected with a 401 error and no availability data is returned

#### Scenario: Out-of-workshop perito is rejected

- GIVEN an authenticated user scoped to workshop A
- WHEN the availability endpoint is called for a perito belonging to workshop B
- THEN the request is rejected with a 403 error and no availability data is returned

### Requirement: No reschedule path bypasses the overlap guard

The system MUST NOT introduce, and this change MUST NOT rely on, any endpoint
that modifies `date`, `timeStart`, `timeEnd`, or `peritoId` on an existing
`BudgetAppointment` after creation. The overlap guard in the create path is
sufficient because no such reschedule path exists.

#### Scenario: Existing update endpoints cannot change schedule fields

- GIVEN an existing `BudgetAppointment`
- WHEN `PATCH :id/processes` or `PATCH :id/cancel` is called on it
- THEN neither endpoint modifies `date`, `timeStart`, `timeEnd`, or `peritoId`
