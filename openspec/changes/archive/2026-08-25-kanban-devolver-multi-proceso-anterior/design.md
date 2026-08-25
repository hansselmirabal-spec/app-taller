# Design: Return a Kanban card to any earlier MOTHER process

> Size note: this artifact exceeds the default 800-word budget because the phase request
> explicitly demanded exact signatures, bodies, and per-call-site replacements.

## Technical Approach

Three surgical moves, no schema change:

1. `pickPreviousMother()` (singular, `[0]`) becomes `listAvailableMothers()` (plural, full deduped list). The old function is exactly `listAvailableMothers(...)[0] ?? null`, so the shipped single-hop semantics are a strict subset — this is a generalization, not a rewrite.
2. `returnToProcess()` gains `targetProcessCode`, recomputes the authoritative list **inside** the transaction, and marks every strictly-intermediate MOTHER `'returned'` before opening the destination.
3. `currentProcess.previousProcessName` is replaced by `availableReturnTargets[]`; `canReturn` becomes derived. `completeProcess()` is not touched — its unified `pending|returned` resolver already cascades.

## Architecture Decisions

### D1 — Ordering of `availableReturnTargets`: `orderIndex` DESC (nearest first)

| Option | Tradeoff | Decision |
|---|---|---|
| `orderIndex` DESC | Nearest destination first; matches the shipped mental model (`[0]` was the old `pickPreviousMother` answer); backward-compatible by construction | **Chosen** |
| `orderIndex` ASC | Reads like the process pipeline, but the most-used option (immediate previous) lands last and the `[0]`-equivalence proof is lost | Rejected |

The ordering is produced by the sort, not by a second pass: the dedup Map is filled in DESC order, and `Map` preserves insertion order, so the returned array is already DESC.

### D2 — Skipped intermediates get a NEW `'returned'` log, not an in-place mutation

| Option | Tradeoff | Decision |
|---|---|---|
| Insert a new `'returned'` pass, leave the `'completed'` pass untouched | Preserves the finished pass's `startedAt`/`completedAt`, so `realTotalHours` and `deviationTotal` keep counting the work that was actually done. Costs one extra row and one extra `plannedHours` count (already an accepted precedent — `tracking.service.spec.ts:1875`) | **Chosen** |
| Flip the existing `'completed'` log to `'returned'` | One row less, but `buildCard()` only sums real hours for `status === 'completed'` (L1083-1085, L1104-1106), so the intermediate's real hours would silently vanish from the card. Destroys history | Rejected |

This does **not** reopen confirmed decision 1 (intermediates end up `'returned'` in the same transaction); it only fixes the mechanism, and it is what the approved proposal already specifies. The **current** log keeps its in-place mutation, because it is never `'completed'` (guard at L607) so no history exists to lose.

### D3 — Same `reason`, verbatim, on every intermediate

`blocked_reason` is `varchar(120)` and the DTO already enforces `@MaxLength(120)`. A derived string (`"Cascada desde Pintura: {reason}"`) would overflow or need truncation for a user who used the full budget. One user action, one motive, one string — copied verbatim to each intermediate. Cascade context is already recoverable from the destination log's `createdAt` + the sibling `'returned'` rows in the same transaction.

### D4 — `listAvailableMothers()` stays status-agnostic

The helper does ordering + dedup only. `buildCard()` exposes every earlier MOTHER; `returnToProcess()` applies the status rules (`target` must not be open, intermediates must be `'completed'`). Rejected alternative: filtering open targets inside the helper — it would silently change the shipped `canReturn` semantics for a state that is unreachable under the current invariant, and the server already answers it with an explicit 400.

### D5 — Authoritative revalidation inside the transaction

`allLogs` moves from a pre-transaction `this.logRepo.find()` to `manager.find(TrackingLog, ...)` inside `withTechnicianLock()`. The client's `targetProcessCode` is never trusted; it is matched against the freshly computed list. Cheap pre-transaction guards (PARALLEL / non-returnable status) stay outside for fast failure and to keep the existing "does not even read logs" assertions valid.

