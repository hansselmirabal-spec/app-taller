# Tracking Return to Previous Process Specification

## Purpose

Allow a supervisor to send a bodyshop Kanban card back one step, from a MOTHER
process to the immediately previous MOTHER process, preserving both passes as
auditable history and releasing the abandoned pass's technician capacity.

## Requirements

### Requirement: Return action authorization

The system MUST restrict the return action to users with role `admin` or
`admin_taller`, enforced at the API layer independent of any UI gating.

#### Scenario: Admin returns a card

- GIVEN a user with role `admin_taller`
- WHEN they call the return endpoint on an `in_progress` MOTHER process log
- THEN the request succeeds and the return transaction runs

#### Scenario: Non-supervisor role is rejected

- GIVEN a user without `admin` or `admin_taller` role
- WHEN they call the return endpoint directly (not via UI)
- THEN the system MUST respond with 403 and MUST NOT alter any log

### Requirement: Mandatory reason and technician

The system MUST require both a reason and a technician for the reopened
process before executing a return, in a single confirmation step.

#### Scenario: Missing reason is rejected

- GIVEN a valid admin request to return a card
- WHEN the `reason` field is omitted or empty
- THEN the system MUST reject the request and MUST NOT change any log or capacity row

#### Scenario: Missing technician is rejected

- GIVEN a valid admin request to return a card
- WHEN the `technicianId` field is omitted
- THEN the system MUST reject the request and MUST NOT change any log or capacity row

### Requirement: Single-transaction return execution

The system MUST execute the return as one atomic transaction: mark the
current log `'returned'` with the reason, delete its
`bodyshop_process_techs` row, create a new `in_progress` log for the
previous MOTHER process with the chosen technician, and upsert its
`bodyshop_process_techs` row. The original first-pass log of the previous
process MUST remain unmodified as history.

#### Scenario: Successful return preserves both passes

- GIVEN a card at MOTHER process PREP whose previous process BODYWORK has a completed first-pass log
- WHEN an admin returns the card to BODYWORK with a reason and technician
- THEN the PREP log status becomes `'returned'` with the reason stored
- AND the BODYWORK first-pass log is untouched
- AND a new BODYWORK log is created with status `in_progress` and the chosen technician
- AND the PREP technician's `bodyshop_process_techs` row is deleted

#### Scenario: Partial failure rolls back

- GIVEN a valid return request
- WHEN any step of the transaction fails (e.g. technician upsert error)
- THEN no log status change, deletion, or creation MUST persist

### Requirement: Return scope limited to immediate previous MOTHER process

The system MUST allow returning only to the MOTHER process with the
immediately preceding `orderIndex`. The system MUST NOT allow returning to
any non-adjacent earlier process or to a PARALLEL process (Mecánica,
Diamantado, Llantas, Eléctrico).

#### Scenario: Return to non-adjacent process is rejected

- GIVEN a card at MOTHER process with `orderIndex` 3, where `orderIndex` 1 also exists
- WHEN an admin attempts to return directly to `orderIndex` 1
- THEN the system MUST reject the request

#### Scenario: Return action unavailable for PARALLEL processes

- GIVEN a card with an active PARALLEL process (e.g. Mecánica)
- WHEN checking available actions for that process
- THEN the return action MUST NOT be offered or accepted for it

### Requirement: Capacity release on return

The system MUST free the returned process's technician capacity
immediately upon return confirmation, reflected on capacity/availability
screens.

#### Scenario: Technician freed after return

- GIVEN a technician assigned to the process being returned
- WHEN the return transaction completes
- THEN that technician no longer shows as occupied by the returned process

### Requirement: Returned status excluded from completion readiness

The system MUST treat a `'returned'` log as NOT complete when evaluating
whether all MOTHER processes are done for card readiness (e.g. reaching
"Entregado"), distinct from `'skipped'` which MUST continue to count as
complete.

#### Scenario: Card with a returned log cannot be delivered

- GIVEN a card whose only log for a MOTHER process has status `'returned'`
- WHEN the system evaluates whether all MOTHER processes are done
- THEN the result MUST be false, blocking "Entregado"

#### Scenario: Skipped status still counts as complete

- GIVEN a card whose log for a MOTHER process has status `'skipped'`
- WHEN the system evaluates whether all MOTHER processes are done
- THEN that process MUST count as complete, unaffected by the `'returned'` rule

### Requirement: Re-completion regenerates the returned process

When a MOTHER process completes, the system MUST determine the next
process to activate by considering BOTH plain `pending` MOTHER logs and
`'returned'` MOTHER logs together, ordered by `orderIndex` ascending, and
activate whichever has the smallest `orderIndex` greater than the
just-completed process's `orderIndex`. A `'returned'` log selected this way
MUST be recreated as `pending` (not resurrected in place) before being
activated. This MUST hold even when downstream plain-`pending` MOTHER logs
already exist alongside the `'returned'` one — the resolver considers both
sets together, it does not treat "no plain pending exists" as a
precondition for regenerating a returned process.

#### Scenario: Single stacked return regenerates correctly

- GIVEN a card returned from PREP to BODYWORK, where PAINT/POLISH/FINAL_CONTROL remain plain `pending` MOTHER logs
- WHEN the reopened BODYWORK log completes
- THEN the system MUST recreate and activate PREP (the `'returned'` log with the smallest `orderIndex` greater than BODYWORK's), NOT skip ahead to PAINT

#### Scenario: Multiple stacked returns pick the smallest orderIndex

- GIVEN two `'returned'` MOTHER logs exist with `orderIndex` 2 and `orderIndex` 4, and the just-completed process has `orderIndex` 1
- WHEN the system resolves the next process to activate
- THEN the `orderIndex` 2 returned process MUST be recreated and activated, not `orderIndex` 4

### Requirement: Chronological ordering across repeated processes

Wherever a card's process history or timeline is displayed, the system
MUST order logs sharing the same `processCode`/`orderIndex` using
`createdAt` ascending as a secondary sort key, so two passes of the same
process render in chronological order.

#### Scenario: Two passes render in creation order

- GIVEN a process with a first-pass log and a later reopened-pass log sharing the same `processCode`
- WHEN the card or timeline view builds the displayed sequence
- THEN the first-pass log MUST appear before the reopened-pass log

### Requirement: Dedicated endpoint required for reopening

The system MUST expose the return action through a dedicated endpoint,
separate from the generic process-start action, so the generic start
action MUST NOT be usable to reopen a `'returned'` process or reuse a
stale technician assignment.

#### Scenario: Generic start cannot reopen a returned process

- GIVEN a process log with status `'returned'`
- WHEN the generic "start process" action is invoked on it
- THEN the system MUST NOT transition it via that action; only the dedicated return endpoint may do so
