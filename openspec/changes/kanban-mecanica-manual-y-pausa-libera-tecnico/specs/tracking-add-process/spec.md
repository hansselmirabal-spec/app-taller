# Tracking Add Process Specification

## Purpose

Allow a PARALLEL process (MECHANIC, DIAMANTADO, LLANTAS, ELECTRICO) to be added to an existing bodyshop entry at any point after creation, keeping `TrackingLog` and `entry.processes` (jsonb) consistent.

## Requirements

### Requirement: Only PARALLEL process codes are addable post-creation

The system MUST restrict the add-process operation to process codes classified as PARALLEL (MECHANIC, DIAMANTADO, LLANTAS, ELECTRICO). MOTHER (sequential) processes MUST NOT be addable through this operation.

#### Scenario: Adding a valid PARALLEL process

- GIVEN an existing bodyshop entry that does not yet have a MECHANIC process
- WHEN a user requests to add process `MECHANIC`
- THEN the system creates the process and returns success

#### Scenario: Rejecting a MOTHER process code

- GIVEN an existing bodyshop entry
- WHEN a user requests to add process `PAINT` (a MOTHER process)
- THEN the system MUST reject the request with a validation error
- AND no `TrackingLog` or `entry.processes` entry is created

### Requirement: Process addable regardless of entry state, except terminal states

The system MUST allow adding a PARALLEL process to a bodyshop entry at any point in its lifecycle, independent of the current status of other processes, EXCEPT when the entry itself is cancelled or fully terminated.

#### Scenario: Adding a process to an entry mid-flow

- GIVEN a bodyshop entry with BODYWORK in progress and PAINT pending
- WHEN a user adds process `DIAMANTADO`
- THEN the system creates the new process without altering the state of BODYWORK or PAINT

#### Scenario: Rejecting addition on a cancelled/terminated entry

- GIVEN a bodyshop entry whose overall status is cancelled or terminated
- WHEN a user requests to add a PARALLEL process
- THEN the system MUST reject the request

### Requirement: Duplicate process prevention

The system MUST NOT allow adding a process code that the entry already has (in `entry.processes` or as an existing `TrackingLog`).

#### Scenario: Attempting to add a process already present

- GIVEN a bodyshop entry that already has process `LLANTAS`
- WHEN a user requests to add process `LLANTAS` again
- THEN the system MUST reject the request with a conflict/validation error
- AND no duplicate `TrackingLog` or `entry.processes` entry is created

### Requirement: Transactional dual-write consistency

The system MUST create the new `TrackingLog` and append the corresponding entry to `entry.processes` (jsonb) within a single atomic transaction. If either write fails, the system MUST roll back both, leaving no desynchronized state between `TrackingLog` and `entry.processes`.

#### Scenario: Successful add-process writes both records atomically

- GIVEN a valid, non-duplicate PARALLEL process request
- WHEN the add-process operation executes successfully
- THEN a new `TrackingLog` exists for the process
- AND `entry.processes` contains a matching entry for the same process
- AND both reflect the same process code and hours

#### Scenario: Failure during dual-write rolls back both sides

- GIVEN a valid, non-duplicate PARALLEL process request
- WHEN the write to `entry.processes` fails after the `TrackingLog` would have been created
- THEN the system MUST roll back the transaction
- AND neither the `TrackingLog` nor the `entry.processes` entry persists

### Requirement: No effect on capacity/balance calculations

Adding a PARALLEL process via this operation MUST NOT alter results of capacity/balance calculations (e.g. `getDayCapacity`, `getWeekCapacity`). This is existing, expected behavior: MECHANIC is structurally excluded from `BALANCE_PROCESSES`, and the same exclusion applies to this operation.

#### Scenario: Adding MECHANIC does not change day capacity

- GIVEN a bodyshop entry and a technician's current day capacity figures
- WHEN a MECHANIC process is added to the entry
- THEN `getDayCapacity` results for that day remain unchanged
