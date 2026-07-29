# Design: Add manual Mechanic to Kanban Operativo + Pause releases technician

## Technical Approach

Two additive backend flows on the `tracking` module plus UI on `seguimiento/kanban/page.tsx`.
Func.1 adds a parallel process to an existing bodyshop entry via an atomic dual-write
(new `TrackingLog` + append to `entry.processes` jsonb). Func.2 makes pause STRUCTURALLY
release the technician (scope decision fixed by user): the `bodyshop_process_techs` row is
deleted on pause so the tech drops out of `getTechnicianAvailability`/`getDayCapacity`, and
resume re-creates it after a confirm/select step. No schema change, no migration.

## Architecture Decisions

### Decision: Func.1 transaction owner = TrackingService

**Choice**: `TrackingService.addProcessToBodyshop(entryId, processCode, hours)` owns a single
`dataSource.transaction` that (a) inserts the `TrackingLog` and (b) appends `{code,name,hours}`
to `entry.processes`. TrackingService already injects both `logRepo` and `entryRepo`; add
`@InjectDataSource()`.
**Alternatives considered**: (1) `BodyshopService.addParallelProcess()` owns it and calls a
tracking helper — bodyshop already depends on tracking, no cycle, but forces the endpoint/UI
(the Kanban board) to reach into the bodyshop module. (2) TrackingService calls back into
BodyshopService — introduces a `tracking→bodyshop→tracking` circular import needing `forwardRef`.
**Rationale**: TrackingService already holds both repositories, so the owner needs zero new
cross-module dependency and the harder-to-get-right write (log `orderIndex`/`processType`) stays
where its constants live. The `entry.processes` second-writer purity is preserved by extracting a
shared descriptor helper (below).

### Decision: shared descriptor helper prevents jsonb drift

**Choice**: extract `buildBodyshopProcessDescriptor(code, hours)` → `{code, name, order, hours,
processType:'PARALLEL'}` using existing `BODYSHOP_PROCESS_NAMES`/`BODYSHOP_PROCESS_ORDER`. Both
the tracking-log insert and the `entry.processes` append consume it, so name/order can never drift
between the two writes.
**Alternatives considered**: inline literal `{code,name,hours}` at each write site (duplicates the
naming, reproduces the known hours-desync bug class).
**Rationale**: single source of truth for the process descriptor.

### Decision: Func.2 pause deletes the process-tech row (structural release)

**Choice**: `blockProcess` — before flipping status, snapshot the assigned tech onto the log
(`resolveAssignedTechnician` → `log.technicianId/technicianName`, only if not already set), then
`DELETE bodyshop_process_techs WHERE entryId=log.sourceId AND process=log.processCode`. That row is
exactly what `getTechnicianAvailability` sums (bodyshop.service.ts:947-956), so its removal frees
the tech on every capacity screen.
**Alternatives considered**: (1) null out `technicianId` — column is NOT nullable + `@Unique`,
needs a migration. (2) new "snapshot" table/column — extra schema for data the log already carries.
**Rationale**: `TrackingLog.technicianId` (persisted by `startProcess`) is already the durable
snapshot of "who was here", so the process-tech row is pure capacity-reservation state and can be
safely deleted/recreated. Idempotent: a paused process with no tech (MECHANIC/PARALLEL, or a
failed auto-assign) simply deletes zero rows.

### Decision: resume requires confirm; DTO technicianId optional

