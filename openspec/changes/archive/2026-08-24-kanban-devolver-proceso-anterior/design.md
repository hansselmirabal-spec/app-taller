# Design: Return a Kanban card to the immediately previous process

## Technical Approach

One transactional service method `returnToProcess()` in `tracking.service.ts`, a role-gated
`PATCH tracking/process/:logId/return` endpoint, a widened `TrackingLog.status` union with
`'returned'` (no migration), and a **latest-pass-per-`processCode`** rule everywhere the code
currently assumes one log per process. Frontend adds a supervisor-only action in
`CardDetailModal` plus a reason+technician modal derived from `PauseModal` + `ResumeTechModal`.

The change's real difficulty is not the transaction — it is that `tracking_logs` becomes a
**multi-pass** table. Three existing invariants break silently otherwise: completion readiness,
next-process resolution, and display ordering. Decisions D3–D6 address exactly those.

## Architecture Decisions

### D1 — Reason stored in `blocked_reason`, not a new column

| Option | Tradeoff | Decision |
|---|---|---|
| Reuse `blocked_reason` (`varchar(120)`) | Semantically "why this log is not progressing"; zero migration; makes the proposal's rollback (`returned → blocked`, reason preserved) a pure `UPDATE status` | **Chosen** |
| New `returned_reason` column | Cleaner naming, but needs a migration and a second nullable reason field the UI must branch on | Rejected |

Consequence: DTO enforces `@MaxLength(120)`.

### D2 — `'returned'` is an entity-level union widening, no migration

`tracking_logs.status` is `varchar(20) DEFAULT 'pending'` with **no CHECK constraint** —
migration `011_tracking_logs_technician_fk_and_lock_guard.ts` only adds the technician FK and the
partial unique index `tracking_logs_one_in_progress_per_technician ... WHERE status = 'in_progress'`
(lines 25-26). Widening `tracking-log.entity.ts:40` is therefore sufficient.

Exhaustiveness impact audit (no closed `Record<Status, …>` or exhaustive `switch` exists):

| Site | Type | Impact |
|---|---|---|
| `ProcessSummary.status` (`tracking.service.ts:88`) | `string` | none |
| `TrackingProcessSummary.status` (`api.ts:1360`) | `string` | none |
| `backfill-final-control.ts:92,103,142` | own `'pending' \| 'skipped'` union | none |
| `page.tsx:912-931` `statusColors`/`statusLabel`/`statusBadge` | object-literal lookup + `?? fallback` | **runtime**: renders raw `"returned"`; must add `returned` keys |
| `page.tsx` `ProcessStatusIcon` | prop `status: string` | must add a `returned` branch |

### D3 — Completion readiness evaluates only the **latest pass** per `processCode`

`buildCard()` (`tracking.service.ts:863-864`) already excludes `'returned'`, because it only
accepts `completed`/`skipped`. But the old `'returned'` log **never disappears**, so after the
process is redone `allMothersDone` would stay `false` forever and the card could never reach
"Entregado". The fix is deduplication, not the `every()` predicate:

```ts
// antes
const allMothersDone = mothers.length > 0 && mothers.filter(l => l.processCode !== 'AGENDA')
  .every(l => l.status === 'completed' || l.status === 'skipped');

// después — `sorted` viene ordenado orderIndex ASC, createdAt ASC (D5),
// así que el último write por processCode gana = la pasada más reciente.
const latestMothers = new Map<string, TrackingLog>();
for (const l of mothers) latestMothers.set(l.processCode, l);
const evaluated = [...latestMothers.values()].filter(l => l.processCode !== 'AGENDA');
const allMothersDone = evaluated.length > 0 &&
  evaluated.every(l => l.status === 'completed' || l.status === 'skipped');
```

`'skipped'` semantics are untouched. `'returned'` as the latest pass ⇒ not done.
Same fix in the frontend mirror `page.tsx:176-178` (`BodyshopScheduleBlock.allDone`).
`page.tsx:1565` (`isDone` per rendered row) stays as-is — per-log rendering is already correct.

### D4 — One shared `pickPreviousMother()` helper, used by service and exposed to the UI

`orderIndex - 1` arithmetic is **wrong**: `BODYSHOP_PROCESS_ORDER` is `BODYWORK 1, PREP 2,
PAINT 3, POLISH 4, MECHANIC 5 (PARALLEL), FINAL_CONTROL 6`, added parallels get `99`, and
`initForBodyshop()` (line 208) drops processes with `hours <= 0`, so the sequence has gaps and a
PARALLEL sitting between two MOTHERs. Rule: *the log with the greatest `orderIndex` strictly
lower than the current one, among `processType = 'MOTHER'`, `processCode <> 'AGENDA'`, taking the
newest pass (`createdAt DESC`)*.