## Data Flow

    Modal (target + reason + tech)
        │  PATCH /tracking/process/:logId/return { targetProcessCode, reason, technicianId, technicianName }
        ▼
    returnToProcess()  ── withTechnicianLock (pg_advisory_xact_lock on technicianId) ──┐
        │ manager.find(logs) → listAvailableMothers() → validate target                │
        │ (1) current log → 'returned'  + delete bodyshop_process_techs[current]       │
        │ (2) each intermediate → INSERT new 'returned' pass (same reason)             │
        │ (3) destination → INSERT 'in_progress' + upsert bodyshop_process_techs       │
        └──────────────────────── COMMIT ─────────────────────────────────────────────┘
                                     │
    completeProcess(destination) ────┘ unified pending|returned resolver
        → reactivates the smallest orderIndex 'returned' → intermediate regenerated 'pending'
        → repeat until the original process is regenerated

## Interfaces / Contracts

### 1. `listAvailableMothers()` — `tracking.service.ts` (replaces `pickPreviousMother`, ~L1016)

```ts
// Generaliza D4: TODOS los procesos MADRE con orderIndex estrictamente menor al
// actual, excluyendo PARALLEL y AGENDA, deduplicados por processCode quedándose
// con la pasada más nueva. Devuelve orderIndex DESC (el más cercano primero) —
// listAvailableMothers(...)[0] es exactamente el viejo pickPreviousMother().
// El desempate por createdAt DESC + id DESC se conserva tal cual (misma nota de
// determinismo del PR2: el id UUID solo garantiza repetibilidad, no orden real).
private listAvailableMothers(logs: TrackingLog[], current: TrackingLog): TrackingLog[] {
  const candidates = logs
    .filter(l => l.processType !== 'PARALLEL' && l.processCode !== 'AGENDA'
              && l.orderIndex < current.orderIndex)
    .sort((a, b) => b.orderIndex - a.orderIndex
                  || b.createdAt.getTime() - a.createdAt.getTime()
                  || b.id.localeCompare(a.id));

  // Map preserva el orden de inserción: como `candidates` ya viene orderIndex
  // DESC, la primera aparición de cada processCode es su pasada más nueva y el
  // array resultante queda ordenado del destino más cercano al más lejano.
  const latestByCode = new Map<string, TrackingLog>();
  for (const l of candidates) {
    if (!latestByCode.has(l.processCode)) latestByCode.set(l.processCode, l);
  }
  return [...latestByCode.values()];
}
```

### 2. `returnToProcess()` — new signature and transaction body

```ts
async returnToProcess(
  logId: string,
  reason: string,
  technicianId: string,
  targetProcessCode: string,
  technicianName?: string,
): Promise<TrackingLog>
```

`targetProcessCode` is positional #4 so the optional `technicianName` stays last.

Pre-transaction guards unchanged (L597-609): `NotFound`; reject `processType === 'PARALLEL'`; reject `status` outside `in_progress|blocked|pending`. The old L611-622 block (pre-transaction `find` + `prev` + "ya está abierto") is **deleted** and rebuilt inside the transaction.

