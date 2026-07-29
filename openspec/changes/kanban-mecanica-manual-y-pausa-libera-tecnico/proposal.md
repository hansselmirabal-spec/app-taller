# Proposal: Add manual Mechanic to Kanban Operativo + Pause releases technician

## Intent

Two gaps in the operational Kanban (`seguimiento/kanban`):

1. **Add Mechanic manually** — bodyshop entries can only get their parallel processes (MECHANIC, DIAMANTADO, LLANTAS, ELECTRICO) at creation time. There is no way to add a parallel process later, so a car that turns out to need mechanical work after entry cannot be tracked. `initForBodyshop` is create-once (`if (existing) return`); no `addProcess` method exists.
2. **Pause releases technician** — pausing a process leaves the technician nominally owning a blocked log and still counted as occupied on capacity/availability screens (`getTechnicianAvailability`, `getDayCapacity` via `BodyshopProcessTech`). The technician should become free for other work while paused, and resuming should confirm/select the technician.

## Scope

### In Scope
- New endpoint + transactional service method to add a parallel process to an existing bodyshop entry: writes a new `TrackingLog` **and** appends to `entry.processes` jsonb in one transaction (dual-write, avoids the known hours-desync bug).
- Structural pause-release: `blockProcess` snapshots + releases the assigned technician (`BodyshopProcessTech.technicianId`) so the tech disappears from capacity/occupancy screens while paused.
- Resume requires technician confirmation/selection: `unblockProcess` accepts optional `technicianId`/`technicianName`; UI defaults to the same technician if still free (via extended conflict-check helper `isTechnicianFree`).
- Frontend: always-visible "+ Agregar proceso" affordance on `KanbanCard`; technician confirm/change step on both card- and modal-level Reanudar paths (including parallel-process resume).

### Out of Scope
- **Making manually-added Mechanic affect capacity math.** `BALANCE_PROCESSES`/`entryHoursByProcess()` structurally exclude MECHANIC; extending them is a separate, larger change. Adding Mechanic will NOT change `getDayCapacity`/`getWeekCapacity` occupancy — by design.
- Toast/notification infrastructure (none exists). Optional low-cost CSS ring reuse only, if desired.
- Facturación, CRM, inventario.

## Capabilities

### New Capabilities
- `tracking-add-process`: adding a parallel process to an existing bodyshop entry post-creation with `TrackingLog`/`entry.processes` consistency.
- `tracking-pause-technician-release`: releasing a technician's capacity on pause and confirming/reassigning on resume.

### Modified Capabilities
- None (no existing specs in `openspec/specs/`).

## Approach

- **Func. 1 (exploration Approach 1):** `POST tracking/process/bodyshop/:entryId/add { processCode, hours }`, validated against `BODYSHOP_PARALLEL_CODES` + dedup. Shared private helper builds the `entry.processes` entry to avoid drift from `create()`.
- **Func. 2 (exploration Approach 1, full/structural):** extend `blockProcess()` to snapshot then null `BodyshopProcessTech.technicianId` (release); extend `unblockProcess()` DTO with optional technician fields, persisting onto the log (mirrors `startProcess`). New `isTechnicianFree(technicianId, excludeLogId)` reuses the `in_progress` conflict-check to suggest the same tech on resume.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/.../tracking/tracking.service.ts` | Modified | New `addProcessToBodyshop`; `block/unblockProcess` release+reassign; `isTechnicianFree` helper |
| `apps/api/.../tracking/tracking.controller.ts` | Modified | New add-process endpoint; `unblock` DTO gains optional technician fields |
| `apps/api/.../bodyshop/bodyshop.service.ts` | Modified | Dual-write to `entry.processes`; release/restore `BodyshopProcessTech` on pause/resume |
| `apps/web/.../seguimiento/kanban/page.tsx` | Modified | "+ Agregar proceso" slot; technician confirm/change on resume |
| `apps/web/src/hooks/use-tracking.ts` | Modified | `useAddProcess`; `useUnblockProcess` technician params |
| `apps/web/src/lib/api.ts` | Modified | `addTrackingProcess`; `unblockTrackingProcess` signature |
| New technician-picker component | New | Copies `ProcessTechRow` interaction pattern |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `entry.processes` / `TrackingLog` desync (known bug class) | Med | Transactional dual-write via shared helper, mirroring `syncBodyshopPlannedHours` |
| `BodyshopProcessTech` release/restore leaves orphaned/wrong assignment | Med | Snapshot technician on the log before release; restore path is idempotent and design-reviewed |
| Parallel-process resume uses `onStart` not `onUnblock` — technician step may be skipped | Med | Route paused parallel resume through the confirm step in design |
| **Combined diff likely > 400-line review budget** | High | Split into chained PRs: PR1 = Func. 1 (add process), PR2 = Func. 2 (pause-release). Orchestrator decides via cached `delivery_strategy=auto-forecast`, `chain_strategy=stacked-to-main` |

## Rollback Plan

Pure additive on backend (new endpoint, extended optional DTO fields) — revert the two service methods and the controller endpoint; no schema/migration (jsonb already supports arbitrary entries). Frontend affordances are additive; reverting the kanban page + hooks + api changes restores prior behavior. No data migration to undo.

## Dependencies

- None external. Relies on existing `BodyshopProcessTech`, `TrackingLog`, `resolveAssignedTechnician`, and conflict-check.

## Success Criteria

- [ ] A parallel process can be added to an existing bodyshop entry from Kanban Operativo; Kanban Operativo and status-Kanban totals stay consistent.
- [ ] Pausing a process removes the technician from capacity/availability screens while paused.
- [ ] Resuming prompts to confirm/select technician, defaulting to the same tech if free.
- [ ] Adding Mechanic does not alter `getDayCapacity`/`getWeekCapacity` occupancy.
