# Design: Close remaining cross-workshop exposure on 3 unguarded endpoints

## Technical Approach

Two independent slices, no shared-guard changes. Slice 1 is decorator-only on the two bodyshop
routes (both already carry `workshopId` in query/body, which `WorkshopAccessGuard` reads).
Slice 2 adds **name-level** authorization inside `TechniciansController` plus a web-client fix.

**Codebase findings that shrink the proposal's scope:**
- `TechniciansController` **already** injects `WorkshopsService` and `TechniciansModule`
  **already** imports `WorkshopsModule` (`technicians.module.ts:10`). Proposal risk #4 is closed:
  **no module change**.
- `GET /technicians` **already** has `@UseGuards(WorkshopAccessGuard)` (`technicians.controller.ts:27`).
- **The frontend fix alone is NOT sufficient.** Sending `workshopId` closes the UI path, but a
  direct call with only `?workshopName=` still fails open, and a call with
  `workshopId=<allowed>&workshopName=<other>` passes the guard while the controller uses the
  *name*. Server-side re-authorization (2b) is required; 2a is defense-in-depth, not the boundary.
- `Workshop.name` is **not unique** (`workshop.entity.ts:8`) — a `findByName` lookup would be
  ambiguous.

## Architecture Decisions

### Decision: Authorize `workshopName` by membership in the user's allowed set

| Option | Tradeoff | Decision |
|---|---|---|
| `workshopsService.findAll(user)` + `some(w => w.name === name)` | 1 query, reuses the existing user-aware primitive, no new service method, name-collision safe | **Chosen** |
| New `findByName(name)` + `findOne(ws.id, user)` | New query surface; ambiguous on duplicate names; 2 queries | Rejected |
| Resolve name→id inside `WorkshopAccessGuard` | 9-controller blast radius, breaks guard's zero-arg ctor + unit tests | Rejected (proposal) |

**Rationale**: `findAll(user)` is already the collection-scoping primitive used by `GET /workshops`;
membership in it is exactly "workshops this user may reference".

### Decision: Validate the name whenever it is present, even if `workshopId` is also sent

**Choice**: `assertWorkshopNameAllowed` runs on every request carrying `workshopName`.
**Rejected**: skipping the check when the guard already validated `workshopId`.
**Rationale**: `resolveWorkshopName` gives the **name** precedence, so a valid id would otherwise
launder an arbitrary name.

### Decision: Do not touch the guard's global fail-open

`workshop-access.guard.ts` is unmodified; the regression test
(`workshop-access.guard.spec.ts`, "sin workshopId en query/body permite el paso") stays green and
unedited. Residual gap recorded under Risks.

## Data Flow

    UI ──getTechnicians(id,name)──> GET /technicians?workshopId&workshopName
                                          │
                          WorkshopAccessGuard  (id ∈ allowedWorkshopIds?)  → 403
                                          │
                          Controller: assertWorkshopNameAllowed(name, user)
                                    findAll(user) ∋ name?              → 403
                                          │
                                 TechniciansService.findAll(name)

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/modules/bodyshop/bodyshop.controller.ts` | Modify | `@UseGuards(WorkshopAccessGuard)` on `getTechAvailability` (:108). Import already present (:12) |
| `apps/api/src/modules/bodyshop/bodyshop-schedule.controller.ts` | Modify | **Needs the new import** of `WorkshopAccessGuard`; `UseGuards` already imported. Decorate `simulate` (:13) |
| `apps/api/src/modules/technicians/technicians.controller.ts` | Modify | `@CurrentUser()` + name authorization (see below) |
| `apps/api/src/modules/workshops/workshops.service.ts` | Modify | Drop the 3 endpoints from the pending-debt comment (:47-54) |
| `apps/web/src/lib/api.ts` | Modify | `getTechnicians`: `if (workshopId) params.set('workshopId', workshopId)` (:165-168) |
| `apps/api/src/__tests__/bodyshop-tech-availability.controller.guard.spec.ts` | Create | Slice 1 |
| `apps/api/src/__tests__/bodyshop-schedule.controller.guard.spec.ts` | Create | Slice 1 |
| `apps/api/src/__tests__/technicians.controller.guard.spec.ts` | Modify | Add name cases + `findAll` to the `WorkshopsService` mock |
| `apps/api/src/modules/technicians/technicians.module.ts` | **No change** | `WorkshopsModule` already imported |

## Interfaces / Contracts

```ts
// technicians.controller.ts — `user` must come FIRST: TS forbids a required
// parameter after optional ones.
@Get()
@UseGuards(WorkshopAccessGuard)
async findAll(
  @CurrentUser() user: UserAccessContext,
  @Query('workshopId') workshopId?: string,
  @Query('workshopName') workshopName?: string,
  @Query('includeInactive') includeInactive?: string,
) { /* name = await this.resolveWorkshopName(workshopId, workshopName, user) */ }

private async resolveWorkshopName(workshopId, workshopName, user) {
  if (workshopName) {
    await this.assertWorkshopNameAllowed(workshopName, user); // runs even with workshopId
    return workshopName;
  }
  if (!workshopId) return undefined;
  return (await this.workshopsService.findOne(workshopId, user)).name; // now user-aware
}

private async assertWorkshopNameAllowed(name: string, user: UserAccessContext) {
  if (isUnrestrictedWorkshopAccess(user)) return;
  const allowed = await this.workshopsService.findAll(user);
  if (!allowed.some(w => w.name === name)) throw new ForbiddenException('No tenés acceso a este taller');
}
```

Web client contract is unchanged (`getTechnicians(workshopId, workshopName?, includeInactive?)`);
only the emitted query string gains `workshopId`. Grep confirms
`apps/web/src/hooks/use-technicians.ts:11` is the **only** caller — no other caller to migrate.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| HTTP (guard) | `GET /bodyshop/tech-availability` | New spec via `buildGuardTestApp(BodyshopController, [BodyshopService mock])`; restricted user + `workshopId=ws-2` → 403; admin → 200 |
| HTTP (guard) | `POST /bodyshop/simulate-schedule` | New spec, `BodyshopScheduleController` + `BodyshopScheduleService` mock; `workshopId` in **body** → 403 / 200 |
| HTTP (authz) | `GET /technicians?workshopName=` | Extend existing spec: (a) restricted + name outside `findAll(user)` → 403; (b) `workshopId=ws-1&workshopName=<other>` → 403; (c) admin by name → 200 |
| Unit (regression) | Guard fail-open | `workshop-access.guard.spec.ts` untouched, must stay green |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. All five rows (documentation-like paths, git repository selection,
commit state, push state, PR commands) are N/A: this change only adds HTTP authorization checks.

## Migration / Rollout

No migration. Slice 1 then Slice 2, each independently revertable. Ship the API change of Slice 2
**with or before** the web change (the extra query param is additive and safe either way).

## Risks

| Risk | Mitigation |
|---|---|
| `findAll(user)` filters `active: true` — a restricted user querying by the name of an *inactive* allowed workshop gets 403 | Accepted: the UI's workshop list comes from the same active-only primitive, so an unreachable name is already unreachable in the UI |
| **Residual**: restricted user calling `GET /technicians` with **no** params still gets every workshop's roster (guard fail-open) | Out of scope by explicit decision; file a follow-up for unscoped-collection defaults |
| `POST /bodyshop/simulate-schedule` body is an `interface`, not a validated DTO — a missing `workshopId` still fails open into the service | Pre-existing; unchanged by this design |

## Open Questions

- [ ] None blocking.