```ts
const newLog = await this.withTechnicianLock(technicianId, async manager => {
  // (a) conflicto de técnico — idéntico a hoy (L626-633).
  const conflict = await manager.findOne(TrackingLog, { where: { technicianId, status: 'in_progress' } });
  if (conflict && conflict.id !== logId) throw new BadRequestException(/* mismo mensaje */);

  // (b) lista AUTORITATIVA recalculada dentro de la transacción: el
  // targetProcessCode del cliente nunca se usa sin revalidar (una tarjeta
  // vieja o una llamada directa a la API pueden mandar cualquier cosa).
  const allLogs = await manager.find(TrackingLog, {
    where: { sourceType: log.sourceType, sourceId: log.sourceId },
    order: { orderIndex: 'ASC', createdAt: 'ASC' },
  });
  const available = this.listAvailableMothers(allLogs, log);   // orderIndex DESC
  if (available.length === 0) throw new BadRequestException('No hay proceso anterior al que devolver');

  const target = available.find(l => l.processCode === targetProcessCode);
  if (!target) throw new BadRequestException('El proceso destino no es válido para esta devolución');
  if (['pending', 'in_progress', 'blocked'].includes(target.status)) {
    throw new BadRequestException('El proceso destino ya está abierto');
  }

  // (c) intermedios = MADRE estrictamente entre el destino (exclusivo) y el
  // actual (exclusivo). `available` ya excluye el log actual (orderIndex <).
  const skipped = available.filter(l => l.orderIndex > target.orderIndex);

  // Validación defensiva: hoy es inalcanzable (un MADRE posterior solo se
  // activa cuando todos los anteriores están completos), pero si esa
  // invariante cambia queremos un 400 explícito, no una cascada silenciosa.
  for (const s of skipped) {
    if (s.status !== 'completed') {
      throw new BadRequestException(
        `No se puede devolver: el proceso intermedio "${s.processName}" no está completado (estado actual: ${s.status})`,
      );
    }
  }

  // (d) snapshot del técnico saliente ANTES de borrar process_techs (L637-643, intacto).
  if (!log.technicianId) { /* resolveAssignedTechnician(log) … */ }

  // (e) TODOS los 'returned' ANTES del insert 'in_progress' del destino —
  // si se invirtiera, el índice único parcial
  // tracking_logs_one_in_progress_per_technician (migración 011) dispararía
  // 23505 al reasignar el mismo técnico al proceso reabierto.
  log.status = 'returned';
  log.blockedReason = reason;
  log.pausedAt = null;
  await manager.save(TrackingLog, log);

  if (log.sourceType === 'bodyshop') {
    await manager.delete(BodyshopProcessTech, { entryId: log.sourceId, process: log.processCode });
  }

  // (f) una pasada NUEVA 'returned' por intermedio — la 'completed' original
  // queda intacta como historial (ver D2). Sin técnico (decisión 8): el
  // técnico elegido aplica solo al destino final.
  for (const s of skipped) {
    await manager.save(TrackingLog, manager.create(TrackingLog, {
      sourceType:   log.sourceType,
      sourceId:     log.sourceId,
      processName:  s.processName,
      processCode:  s.processCode,
      orderIndex:   s.orderIndex,
      plannedHours: s.plannedHours,
      processType:  'MOTHER',
      status:       'returned',
      blockedReason: reason,   // D3: mismo motivo, textual
    }));
  }

  // (g) destino: pasada nueva in_progress con el técnico elegido (L663-675, intacto salvo prev→target).
  const created = await manager.save(TrackingLog, manager.create(TrackingLog, {
    sourceType: log.sourceType, sourceId: log.sourceId,
    processName: target.processName, processCode: target.processCode,
    orderIndex: target.orderIndex, plannedHours: target.plannedHours,
    processType: 'MOTHER', status: 'in_progress', startedAt: new Date(),
    technicianId, technicianName,
  }));

  // (h) upsert bodyshop_process_techs del destino (L679-691, `prev` → `target`).
  return created;
});
```

Post-transaction `setPauseStatus()` block (L705-713) unchanged.

**Not touched**: `bodyshop_process_techs` rows of skipped intermediates. They hold no assignment relevant to a `'returned'` state (`completeProcess()` already leaves stale rows behind today — a pre-existing inconsistency, out of scope).

### 3. `ReturnProcessDto` — `tracking.controller.ts:44-48`

```ts
export class ReturnProcessDto {
  @IsString() @IsNotEmpty() @MaxLength(120) reason: string;
  @IsUUID() technicianId: string;
  @IsString() @IsNotEmpty() targetProcessCode: string;   // ← nuevo, obligatorio
  @IsOptional() @IsString() technicianName?: string;
}
```

Controller L156 becomes:
`this.service.returnToProcess(logId, dto.reason, dto.technicianId, dto.targetProcessCode, dto.technicianName)`.

No `@IsIn(...)` whitelist: the valid set is per-entry and dynamic — the server-side revalidation in (b) is the real gate.

### 4. `buildCard()` and the card contract

`tracking.service.ts:115-116` (inside `TrackingCard['currentProcess']`) becomes:

```ts
export interface ReturnTarget { processCode: string; processName: string; orderIndex: number; }
// …
canReturn: boolean;
availableReturnTargets: ReturnTarget[];
```

`tracking.service.ts:1108-1110` becomes:

```ts
const availableReturnTargets: ReturnTarget[] = currentLog
  ? this.listAvailableMothers(sorted, currentLog)
      .map(l => ({ processCode: l.processCode, processName: l.processName, orderIndex: l.orderIndex }))
  : [];
```