**Choice**: extend `unblockProcess(logId, technicianId?, technicianName?)` and `UnblockProcessDto`
(mirrors `StartProcessDto`). On resume: restore status/paused-minutes as today; if a technician
resolves, run the SAME `in_progress` conflict-check as `startProcess` (throw `BadRequestException`
if busy elsewhere); upsert the `bodyshop_process_techs` row (respecting the unique key) using the
provided tech, else `log.technicianId`; persist onto the log. New `isTechnicianFree(technicianId,
excludeLogId?)` in TrackingService reuses the conflict-check query. New
`GET tracking/process/:logId/resume-options` → `{previousTechnicianId, previousTechnicianName,
previousTechnicianFree, conflictProcessName}` feeds the modal.
**Alternatives considered**: technicianId REQUIRED (breaks resume for tech-less processes);
auto-reassign silently without confirm (contradicts the user's confirm/select requirement).
**Rationale**: optional keeps backward-compat and the tech-less edge case clean while the frontend
always sends the confirmed tech.

### Decision: unify paralel resume under unblock

**Choice**: paused PARALLEL rows route through `onUnblock` (confirm modal), NOT `onStart`. Frontend
branches on `status`: `'blocked'`→`onUnblock`; `'pending'`→`onStart` (first start, unchanged).
**Alternatives considered**: keep parallel resume on `startProcess` with a duplicated confirm path.
**Rationale**: `blockProcess` already yields `status='blocked'` for parallels and `unblockProcess`
is processType-agnostic and correctly accumulates `pausedDurationMinutes`; `startProcess` on a
blocked log would skip that accumulation. Unifying removes the inconsistent duplicate path with no
backend special-casing.

## Data Flow

(a) Add Mecánica to an in-progress entry:

    KanbanCard ─POST /tracking/process/bodyshop/:entryId/add {MECHANIC,4}─► TrackingController
      └► addProcessToBodyshop: validate code∈PARALLEL · dedup(log + entry.processes)
         BEGIN tx ── INSERT TrackingLog(PARALLEL,pending) ── entry.processes+={code,name,hours} ──► COMMIT
      ◄─ 201 wrap(log) ─► useAddProcess.onSuccess ─► invalidate board query

(b) Pause → resume with technician confirm:

    Pause ─PATCH /block─► blockProcess: status=blocked,pausedAt · snapshot tech→log · DELETE process_tech · setPauseStatus(paused)
      … tech now absent from getTechnicianAvailability/getDayCapacity …
    Reanudar ─GET /resume-options─► {prevTech, prevTechFree(isTechnicianFree)}
      modal pre-selects prev tech if free; if busy → warn + force pick another
      confirm ─PATCH /unblock {technicianId,name}─► unblockProcess:
         status→in_progress · accumulate paused mins · conflict-check(→400 if busy)
         · UPSERT process_tech(entry,process,tech) · log.technicianId=tech · restore entry status if no other blocked
      close-without-confirm ─► NO unblock call — process stays paused

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/modules/tracking/tracking.service.ts` | Modify | Inject DataSource; `addProcessToBodyshop`, `buildBodyshopProcessDescriptor` (PR1); `blockProcess` snapshot+delete process-tech, `unblockProcess` reassign+conflict-check, `isTechnicianFree`, `getResumeOptions` (PR2) |
| `apps/api/src/modules/tracking/tracking.controller.ts` | Modify | `POST process/bodyshop/:entryId/add` + `AddProcessDto` (PR1); `UnblockProcessDto` fields + `GET process/:logId/resume-options` (PR2) |
| `apps/web/src/app/(dashboard)/seguimiento/kanban/page.tsx` | Modify | Always-visible "+ Agregar proceso" slot (PR1); ResumeTechModal wiring on card/modal/parallel resume, status branch (PR2) |
| `apps/web/src/hooks/use-tracking.ts` | Modify | `useAddProcess` (PR1); `useUnblockProcess` params + `useResumeOptions` (PR2) |
| `apps/web/src/lib/api.ts` | Modify | `addTrackingProcess` (PR1); `unblockTrackingProcess` sig + `getResumeOptions` (PR2) |
| `apps/web/src/components/kanban/resume-tech-modal.tsx` | Create | Confirm/select modal, copies `ProcessTechRow` interaction (PR2) |

## Interfaces / Contracts

```ts
// PR1
class AddProcessDto { @IsString() processCode: string; @IsNumber() @Min(0.1) hours: number; }
addProcessToBodyshop(entryId: string, processCode: string, hours: number): Promise<TrackingLog>;

// PR2
class UnblockProcessDto { @IsOptional() @IsString() technicianId?: string;
                          @IsOptional() @IsString() technicianName?: string; }
isTechnicianFree(technicianId: string, excludeLogId?: string): Promise<boolean>;
getResumeOptions(logId: string): Promise<{ previousTechnicianId: string | null;
  previousTechnicianName: string | null; previousTechnicianFree: boolean;
  conflictProcessName: string | null }>;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `addProcessToBodyshop`: rejects non-PARALLEL code, dedup, atomic dual-write, descriptor shared | Jest, mocked repos/manager |
| Unit | `blockProcess` snapshots tech + deletes process-tech; no-op when tech-less | Jest |
| Unit | `unblockProcess` reassign + conflict-check throws when busy; upsert idempotent | Jest |
| Unit | `isTechnicianFree` excludes own log; blocked logs not counted busy | Jest |
| Integration | Paused tech drops out of `getTechnicianAvailability`; reappears on resume | Nest test DB |
| Integration | 2+ paused processes on one entry release/restore independently | Nest test DB |
| E2E | add-process endpoint 201 + board totals consistent across both kanbans | supertest |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. Change is HTTP endpoints + TypeORM writes only.

## Migration / Rollout

No migration required. `entry.processes` jsonb accepts arbitrary entries; `bodyshop_process_techs`
delete/recreate uses the existing unique key. Fully additive/reversible.

### PR plan (stacked-to-main, cached delivery strategy)

- **PR1 — Func.1 add process**: tracking.service.ts + tracking.controller.ts (backend);
  page.tsx + use-tracking.ts + api.ts (frontend). Autonomous, ~<300 lines.
- **PR2 — Func.2 pause releases tech** (child branch targets PR1): remaining tracking.service.ts +
  controller changes; resume-tech-modal.tsx + page.tsx/hook/api wiring. Depends on PR1 board refresh.
  ~<400 lines.

## Open Questions

- None blocking. Optional post-scope nice-to-have (NOT in these PRs): visual pulse/ring on a card
  after add/resume, reusing the existing "late" ring language — no toast infra exists.
