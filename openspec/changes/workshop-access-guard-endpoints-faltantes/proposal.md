# Proposal: Close remaining cross-workshop exposure on 3 unguarded endpoints

## Intent

The previous change (`control-acceso-talleres-usuario`) guarded 8 controllers but explicitly deferred 3 endpoints, documented as pending debt in `workshops.service.ts:47-54`. Today a workshop-restricted user can still read another workshop's data:

- `GET /technicians?workshopName=` returns the full technician roster of any workshop, including staff `email` (perito accounts), `dailyHours`, `specialty`, `box`, `dmsAdvisorCode`.
- `GET /bodyshop/tech-availability` and `POST /bodyshop/simulate-schedule` leak per-technician capacity and scheduling data cross-workshop.

This is a cross-tenant authorization boundary violation of the same class the prior change fixed, left half-finished. Closing it makes the workshop restriction actually mean what the admin UI promises.

## Scope

### In Scope
- Slice 1: add `@UseGuards(WorkshopAccessGuard)` to `getTechAvailability` and `simulate`.
- Slice 2: authorize `GET /technicians` by both `workshopId` and `workshopName`, at controller level, reusing the existing user-aware primitive.
- Slice 2: fix `getTechnicians()` in the web client so it actually sends the `workshopId` it already receives.
- Guard HTTP regression tests for all 3 endpoints, reusing `__tests__/helpers/workshop-guard-http.helper.ts`.
- Remove these 3 endpoints from the pending-debt comment in `workshops.service.ts`.

### Out of Scope
- Changing `WorkshopAccessGuard`'s fail-open-when-no-`workshopId` behavior (locked by regression test; needed for unscoped routes).
- Injecting `WorkshopsService` into the shared guard (guard-level approach, rejected — see Approach).
- Any other endpoint, module, or response-shape change.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `workshop-access-control`: extend "Guarded endpoint enforcement" to the two bodyshop routes, and add a requirement that workshop scoping by **name** is authorized equivalently to scoping by id.

## Approach

Two independent slices, shippable in order.

1. **Decorator fix** — both bodyshop routes already require `workshopId` (query / required body field) and both frontend callers already send it. Only the decorator is missing; siblings in the same controllers already use it. Mechanical, no behavior change beyond the check.
2. **Controller-level authorization** — in `TechniciansController.findAll`, take `@CurrentUser() user` and re-run the existing `WorkshopsService.findOne(id, user)` / `isUnrestrictedWorkshopAccess` check, resolving `workshopName` when only the name is supplied. This closes the gap for direct API callers, not just the UI, without touching the shared guard.

Guard-level resolution (`workshopName` → id inside the guard) was rejected: it forces `WorkshopsModule` into 2 modules that don't import it, breaks the guard's zero-arg constructor and its unit tests, and adds a DB round trip to a hot path — a 9-controller blast radius for a 1-route gap. Revisit only if name-based scoping appears elsewhere.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/modules/bodyshop/bodyshop.controller.ts` | Modified | Add guard to `getTechAvailability` (already imported) |
| `apps/api/src/modules/bodyshop/bodyshop-schedule.controller.ts` | Modified | Import + add guard to `simulate` |
| `apps/api/src/modules/technicians/technicians.controller.ts` | Modified | Authorize `workshopId`/`workshopName` via `WorkshopsService` |
| `apps/api/src/modules/technicians/technicians.module.ts` | Modified | Import `WorkshopsModule` if not already reachable |
| `apps/api/src/modules/workshops/workshops.service.ts` | Modified | Name lookup if needed; update pending-debt comment |
| `apps/web/src/lib/api.ts:163-170` | Modified | Send `workshopId` in the query string |
| `apps/api/src/__tests__/*.controller.guard.spec.ts` | New | Guard coverage for the 3 endpoints |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Touching the guard's global fail-open | Low | No guard file changes; existing regression test must stay green |
| An undiscovered `GET /technicians` caller breaks when `workshopId` is sent | Low | Only `use-technicians.ts` found; re-grep during apply; param is additive |
| Authorization in a controller diverges from the guard pattern | Med | Reuse the same `isUnrestrictedWorkshopAccess` primitive; document rationale inline |
| Restricted user legitimately querying by name gets 403 | Low | Behavior is the intended fix; verify UI always passes an accessible workshop |

## Rollback Plan

No schema or migration changes. Each slice is a self-contained revert: `git revert` the slice commit restores prior behavior immediately. Slice 1 and Slice 2 are independent — reverting one does not affect the other.

## Dependencies

- Builds on `control-acceso-talleres-usuario` (archived): `allowedWorkshopIds` hydration, `isUnrestrictedWorkshopAccess`, and `WorkshopsService.findOne(id, user)` must already be in place. They are.

## Success Criteria

- [ ] A restricted user calling any of the 3 endpoints for a disallowed workshop receives 403.
- [ ] `GET /technicians?workshopName=<other-workshop>` with no `workshopId` returns 403 for a restricted user (direct API call, not just via UI).
- [ ] `admin`, `admin_taller`, and unrestricted users see no behavior change on all 3 endpoints.
- [ ] The existing guard fail-open regression test still passes, unmodified.
- [ ] The pending-debt comment in `workshops.service.ts` no longer lists these endpoints.