```ts
private pickPreviousMother(logs: TrackingLog[], current: TrackingLog): TrackingLog | null {
  return logs
    .filter(l => l.processType !== 'PARALLEL' && l.processCode !== 'AGENDA'
              && l.orderIndex < current.orderIndex)
    .sort((a, b) => b.orderIndex - a.orderIndex || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}
```

Pure function over already-loaded logs ⇒ `buildCard()` reuses it with zero extra queries to emit
`currentProcess.canReturn` / `currentProcess.previousProcessName`, and the UI never re-implements
the ordering rule (requirement 8 enforced in one place).

### D5 — `orderIndex ASC, createdAt ASC` everywhere `orderIndex` is the sole sort

Two passes share `processCode` **and** `orderIndex`; `Array.prototype.sort` is stable in V8 but the
input order comes from Postgres, which is unordered on ties. `createdAt` must be an explicit key
and must reach the client, so `ProcessSummary` / `TrackingProcessSummary` gain `createdAt: string`.

### D6 — Unified next-MOTHER resolver in `completeProcess()` (spec-compatible generalization)

The spec's fallback ("when no plain `pending` MOTHER exists") is correct but **unreachable in the
most common flow**: returning PREP→BODYWORK leaves PAINT/POLISH/FINAL_CONTROL as plain `pending`,
so `completeProcess()` line 619-622 (`status: 'pending'`, `order: orderIndex ASC`) would pick
PAINT and *skip PREP entirely*. Resolving `pending` and `returned` in a single ordered pass keeps
both spec scenarios byte-identical (with no plain pending, the smallest returned `orderIndex`
wins) and closes the mid-sequence gap. Flagged for spec sync — see Open Questions.

### D7 — Method-level `RolesGuard`, not class-level

`users.controller.ts:8` applies `RolesGuard` on the class; `TrackingController` instead composes
guards per route (`@UseGuards(WorkshopAccessGuard)` at `tracking.controller.ts:54`,
`PermissionsGuard` at line 64). Follow the local pattern: `@UseGuards(RolesGuard)` +
`@Roles('admin', 'admin_taller')` (same decorator pair as `users.controller.ts:13,25`) on the
single new route, so no existing tracking route changes behavior.

## `returnToProcess()` — exact transaction

Signature: `async returnToProcess(logId: string, reason: string, technicianId: string, technicianName?: string): Promise<TrackingLog>` (returns the new log).

Pre-transaction reads and guards:

1. `log = logRepo.findOne({ where: { id: logId } })` → 404 `'Proceso no encontrado'`.
2. `log.processType === 'PARALLEL'` → `BadRequestException('Solo los procesos madre se pueden devolver')` (requirement 8, backend-enforced).
3. `!['in_progress', 'blocked', 'pending'].includes(log.status)` → `BadRequestException`.
   Rationale: `blockProcess` (line 454) rejects only `'completed'`; `completeProcess` (line 600)
   accepts `in_progress|blocked`. `pending` is included because `buildCard():860-861` legitimately
   surfaces a `pending` MOTHER as `currentProcess`. `completed`/`skipped`/`returned` are rejected —
   this is also what stops a double return of the same log.
4. `allLogs = logRepo.find({ where: { sourceType, sourceId }, order: { orderIndex: 'ASC', createdAt: 'ASC' } })`;
   `prev = pickPreviousMother(allLogs, log)` → `null` ⇒ `BadRequestException('No hay proceso anterior al que devolver')` (covers BODYWORK and AGENDA).
5. If the newest pass of `prev.processCode` is already `pending|in_progress|blocked` ⇒
   `BadRequestException` (that process is already open; nothing to reopen).

Then `withTechnicianLock(technicianId, async manager => { … })` (line 318 —
`pg_advisory_xact_lock` + `dataSource.transaction`), which also maps the `23505` violation of
`tracking_logs_one_in_progress_per_technician` to a friendly 400 (lines 328-330):

| # | Step | Pattern replicated |
|---|---|---|
| a | Conflict check: `manager.findOne(TrackingLog, { where: { technicianId, status: 'in_progress' } })`; if found and `id !== logId` → 400 "ya está trabajando en otro vehículo" | `unblockProcess()` lines 527-534 |
| b | If `!log.technicianId`, snapshot via `resolveAssignedTechnician(log)` **before** deleting the capacity row | `pauseLog()` lines 424-430 |
| c | `log.status = 'returned'; log.blockedReason = reason; log.pausedAt = null;` then `manager.save(TrackingLog, log)` — **must run before step (e)** so the partial unique index does not fire when the same technician is reassigned to the reopened process | new |
| d | `manager.delete(BodyshopProcessTech, { entryId: log.sourceId, process: log.processCode })`, only when `log.sourceType === 'bodyshop'` | exact mirror of `pauseLog()` **line 445**: `this.processTechRepo.delete({ entryId: log.sourceId, process: log.processCode })` |
| e | `manager.save(TrackingLog, manager.create(TrackingLog, { sourceType, sourceId, processName: prev.processName, processCode: prev.processCode, orderIndex: prev.orderIndex, plannedHours: prev.plannedHours, processType: 'MOTHER', status: 'in_progress', startedAt: new Date(), technicianId, technicianName }))` | `initForBodyshop()` lines 222-231 (creation shape) + `startProcess()` lines 389-396 (start fields) |
| f | Upsert `BodyshopProcessTech` for `(log.sourceId, prev.processCode)` → `technicianId` | exact mirror of `unblockProcess()` **lines 508-520** (`findOne` → update, else `manager.create` + save) |

