# Budget Simulator Edit Specification

## Purpose

Let an advisor open the piece-based Simulator prefilled from an existing `BudgetAppointment` and update that same record, instead of always creating a new appointment or bypassing budget approval to enter the workshop directly.

## Requirements

### Requirement: Edit-mode prefill from an existing appointment

The system MUST provide a dynamic route (`/presupuesto/simulador/[id]`) that loads the `BudgetAppointment` identified by `id` and prefills the Simulator's plate, customer, phone, budget number, notes, and `pieces` (mapped to Simulator items) before the estimate re-runs.

#### Scenario: Opening the Simulator from a booked appointment

- GIVEN a `pending` `BudgetAppointment` with saved `pieces`
- WHEN the advisor navigates to `/presupuesto/simulador/[id]` for that appointment
- THEN the Simulator loads with plate, customer, phone, budget number, notes, and items prefilled from the appointment
- AND the estimate recomputes from the prefilled items

#### Scenario: Opening the Simulator for an appointment with no saved pieces

- GIVEN a `pending` `BudgetAppointment` with `pieces == null`
- WHEN the advisor navigates to `/presupuesto/simulador/[id]` for that appointment
- THEN the Simulator loads with an empty item list and the other fields (plate, customer, phone, budget number, notes) prefilled
- AND no error is shown

### Requirement: Edit-mode save updates, never duplicates

When an `id` is present, saving from the Simulator MUST call only `PATCH /budget-appointments/:id/processes` with `{processes, pieces}` and MUST NOT call the create-appointment operation.

#### Scenario: Saving an edited estimate

- GIVEN the Simulator opened in edit mode for appointment `id`
- WHEN the advisor edits items and saves
- THEN the system sends `PATCH /budget-appointments/:id/processes`
- AND no new `BudgetAppointment` record is created
- AND the total count of `BudgetAppointment` records is unchanged

#### Scenario: Saving without any pieces does not wipe existing data

- GIVEN an appointment that already has saved `pieces` from a previous edit
- WHEN the advisor opens edit mode, makes no item changes, and saves
- THEN the previously saved `pieces` detail MUST NOT be erased or replaced with an empty set

### Requirement: Non-pending appointments are read-only

The system MUST NOT allow an edit-mode save when the target appointment's `status` is not `pending`.

#### Scenario: Attempting to edit an approved appointment

- GIVEN a `BudgetAppointment` with `status = 'approved'`
- WHEN the advisor navigates to `/presupuesto/simulador/[id]` for that appointment
- THEN the system redirects to the read-only `/presupuesto/[id]` view instead of the editable Simulator

### Requirement: No direct workshop entry from the Simulator

The Simulator MUST NOT offer any action that creates a bodyshop entry directly. Entering the workshop MUST only be reachable through the approval action on `/presupuesto/[id]`.

#### Scenario: Simulator has no workshop-entry shortcut

- GIVEN the advisor is on `/presupuesto/simulador` or `/presupuesto/simulador/[id]`
- WHEN the advisor views the available actions
- THEN no "Ingresar al taller" or equivalent direct workshop-entry action is present

#### Scenario: Workshop entry still available via approval

- GIVEN a `pending` `BudgetAppointment`
- WHEN the advisor approves it from `/presupuesto/[id]`
- THEN the existing "Aprobar e ingresar al taller" flow creates the bodyshop entry, unchanged