`L1131-1132` → `canReturn: availableReturnTargets.length > 0, availableReturnTargets,`
`L1142-1143` (**verified: the `parallelBlocking` branch still hardcodes `canReturn: false` at the current L1142**) → `canReturn: false, availableReturnTargets: [],`

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/modules/tracking/tracking.service.ts` | Modify | `ReturnTarget` export + card type L115-116; `returnToProcess()` L591-716; `pickPreviousMother` → `listAvailableMothers` L996-1023; `buildCard()` L1108-1143 |
| `apps/api/src/modules/tracking/tracking.controller.ts` | Modify | DTO L44-48; call L156 |
| `apps/web/src/lib/api.ts` | Modify | Card type L1388-1389; `returnTrackingProcess()` L1471-1482 gains `targetProcessCode` |
| `apps/web/src/hooks/use-tracking.ts` | Modify | `useReturnProcess` L58-66 mutation vars gain `targetProcessCode` |
| `apps/web/src/components/kanban/return-process-modal.tsx` | Modify | `previousProcessName: string` → `targets: ReturnTarget[]`; destination radio list; `onConfirm` gains `targetProcessCode` |
| `apps/web/src/app/(dashboard)/seguimiento/kanban/page.tsx` | Modify | 5 sites (see below) |
| `apps/api/src/__tests__/tracking.service.spec.ts` | Modify | Approval-rewrite of 4 suites + 3 new cases + `makeManager` gains `find` |
| `apps/api/src/__tests__/tracking.controller.spec.ts` | Modify | Call assertion L159-167; DTO suite L177-205 gains a missing-target case |
| `apps/api/src/__tests__/integration.int.spec.ts` | Modify | New real cascade scenario |

### `previousProcessName` call sites — verified against current `main`

Proposal said "6 known". Real count is **7 frontend sites** (the proposal missed `page.tsx:844`) plus **3 backend sites**. 16 raw occurrences total.

| # | Location | Current code | Replacement |
|---|---|---|---|
| B1 | `tracking.service.ts:116` | `previousProcessName: string \| null;` | `availableReturnTargets: ReturnTarget[];` |
| B2 | `tracking.service.ts:1132` | `previousProcessName: previousMother?.processName ?? null` | `availableReturnTargets,` |
| B3 | `tracking.service.ts:1143` | `previousProcessName: null` (parallel branch) | `availableReturnTargets: []` |
| F1 | `api.ts:1389` | `previousProcessName: string \| null;` | `availableReturnTargets: ReturnTarget[];` (export the type from `api.ts`) |
| F2 | `page.tsx:844` | `onReturn: (logId, processName, previousProcessName: string) => void` | `onReturn: (logId: string, processName: string, targets: ReturnTarget[]) => void` |
| F3 | `page.tsx:1253-1258` | `cp.canReturn && cp.previousProcessName && …` + label `` `Devolver a ${cp.previousProcessName}` `` | gate `cp.canReturn && cp.availableReturnTargets.length > 0`; click `onReturn(cp.logId, cp.processName, cp.availableReturnTargets)`; label becomes the static `'Devolver proceso'` (the destination is now chosen in the modal, not on the button) |
| F4 | `page.tsx:1859` | `useState<{ logId; processName; previousProcessName: string }\|null>` | `useState<{ logId: string; processName: string; targets: ReturnTarget[] }\|null>` |
| F5 | `page.tsx:1942-1943` | `handleReturnOpen(logId, processName, previousProcessName)` | `handleReturnOpen(logId, processName, targets)` → `setReturnModal({ logId, processName, targets })` |
| F6 | `page.tsx:2045` | `previousProcessName={returnModal.previousProcessName}` | `targets={returnModal.targets}` |
| F7 | `return-process-modal.tsx:27,30,61,90` | prop + title + technician label | `targets` prop; static title; labels bound to the selected target |

`handleReturnConfirm` (`page.tsx:1946-1955`) also changes: it forwards `targetProcessCode` to `returnMutation.mutateAsync`.

### 5. `return-process-modal.tsx` — destination selector

```ts
export function ReturnProcessModal({ processName, targets, onConfirm, onClose, isLoading }: {
  processName: string;
  targets: ReturnTarget[];
  onConfirm: (targetProcessCode: string, reason: string, technicianId: string, technicianName: string) => Promise<void>;
  onClose: () => void;
  isLoading: boolean;
})
```

- `const sortedTargets = [...targets].sort((a, b) => b.orderIndex - a.orderIndex);` — the server already sends DESC; this is an idempotent client-side safeguard.
- `const [targetCode, setTargetCode] = useState(sortedTargets[0]?.processCode ?? '')` — nearest destination preselected, so the shipped one-hop flow keeps the same number of clicks.
- Layout order: **(1) destination → (2) reason → (3) technician**. Section 1 reuses the exact `RETURN_REASONS` visual pattern (`<label>` + `<input type="radio" name="return-target" className="accent-indigo-500">` + the same conditional `text-slate-900 font-medium` / `text-slate-600` classes). Always rendered, even with a single option, so the destination is always explicit.
- Header title becomes the static `Devolver proceso` with `{processName}` as subtitle (L61-62). The technician label (L90) becomes `Técnico para {selectedTarget?.processName}`.
- Cascade hint, derived client-side from the same array — `const skipped = sortedTargets.filter(t => t.orderIndex > selected.orderIndex)`; when non-empty, render `También se devolverán: {skipped.map(t => t.processName).join(', ')}` under the selector. Zero extra API surface; it makes the multi-hop side effect visible before confirming.
- `canConfirm = !!targetCode && !!effectiveReason && !!selectedTech && !isLoading`. `handleConfirm` gains `if (!targetCode) { setError('Elegí el proceso destino'); return; }`.
- Reason and technician remain **single** inputs applied to the whole operation (decision 8: the technician binds only to the destination).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `listAvailableMothers` ordering/dedup/filters | Approval-rewrite of the two `pickPreviousMother` suites |
| Unit | `buildCard` contract | Approval-rewrite of the `canReturn`/`previousProcessName` suite + new parallel-branch case |
| Unit | `returnToProcess` multi-hop, validations, write order | Approval-rewrite (signature) + 3 new cases |
| Unit | DTO / controller wiring | Extend existing controller suite |
| Integration | Full cascade against a live API + Postgres | New scenario in `integration.int.spec.ts` |

### Approval-rewrite (signature/contract changed — must be rewritten, not extended)

| Suite | Lines | Change |
|---|---|---|
| `pickPreviousMother (PR1)` | 1494-1543 | → `listAvailableMothers`. Case 1: from `FINAL_CONTROL(6)` expect `['POLISH','PAINT','PREP','BODYWORK']` in that order, `MECHANIC`/`AGENDA` absent. Case 2: first MOTHER → `[]` (was `null`). Case 3: dedup → `length === 1` and `[0].id === 'l-bw-redo'` |
| `pickPreviousMother — desempate por id (PR2)` | 1680-1694 | Same tie fixture; now also assert `length === 1` (dedup collapses the tie) plus order-independent `[0].id` |
| `buildCard — canReturn / previousProcessName (PR1)` | 1638-1676 | → `availableReturnTargets`. `toEqual([{ processCode:'BODYWORK', processName:'Chapería', orderIndex:1 }])` + `canReturn === true`; first-MOTHER case → `[]` + `canReturn === false` |
| `returnToProcess (PR2)` | 1696-1831 | All 7 calls gain the 4th positional arg. `service.returnToProcess('l-prep','motivo',TECH_ID,'BODYWORK')`. The "no hay proceso anterior" case (1717-1727) now passes an invalid target and asserts the invalid-target 400 |
| `tracking.controller.spec.ts` | 159-167 | `toHaveBeenCalledWith('log-001','Faltó soldar un panel','tech-001','BODYWORK','Luis Benitez')` |

### Unchanged (explicitly verified — do not touch)

`completeProcess — resolver unificado pending|returned` (1833-1873), `buildCard — allMothersDone` (1545-1603), `buildCard — orden cronológico` (1605-1636), `plannedHours NO se deduplica` (1875+).

### Harness change

`makeManager()` (spec L155-201) must gain `find: async (entity, opts) => repoFor(entity)?.find?.(opts) ?? []`, because `listAvailableMothers()` now reads through the transaction manager instead of `this.logRepo`.

### New unit cases

1. **Multi-hop write order** — PAINT(3) current, PREP(2) `completed`, BODYWORK(1) `completed`; return to `BODYWORK`. Assert `saved.filter(s => s.entity === TrackingLog)` has length 3 and, in order: `{ id:'l-paint', status:'returned', blockedReason: reason }`, `{ processCode:'PREP', status:'returned', blockedReason: reason, technicianId: undefined }`, `{ processCode:'BODYWORK', status:'in_progress', technicianId:'tech-new' }`. Also assert the original `l-prep` `'completed'` log was never saved (history intact — D2).
2. **Non-completed intermediate** — same fixture with PREP `status: 'blocked'`; expect `BadRequestException` matching `/Preparación/` and `saved` empty.
3. **Invalid target** — `targetProcessCode: 'AGENDA'` (and a second case with `'MECHANIC'`); expect 400 and zero writes.

### Integration scenario — real cascade (closes the coverage gap flagged by exploration)

New `describeIfApi('Kanban — devolución multi-proceso (cascada)')` in `apps/api/src/__tests__/integration.int.spec.ts`, following the file's `if (!apiAvailable) return;` convention. Runs via `pnpm test:integration` against the live API + Postgres, so it exercises the real transaction, migration 011's partial unique index, and the real `completeProcess()` resolver — not mocks.

1. `POST /bodyshop` — entry with `bodyworkHours: 1, prepHours: 1, paintHours: 1`; keep `entryId`.
2. Walk the board via `GET /tracking/board?date&workshopId`: complete `AGENDA` if present, then start + complete `BODYWORK`, start + complete `PREP`. Board now shows `PAINT` as `currentProcess`.
3. **Assert the contract**: `currentProcess.canReturn === true` and `currentProcess.availableReturnTargets.map(t => t.processCode)` equals `['PREP','BODYWORK']` (nearest first).
4. `PATCH /tracking/process/{paintLogId}/return` with `{ targetProcessCode: 'BODYWORK', reason: 'Retrabajo QA', technicianId }` → 200.
5. Re-read the board: `currentProcess.processCode === 'BODYWORK'` and `status === 'in_progress'`; `allProcesses` contains a `PAINT` pass `'returned'`, a `PREP` pass `'returned'`, **and** the original `PREP` `'completed'` pass (D2 history assertion).
6. `PATCH /tracking/process/{bodyworkLogId}/complete` → response `next.processCode === 'PREP'` and `next.status === 'pending'` — **PREP reactivated**.
7. `PATCH .../{prepLogId}/start` with a technician, then `.../complete` → `next.processCode === 'PAINT'` and `next.status === 'pending'` — **PAINT reactivated**. This is the chained step the exploration flagged as uncovered.
8. Cleanup: cancel/delete the entry so the scenario is re-runnable.

Negative HTTP companion: `PATCH .../return` with `{ targetProcessCode: 'AGENDA' }` → 400, and without `targetProcessCode` → 400 (DTO).

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The change is confined to an authenticated REST endpoint, its service transaction, and React UI.

## Migration / Rollout

No migration required. No schema change, no backfill; `'returned'` is a shipped status and migration 011's index is unaffected (intermediates are inserted `'returned'`, never `'in_progress'`). Ship API and web together — `previousProcessName` disappears from the payload, so a stale web build would lose the return button (fail-closed, not fail-wrong). Rollback = revert the commit; multi-hop rows written meanwhile remain valid `'returned'` passes that the reverted resolver still reactivates by smallest `orderIndex`.

## Open Questions

- [ ] `withTechnicianLock()` serializes on `technicianId` (`pg_advisory_xact_lock(hashtext(technicianId))`, L321-326), not on the entry. Two concurrent returns on the **same** entry with **different** technicians are not serialized by the lock; the in-transaction revalidation (D5) narrows but does not eliminate the window. Pre-existing (the shipped single-hop version has the same property), scope grows with multi-hop. Fix would be an entry-scoped advisory lock or `SELECT … FOR UPDATE` on the current log — recommend accepting for now and tracking as a follow-up.
- [ ] Confirm the `'Devolver proceso'` button label (F3) is acceptable UX now that the destination moved into the modal, instead of keeping a dynamic `Devolver a {nearest}`.
