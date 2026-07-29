# Bodyshop Scheduling Specification

## Purpose

Defines technician-capacity booking for the bodyshop (Chapería) process
sequence: BODYWORK → PREP → PAINT → POLISH (Pulida) → FINAL_CONTROL
(Control Final). Covers hour-derivation rules for the two previously
uncovered steps, their strict separation from customer-facing budget
data, their propagation into stay-day/finish-date calculations and
tracking, their visibility on capacity/balance screens, and graceful
degradation when a workshop lacks a dedicated technician.

## Requirements

### Requirement: Full 5-Step Capacity Booking

The system MUST reserve real technician capacity for all five sequential
bodyshop process steps — BODYWORK, PREP, PAINT, POLISH, FINAL_CONTROL —
when simulating or creating a bodyshop entry, not only the first three.

#### Scenario: Entry books capacity through Control Final

- GIVEN a bodyshop entry with valid piece count and PAINT hours
- WHEN the entry is simulated/created
- THEN technician slots are reserved for BODYWORK, PREP, PAINT, POLISH, and FINAL_CONTROL in sequence order

### Requirement: Hour Derivation for POLISH and FINAL_CONTROL

FINAL_CONTROL hours MUST always be a fixed `0.5h`, injected server-side,
regardless of entry source. POLISH hours MUST be computed as
`0.5h × pieceCount`. When the entry originates from an approved budget,
`pieceCount` MUST be the sum of `BudgetPiece.qty` across the entry's
pieces. When the entry originates from direct Agenda creation (no
budget), `pieceCount` MUST come from a manual "Cantidad de piezas" field
supplied at creation.

#### Scenario: Budget-derived Pulida hours

- GIVEN an approved budget with pieces summing to qty = 4
- WHEN the bodyshop entry is created from that budget
- THEN POLISH is booked for 2.0h and FINAL_CONTROL is booked for 0.5h

#### Scenario: Direct-Agenda Pulida hours

- GIVEN a direct Agenda Chapería entry with manual "Cantidad de piezas" = 3
- WHEN the entry is created
- THEN POLISH is booked for 1.5h and FINAL_CONTROL is booked for 0.5h

#### Scenario: Invalid or missing piece count

- GIVEN a direct Agenda Chapería entry with no piece count supplied
- WHEN entry creation is attempted
- THEN the system MUST reject the creation or require a valid `pieceCount > 0` before booking POLISH hours

### Requirement: No Leakage into Customer-Facing Budget Data

POLISH and FINAL_CONTROL hours MUST NOT appear in
`budget_appointments.processes`. This MUST hold even if a user manually
adds a "Pulido" line to the budget's process editor — that manual line
MUST remain purely informational/billable and MUST NOT be treated as, or
merged with, the operational POLISH/FINAL_CONTROL capacity booking.

#### Scenario: Manual Pulido line does not affect operational booking

- GIVEN a budget with an approved process list that includes a manually added "Pulido" line
- WHEN the budget is approved and the bodyshop entry is created
- THEN `budget_appointments.processes` still contains only the customer-facing lines, unchanged by the operational POLISH/FINAL_CONTROL booking
- AND the operational POLISH hours are computed solely from `BudgetPiece.qty`, not from the manual line

#### Scenario: Regression — customer invoice hours unchanged

- GIVEN a bodyshop entry that books POLISH and FINAL_CONTROL capacity
- WHEN the customer views or exports their budget/invoice
- THEN no POLISH or FINAL_CONTROL hours appear in the customer-facing output

### Requirement: Propagation to Stay Days, Tracking, and Capacity Screens

POLISH and FINAL_CONTROL hours MUST count toward `stayDays` and
`estimatedFinishDate`. They MUST appear in Kanban/Seguimiento tracking
views. They MUST be included in `getDayCapacity`, `getWeekCapacity`,
`getTechnicianAvailability`, and `getMonthlyReport` alongside BODYWORK,
PREP, and PAINT.

#### Scenario: Finish date reflects all 5 steps

- GIVEN a bodyshop entry with nonzero POLISH and FINAL_CONTROL hours
- WHEN `estimatedFinishDate` is calculated
- THEN it accounts for technician availability across all 5 sequential steps

#### Scenario: Capacity dashboard shows Pulida/Control Final load

- GIVEN a day with POLISH and FINAL_CONTROL bookings
- WHEN `getDayCapacity` or `getWeekCapacity` is queried for that day/week
- THEN the returned load includes POLISH and FINAL_CONTROL alongside the existing 3 processes

### Requirement: Graceful Degradation Without Dedicated Technician

When a workshop has no technician with a POLISH or FINAL_CONTROL
specialty, the system MUST surface a warning and MUST NOT block entry
creation.

#### Scenario: No dedicated Pulido tech

- GIVEN a workshop with no technician assigned the POLISH specialty
- WHEN a bodyshop entry requiring POLISH hours is created
- THEN the entry is created successfully
- AND the creation response includes a warning indicating no dedicated POLISH capacity exists

### Requirement: Idempotent FINAL_CONTROL Catalog Migration

The migration introducing the `FINAL_CONTROL` process row MUST be
idempotent: running it against an already-seeded environment (QAS/PROD)
MUST insert the row exactly once and MUST NOT fail or duplicate the row
if run more than once.

#### Scenario: First run on seeded environment

- GIVEN `bodyshop_processes` already seeded with BODYWORK, PREP, PAINT, POLISH
- WHEN the FINAL_CONTROL migration runs
- THEN exactly one FINAL_CONTROL row is inserted

#### Scenario: Re-running the migration

- GIVEN the FINAL_CONTROL row already exists from a prior run
- WHEN the migration runs again
- THEN no duplicate row is created and no error is raised

## Out of Scope

The following are explicitly excluded from this change and MUST NOT be
treated as implicit requirements:

- Editing piece count after a bodyshop entry has been created (POLISH
  hours are fixed at creation time; no resize/update path).
- Generalizing the scheduling engine to a generic, configurable process
  model beyond the current 5-step hardcoded sequence.
- Any change to Mecánica or other non-bodyshop process flows.
