# Bodyshop Final Control Backfill Specification

## Purpose

One-off, manually-invoked script that inserts missing `FINAL_CONTROL`
`TrackingLog` rows for legacy `bodyshop_entries` created before Control Final
existed as a tracked process, without fabricating or mutating history.

## Requirements

### Requirement: Affected universe selection

The script MUST select only `bodyshop_entries` that have at least one existing
`tracking_logs` row (`source_type='bodyshop'`) AND no existing row with
`process_code='FINAL_CONTROL'` for that entry. The script MUST exclude entries
with `status='cancelled'` from the selection entirely.

#### Scenario: Entry with prior logs but no FINAL_CONTROL is selected

- GIVEN a bodyshop entry with `status='in_progress'` and at least one existing
  tracking log
- AND no tracking log with `process_code='FINAL_CONTROL'` for that entry
- WHEN the selection query runs
- THEN the entry is included in the affected universe

#### Scenario: Entry already having FINAL_CONTROL is excluded

- GIVEN a bodyshop entry that already has a `tracking_logs` row with
  `process_code='FINAL_CONTROL'`
- WHEN the selection query runs
- THEN the entry is excluded from the affected universe

#### Scenario: Cancelled entry is excluded regardless of log history

- GIVEN a bodyshop entry with `status='cancelled'`
- AND the entry has prior tracking logs but no `FINAL_CONTROL` log
- WHEN the selection query runs
- THEN the entry is excluded from the affected universe
- AND no `FINAL_CONTROL` log is inserted for it

### Requirement: Per-status insert policy

For every selected entry, the script MUST insert exactly one `TrackingLog`
row with `process_code='FINAL_CONTROL'`, `orderIndex=6`,
`processType='MOTHER'`, `plannedHours=0.5`. The inserted `status` MUST be
`skipped` when the entry's `status='done'`, and `pending` for any other
non-cancelled entry status.

#### Scenario: Done entry gets a skipped log

- GIVEN a selected entry with `status='done'`
- WHEN the backfill inserts its `FINAL_CONTROL` log
- THEN the inserted log has `status='skipped'`
- AND the entry is excluded from completed-work productivity metrics for that
  process

#### Scenario: Active entry gets a pending log

- GIVEN a selected entry with `status` other than `done` or `cancelled`
- WHEN the backfill inserts its `FINAL_CONTROL` log
- THEN the inserted log has `status='pending'`
- AND `completeProcess()` can later advance it in normal `orderIndex` order

### Requirement: Dry-run by default, explicit apply to write

The script MUST run in read-only dry-run mode unless invoked with an explicit
`--apply` flag. Dry-run MUST report the full affected universe (entry id,
plate, status, resolved log status) without writing any row.

#### Scenario: Default invocation performs no writes

- GIVEN the script is invoked without `--apply`
- WHEN it completes
- THEN it prints the affected universe and the status each entry would receive
- AND zero rows are inserted into `tracking_logs`

#### Scenario: Apply flag performs the writes

- GIVEN the script is invoked with `--apply`
- WHEN it completes successfully
- THEN one `FINAL_CONTROL` `TrackingLog` row exists for every entry in the
  affected universe, with the status resolved per the insert policy

### Requirement: Transactional execution with audit trail

The script MUST perform all inserts inside a single database transaction that
rolls back entirely on any error. On successful `--apply` completion, the
script MUST write an audit file listing every touched `entryId`, sufficient
to construct a targeted rollback (`DELETE ... WHERE source_id IN (<ids>)`).

#### Scenario: Partial failure rolls back all inserts

- GIVEN `--apply` is running and an error occurs after inserting some rows
- WHEN the transaction fails
- THEN none of the `FINAL_CONTROL` rows from that run persist
- AND no audit file is written

#### Scenario: Successful apply produces a usable audit file

- GIVEN `--apply` completes without error
- WHEN the transaction commits
- THEN an audit file is written listing every `entryId` that received a new
  `FINAL_CONTROL` log
- AND that file is sufficient to build the rollback `DELETE` statement

### Requirement: No mutation of pre-existing tracking logs

The script MUST NOT update, delete, or otherwise modify any existing
`TrackingLog` row. It MUST only INSERT new `FINAL_CONTROL` rows for entries
that lack one.

#### Scenario: Pre-existing logs are left untouched

- GIVEN an entry with existing tracking logs for other process codes
- WHEN the backfill runs with `--apply`
- THEN those pre-existing rows are unchanged in every column
- AND only a new `FINAL_CONTROL` row is added

### Requirement: Manual invocation only

The script MUST NOT be invoked automatically by application startup, deploy
pipelines, or any scheduled job. It MUST only run via explicit manual
invocation by a human operator.

#### Scenario: Application startup does not trigger the backfill

- GIVEN the API application starts or a deploy pipeline runs
- WHEN startup/deploy completes
- THEN the backfill script has not been executed
- AND no `FINAL_CONTROL` rows were inserted as a side effect of startup/deploy
