# Budget Workspace Board Specification

## Purpose

Give the advisor a single landing screen on `/presupuesto` that answers "where does every budget stand this week?" — a two-panel workspace (week agenda + status-grouped board) replacing the previous grid/list toggle, and serving as the post-save destination after editing a budget in the Simulator.

## Requirements

### Requirement: Two-panel layout replaces the grid/list toggle

The system MUST render `/presupuesto` as a single two-panel layout — Agenda on the left, status board on the right — and MUST NOT offer the previous `grid`/`list` view toggle.

#### Scenario: Landing on the budget workspace

- GIVEN an advisor navigates to `/presupuesto`
- WHEN the page loads
- THEN both the Agenda panel and the 4-column status board are visible
- AND no grid/list toggle control is present

### Requirement: Agenda panel shows a Mon-Fri week with per-day counts

The left Agenda panel MUST show a week selector with 5 chips (Monday through Friday), each displaying that day's appointment count, and MUST list the selected day's slots (time, customer, plate, motive/note, status pill) below the chips.

#### Scenario: Selecting a day in the week strip

- GIVEN the Agenda panel is showing the current week
- WHEN the advisor selects Wednesday's chip
- THEN the slot list below updates to show only Wednesday's appointments
- AND each slot shows time, customer, plate, motive/note, and a status pill

#### Scenario: Weekend days are not shown

- GIVEN the Agenda panel's week strip
- WHEN the advisor views the available day chips
- THEN only Monday through Friday are present; no Saturday or Sunday chip exists

### Requirement: Status board shows 4 fixed columns with counts and empty states

The right panel MUST render exactly 4 columns, one per `BudgetAppointment.status` (`pending`, `approved`, `rejected`, `cancelled`), each with a header count, independent scroll, and a compact card (customer, date/time, plate, insurer). A column with no appointments for the current scope MUST render an explicit empty state, never a blank area.

#### Scenario: All 4 statuses always render

- GIVEN the current week has appointments only in `pending` and `approved`
- WHEN the status board renders
- THEN all 4 columns (`pending`, `approved`, `rejected`, `cancelled`) are visible with their header counts
- AND the `rejected` and `cancelled` columns show an empty state message instead of being blank

#### Scenario: Status colors match the existing configuration

- GIVEN any status column or card
- WHEN its status color is rendered
- THEN it matches the existing `STATUS_CONFIG` values byte-for-byte, with no new color tokens introduced

### Requirement: Navigating from a card or slot opens the appropriate Simulator view

Clicking any agenda slot or board card MUST navigate to `/presupuesto/[id]`, which opens the editable Simulator for `pending` appointments and the read-only view for all other statuses.

#### Scenario: Clicking a pending card

- GIVEN a `pending` card in the status board
- WHEN the advisor clicks it
- THEN the system navigates to `/presupuesto/[id]` for that appointment, which routes into the editable Simulator

#### Scenario: Clicking a non-pending card

- GIVEN an `approved` card in the status board
- WHEN the advisor clicks it
- THEN the system navigates to `/presupuesto/[id]` for that appointment in its read-only view

### Requirement: Edit-mode save returns to the workspace board

Saving an appointment from the Simulator's edit mode MUST redirect to `/presupuesto`, where the edited appointment appears in its current status column.

#### Scenario: Post-save redirect

- GIVEN the advisor saves an edit from `/presupuesto/simulador/[id]`
- WHEN the save succeeds
- THEN the browser navigates to `/presupuesto`
- AND the edited appointment is visible in the column matching its status
