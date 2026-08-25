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

The system MUST execute the return as one atomic transaction. For the
chosen `targetProcessCode`: mark the current log `'returned'` with the
reason, delete its `bodyshop_process_techs` row, create a new
`in_progress` log for the target MOTHER process with the chosen
technician, and upsert its `bodyshop_process_techs` row. For every MOTHER
process strictly between the current process and the target (by
`orderIndex`), the system MUST create one new `'returned'` log per
skipped process within the same transaction, without a technician
assignment — the chosen technician MUST apply only to the target
process's new log. The original `'completed'` log of every skipped
intermediate, and of the target process's prior pass, MUST remain
unmodified as history. Before creating any log, the system MUST verify
that every process to be skipped currently has a `'completed'` log; if
any skipped process is not `'completed'`, the system MUST reject the
entire request and MUST NOT create or modify any log.
(Previously: covered only a single-step return to the immediately
previous process, with no intermediate-skipping logic.)

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

#### Scenario: Multi-hop return creates one returned log per skipped process

- GIVEN a card at Pintura (`orderIndex` 3) with Chapería (`orderIndex` 1) and completed Preparación (`orderIndex` 2) in between
- WHEN an admin returns the card to Chapería with a reason and technician
- THEN the Pintura log becomes `'returned'`
- AND a new `'returned'` log is created for Preparación
- AND a new `in_progress` log is created for Chapería with the chosen technician
- AND all of the above MUST persist within the same transaction

#### Scenario: Technician assignment applies only to the target process

- GIVEN a multi-hop return that skips one or more intermediate processes
- WHEN the transaction completes
- THEN each skipped intermediate's new `'returned'` log MUST have no technician assigned
- AND only the target process's new log has the chosen technician's `bodyshop_process_techs` row upserted

#### Scenario: Skipped intermediate not completed is rejected

- GIVEN a MOTHER process that would be skipped by a requested return, whose current log status is not `'completed'`
- WHEN an admin submits that return request
- THEN the system MUST reject the request and MUST NOT create or modify any log

### Requirement: Return scope covers any earlier MOTHER process

The system MUST allow returning to any earlier MOTHER process (any
`orderIndex` strictly less than the current process's `orderIndex`), not
only the immediately preceding one. The system MUST NOT allow returning to
`AGENDA` or to a PARALLEL process (Mecánica, Diamantado, Llantas,
Eléctrico) as either origin or destination. The set of valid destinations
MUST be single-select — one `targetProcessCode` per return request — and
deduplicated by `processCode` (newest pass wins), computed via
`listAvailableMothers()`. The server MUST recompute
`listAvailableMothers()` at transaction time and MUST reject any requested
`targetProcessCode` not present in that freshly computed list, regardless
of what the client's payload or cached UI state claims.
(Previously: only the immediately preceding `orderIndex` was allowed as a
return destination; non-adjacent targets were rejected.)

#### Scenario: Return to non-adjacent process is allowed

- GIVEN a card at MOTHER process with `orderIndex` 3, where `orderIndex` 1 also exists as a completed pass
- WHEN an admin submits a return request targeting `orderIndex` 1
- THEN the system MUST accept the request and execute the return

#### Scenario: Return action unavailable for PARALLEL processes

- GIVEN a card with an active PARALLEL process (e.g. Mecánica)
- WHEN checking available actions for that process
- THEN the return action MUST NOT be offered or accepted for it

#### Scenario: Stale target is rejected on server revalidation

- GIVEN a `targetProcessCode` that is not present in a freshly computed `listAvailableMothers()` at transaction time (e.g. a stale card or a direct API call)
- WHEN an admin submits a return request naming that target
- THEN the system MUST reject the request and MUST NOT create or modify any log

#### Scenario: Return request names exactly one destination

- GIVEN multiple earlier MOTHER processes are valid destinations
- WHEN an admin submits a return request
- THEN the request MUST carry exactly one `targetProcessCode` value

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
