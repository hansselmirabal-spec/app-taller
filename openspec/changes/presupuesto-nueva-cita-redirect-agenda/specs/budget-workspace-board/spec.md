# Delta for Budget Workspace Board

## ADDED Requirements

### Requirement: Create flow redirects to the workspace board

After a budget appointment is created — whether from "+ Cita" or from the Simulator in create mode — the system MUST redirect to `/presupuesto` instead of `/presupuesto/[id]`, so the advisor lands back on the Agenda/board where the new appointment is visible.

#### Scenario: Creating from "+ Cita"

- GIVEN an advisor fills out the "+ Cita" form and submits
- WHEN the appointment is created successfully
- THEN the browser navigates to `/presupuesto`
- AND the new appointment appears in the Agenda for its scheduled day, in the `pending` column of the status board

#### Scenario: Creating from the Simulator in create mode

- GIVEN an appraiser opens the Simulator in create mode (no existing `id`) and saves the new budget with its processes
- WHEN the creation succeeds
- THEN the browser navigates to `/presupuesto`
- AND the processes saved during creation are preserved on the new appointment
