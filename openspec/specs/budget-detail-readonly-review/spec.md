# Budget Detail Readonly Review Specification

## Purpose

`/presupuesto/[id]` is the review screen for an existing budget appointment. Hours per process are authored only in the Simulator (`/presupuesto/simulador/[id]`); this screen displays them read-only and exposes the appointment-level actions — Aprobar, Rechazar, Cancelar.

## Requirements

### Requirement: No manual hours editor on the detail screen

The system MUST NOT render any control to add, edit, or remove processes/hours on `/presupuesto/[id]`, for any appointment status. Hours are always displayed read-only.

#### Scenario: Pending appointment with hours already loaded

- GIVEN a `pending` appointment that already has processes loaded via the Simulator
- WHEN the advisor opens `/presupuesto/[id]`
- THEN the hours per process are shown as read-only rows
- AND no "Agregar proceso" control or hours input is rendered

#### Scenario: Non-pending appointment

- GIVEN an `approved`, `rejected`, or `cancelled` appointment
- WHEN it is opened at `/presupuesto/[id]`
- THEN the hours per process are shown as read-only rows
- AND no editor control is rendered

### Requirement: Approve requires at least one loaded process

For a `pending` appointment, the system MUST keep the Aprobar action disabled while `processes` is empty, and MUST enable it once at least one process is present.

#### Scenario: Freshly created appointment has no processes yet

- GIVEN a `pending` appointment just created via "+ Cita" or the Simulator's create flow without any process saved
- WHEN the advisor opens `/presupuesto/[id]`
- THEN Aprobar is disabled
- AND the only way to load hours is via the Simulator at `/presupuesto/simulador/[id]`

#### Scenario: Approve becomes available after hours are loaded

- GIVEN the same appointment after an appraiser loads and saves processes from the Simulator
- WHEN the advisor reopens `/presupuesto/[id]`
- THEN Aprobar is enabled
- AND clicking it opens the repair-start-date confirmation modal

### Requirement: Reject and Cancel remain available for pending appointments

The system MUST keep Rechazar and Cancelar available and functional for `pending` appointments, independent of the read-only hours display.

#### Scenario: Rejecting a pending appointment

- GIVEN a `pending` appointment open at `/presupuesto/[id]`
- WHEN the advisor submits a rejection reason
- THEN the appointment status changes to `rejected`

#### Scenario: Cancelling a pending appointment

- GIVEN a `pending` appointment open at `/presupuesto/[id]`
- WHEN the advisor confirms cancellation
- THEN the appointment status changes to `cancelled`

### Requirement: Simulator edit mode remains the sole hours-authoring surface, unchanged

The Simulator's edit mode (`/presupuesto/simulador/[id]`) and its existing redirect of non-`pending` appointments to `/presupuesto/[id]?readonly=1` MUST remain unchanged by this capability. `/presupuesto/[id]` MUST NOT duplicate that authoring logic.

#### Scenario: Non-pending appointment opened from a stale Simulator tab

- GIVEN a stale `/presupuesto/simulador/[id]` tab for an appointment that is no longer `pending`
- WHEN the appraiser tries to load it
- THEN the Simulator redirects to `/presupuesto/[id]?readonly=1`, unchanged from before this capability