Post-transaction (mirrors `unblockProcess()` lines 539-548): if no other `'blocked'` log remains
for the source, `setPauseStatus(sourceType, sourceId, false, true)` so a paused entry returns to
`in_progress`.

Note: the abandoned pass's log keeps `startedAt`/`completedAt = null`, so `toProcessSummary()`
(line 1172) reports `realHours = null` for it — no phantom hours. Planned hours legitimately sum
across both passes (proposal decision, asserted by test rather than changed).

## `completeProcess()` — next-MOTHER resolution (replaces lines 619-639)

```ts
const laterMothers = allLogs                      // orderIndex ASC, createdAt ASC
  .filter(l => l.processType !== 'PARALLEL' && l.processCode !== 'AGENDA'
            && l.orderIndex > log.orderIndex);
const latest = new Map<string, TrackingLog>();
for (const l of laterMothers) latest.set(l.processCode, l);   // última pasada por proceso
const target = [...latest.values()]
  .sort((a, b) => a.orderIndex - b.orderIndex)
  .find(l => l.status === 'pending' || l.status === 'returned') ?? null;

if (target?.status === 'pending') {           // comportamiento actual, intacto
  target.status = 'in_progress'; target.startedAt = new Date();
  next = await this.logRepo.save(target);
} else if (target?.status === 'returned') {   // regeneración del proceso devuelto
  next = await this.logRepo.save(this.logRepo.create({
    sourceType: log.sourceType, sourceId: log.sourceId,
    processName: target.processName, processCode: target.processCode,
    orderIndex: target.orderIndex, plannedHours: target.plannedHours,
    processType: 'MOTHER', status: 'pending',
  }));
} else { /* parallelBlocking check, sin cambios (líneas 629-638) */ }
```

The regenerated log is `pending` (not `in_progress`) per spec, so the operator must press
"Iniciar" and confirm a technician — capacity is never assigned implicitly.

## Data Flow

```
CardDetailModal  ──"Devolver a Chapería"──>  ReturnProcessModal (motivo + técnico)
      │                                            │
      │                                    useReturnProcess()
      │                                            v
      │                 PATCH /api/v1/tracking/process/:logId/return
      │                 JwtAuthGuard → RolesGuard(@Roles admin, admin_taller)
      │                                            v
      │                 returnToProcess()  [withTechnicianLock ⇒ 1 tx]
      │                    (c) PREP  -> 'returned' + blockedReason
      │                    (d) DELETE bodyshop_process_techs(entry, 'PREP')   ← capacidad liberada
      │                    (e) INSERT tracking_logs BODYWORK #2 'in_progress'
      │                    (f) UPSERT bodyshop_process_techs(entry, 'BODYWORK', tech)
      v                                            v
 invalidate ['tracking-board'] <──── getBoard()/buildCard() (latest-pass-per-code)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/modules/tracking/tracking-log.entity.ts` | Modify | line 40: add `'returned'` to the status union (D2) |
| `apps/api/src/modules/tracking/tracking.service.ts` | Modify | `pickPreviousMother()` (D4); `returnToProcess()`; `completeProcess()` resolver (D6); `buildCard()` latest-pass `allMothersDone` (D3) + `sorted` comparator (D5) + `canReturn`/`previousProcessName`; `createdAt` in `ProcessSummary`/`toProcessSummary()`; `order: { orderIndex, createdAt }` at lines 621, 680, 696, 718, 823, 986 |
| `apps/api/src/modules/tracking/tracking.controller.ts` | Modify | `ReturnProcessDto` + `PATCH process/:logId/return` with `@UseGuards(RolesGuard)` / `@Roles('admin','admin_taller')` (D7) |
| `apps/web/src/lib/api.ts` | Modify | `returnTrackingProcess()`; `createdAt` + `canReturn`/`previousProcessName` in the tracking types (lines 1351-1406) |
| `apps/web/src/hooks/use-tracking.ts` | Modify | `useReturnProcess()` mutation, invalidating `['tracking-board']` (pattern of lines 48-56) |
| `apps/web/src/components/kanban/return-process-modal.tsx` | Create | Reason radios (`PAUSE_REASONS`-style + "Otro") **and** technician list, both required — `PauseModal` (page.tsx:632-688) + `ResumeTechModal` merged |
| `apps/web/src/app/(dashboard)/seguimiento/kanban/page.tsx` | Modify | shared `byProcessOrder` comparator applied at lines 88, 156, 1041; `allDone` latest-pass (176-178); `returned` entries in the three status maps (912-931) and `ProcessStatusIcon`; `isCurrent` by `logId` not `processCode` (line 911); return button + modal wiring |

