# Delta for tracking-return-to-previous-process

## MODIFIED Requirements

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
