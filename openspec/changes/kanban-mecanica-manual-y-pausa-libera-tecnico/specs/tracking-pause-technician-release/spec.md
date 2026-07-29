# Tracking Pause Technician Release Specification

## Purpose

Ensure that pausing any of the 6 real Chapería processes (BODYWORK, PREP, PAINT, POLISH, FINAL_CONTROL, MECHANIC) releases the assigned technician's capacity, and that resuming always requires explicit human confirmation of the technician, with a system-suggested default.

## Requirements

### Requirement: Pausing a process releases the assigned technician

When any of the 6 real processes (BODYWORK, PREP, PAINT, POLISH, FINAL_CONTROL, MECHANIC) is paused, the system MUST release the technician assigned to that process so the technician no longer counts as occupied in `getTechnicianAvailability`, `getDayCapacity`, and related capacity/availability screens.

#### Scenario: Pausing BODYWORK frees the technician

- GIVEN a technician assigned to an in-progress BODYWORK process
- WHEN the process is paused
- THEN the technician no longer appears as occupied in `getTechnicianAvailability` for that time slot
- AND the technician no longer appears as occupied in `getDayCapacity`

#### Scenario: Pausing the parallel MECHANIC process frees the technician

- GIVEN a technician assigned to an in-progress MECHANIC process
- WHEN the process is paused
- THEN the technician no longer appears as occupied in `getTechnicianAvailability`

### Requirement: Paused time accounting is unchanged

Pausing MUST continue to accumulate `pausedDurationMinutes` exactly as before this change. Releasing the technician's capacity MUST NOT alter how paused duration is tracked or reported.

#### Scenario: Paused duration keeps accruing normally

- GIVEN a process that is paused
- WHEN time elapses while the process remains paused
- THEN `pausedDurationMinutes` reflects the elapsed paused time, unaffected by the technician release

### Requirement: Resume always requires explicit technician confirmation

On resume, the system MUST suggest a technician — the same technician who was assigned before the pause, if that technician is still available/free — but MUST require the user to explicitly confirm or change the suggestion before the process resumes. The system MUST NOT auto-reassign or resume without human confirmation.

#### Scenario: Suggesting the same technician when still free

- GIVEN a paused process previously assigned to technician T, and T is still available
- WHEN the user initiates resume
- THEN the system suggests T as the default technician
- AND the process only resumes after the user confirms (or explicitly changes) the technician

#### Scenario: User changes the suggested technician

- GIVEN a paused process with a suggested technician T
- WHEN the user selects a different technician T2 and confirms
- THEN the process resumes assigned to T2, not T

#### Scenario: System never resumes without confirmation

- GIVEN a paused process
- WHEN a resume is attempted without an explicit technician confirmation step
- THEN the system MUST NOT resume the process

### Requirement: Unavailable suggested technician does not block resume

If the previously assigned technician is no longer available (e.g. took another job while the process was paused), the system MUST offer alternative technician options instead of blocking the resume action.

#### Scenario: Previously assigned technician became busy

- GIVEN a paused process previously assigned to technician T, and T is now occupied with other work
- WHEN the user initiates resume
- THEN the system does not suggest T as available
- AND the system presents other technician options for the user to choose from
- AND the resume flow is not blocked

### Requirement: Uniform technician confirmation across MOTHER and PARALLEL processes

Technician release-on-pause and confirm-on-resume MUST apply uniformly to MOTHER (sequential) processes and to the PARALLEL process (MECHANIC), including when resuming a paused parallel process through a flow that today uses a different code path (`onStart`) than sequential resume (`onUnblock`).

#### Scenario: Resuming a paused MOTHER process requires confirmation

- GIVEN a paused MOTHER process (e.g. PAINT)
- WHEN the user resumes it
- THEN the technician confirm/change step is presented before resume completes

#### Scenario: Resuming a paused MECHANIC (parallel) process requires confirmation

- GIVEN a paused MECHANIC process handled via the parallel-process resume path
- WHEN the user resumes it
- THEN the technician confirm/change step is presented before resume completes, equivalent to the MOTHER process flow