## Interfaces / Contracts

```ts
// tracking.controller.ts — reason y technicianId obligatorios; technicianName
// opcional, mismo criterio que UnblockProcessDto (líneas 32-35).
class ReturnProcessDto {
  @IsString() @IsNotEmpty() @MaxLength(120) reason: string;
  @IsUUID() technicianId: string;
  @IsOptional() @IsString() technicianName?: string;
}

@Patch('process/:logId/return')
@UseGuards(RolesGuard)
@Roles('admin', 'admin_taller')
async returnProcess(@Param('logId') logId: string, @Body() dto: ReturnProcessDto) {
  return wrap(await this.service.returnToProcess(logId, dto.reason, dto.technicianId, dto.technicianName));
}
```

```ts
// TrackingCard.currentProcess — campos nuevos calculados en buildCard() con pickPreviousMother()
canReturn: boolean;              // false para PARALLEL, AGENDA y el primer proceso madre
previousProcessName: string | null;
// ProcessSummary / TrackingProcessSummary
createdAt: string;               // requerido por el sort secundario del frontend
```

Frontend gate (both conditions required):
`isAdminOrManager()` (`apps/web/src/lib/auth.ts:59-61`) **&&** `cp.canReturn` **&&** `!isParallelPlaceholder`.
Button rendered in the `cp && !isParallelPlaceholder` action footer (`page.tsx:1219-1261`),
labelled `Devolver a ${cp.previousProcessName}`.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `pickPreviousMother()` skips PARALLEL/AGENDA and gaps: FINAL_CONTROL(6) → POLISH(4), never MECHANIC(5) | pure-function table test |
| Unit | `allMothersDone`: latest pass `returned` ⇒ false; superseded `returned` + newer `completed` ⇒ true; `skipped` ⇒ true | `buildCard()` with fabricated log arrays |
| Unit | `completeProcess()` resolver: PREP `returned` (2) wins over PAINT `pending` (3); two stacked returns pick the smallest `orderIndex` | pure resolver test |
| Unit | Sort stability: two logs, same `orderIndex`, different `createdAt` → chronological, backend and frontend comparator | table test |
| Integration | Full return tx: PREP `'returned'`+reason, BODYWORK first pass untouched, new `in_progress` log, `bodyshop_process_techs` deleted then upserted; forced failure at step (f) rolls back every write | Nest test module against Postgres |
| Integration | 403 for non-supervisor; 400 for missing/empty `reason`, missing `technicianId`, PARALLEL log, first MOTHER, already-`returned` log — none of them mutating any row | supertest |
| Integration | Reassigning a technician already `in_progress` elsewhere → 400, not a `23505` leak | supertest |
| E2E (manual QA) | Return PREP→BODYWORK, verify the technician is free on the capacity screen, redo BODYWORK, confirm PREP reappears `pending` and the card can then reach "Entregado" | QAS |

## Threat Matrix

N/A — no shell commands, subprocesses, VCS/PR automation, executable-file classification, or
process integration. The only sensitive boundary is HTTP authorization, covered by the D7
`RolesGuard` decision and the 403 integration test (defense in depth: the UI gate is cosmetic,
the endpoint is authoritative).

## Migration / Rollout

No DB migration. `status` is `varchar(20)` without CHECK, and the two new API response fields are
additive. Deploy order is irrelevant: an old frontend against the new backend simply never calls
the endpoint. Rollback per the proposal — revert code, then
`UPDATE tracking_logs SET status = 'blocked' WHERE status = 'returned'` (the reason survives in
`blocked_reason` by construction, D1).

## Open Questions

- [ ] D6 generalizes the spec requirement "Re-completion regenerates the returned process" from a
      fallback into a unified resolver. Both spec scenarios still hold verbatim; the spec's
      precondition wording ("when no plain `pending` MOTHER exists") should be relaxed to
      "the lowest `orderIndex` MOTHER above the completed one that is `pending` or `returned`"
      during the tasks phase, otherwise the mid-sequence PREP→PAINT skip remains unspecified.
- [ ] Displaying the return reason in the timeline requires `blockedReason` in `ProcessSummary`
      (today only `currentProcess.blockedReason` is exposed, rendered at `page.tsx:1020`).
      Included as a small additive field; drop it if the tasks phase wants a tighter slice.
