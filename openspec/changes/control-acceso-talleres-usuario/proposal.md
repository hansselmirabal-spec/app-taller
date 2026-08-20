# Proposal: Per-user workshop access control

## Intent

`User.allowedWorkshopIds`, the admin assignment UI, and `WorkshopAccessGuard` all exist, but the guard is **dead code in production**: `jwt.strategy.ts:30-37` returns only `{id, email, role, permissions}`, so `user.allowedWorkshopIds` is always `undefined` and the guard's default-allow branch (`workshop-access.guard.ts:11`) lets everyone through — including on the 7 endpoints where it is already applied. Restricting a user today has zero effect in QAS/PROD. This change makes the restriction real and rolls it out to the sensitive endpoints.

## Scope

Split into two slices. **Part 1 is a security fix and should ship as the first PR of the chain, before Part 2 design is finished.**

### In Scope — Part 1 (security fix, urgent, isolated PR)
- Hydrate `allowedWorkshopIds` into `request.user` via a **fresh per-request DB read**, not an embedded JWT claim (an embed leaves revocation ineffective for up to 8h of token life).
- Resolve the `admin_taller` bypass mismatch: the guard bypasses `role === 'admin'` only, while the frontend treats `admin_taller` as full access. Design decides which side is authoritative.
- **Data audit of QAS/PROD before merge**: enabling enforcement for the first time can instantly lock out any user already holding a restricted list.

### In Scope — Part 2 (rollout, after Part 1)
- Apply `WorkshopAccessGuard` to: `appointments`, `budget-appointments`, `operational-blocks`, `bodyshop-catalog`, `bodyshop-capacity`, `technicians` controllers.
- Scope `GET /workshops` so a restricted user does not see inaccessible workshops.
- Decide frontend behavior in `workshop-context.tsx` / `workshop-switcher.tsx` once the list is scoped: filter the list vs. show-all-but-block-selection.
- Case-by-case (NOT blanket) decision for nullable-`workshopId` catalogs: `service-types`, `specialties`, `work-types`.

### Out of Scope (explicit non-goals, not oversights)
- **List-result filtering.** The guard only rejects requests carrying an explicit `workshopId`; it never strips disallowed rows from collections.
- **Indirect resources keyed by `entryId`**: `bodyshop-work-items.controller.ts`, `bodyshop-schedule.controller.ts`.
- **Any `dms-sync` scoping.** `Workshop.dmsBranch` exists as a mapping but no dms-sync controller uses it for access control. Separate change if ever wanted.
- Systemic query-layer scoping (exploration Approach 3) and `budget-simulator` (confirmed genuinely global).

## Capabilities

### New Capabilities
- `workshop-access-control`: which users may act on which workshops — hydration source of truth, role bypass rules, unrestricted semantics (`null`/empty array = all), enforced endpoint surface, and frontend workshop-selection behavior.

### Modified Capabilities
- None (existing specs are `budget-simulator-edit`, `budget-workspace-board`; neither is touched).

## Approach

Exploration **Approach 2**. Part 1 changes the hydration point only (`jwt.strategy.validate()` fetches the user's current `allowedWorkshopIds` + role from DB, optionally short-TTL cached) plus the `admin_taller` bypass decision in the guard — no controller edits, keeping the security PR small and revertable. Part 2 is mechanical `@UseGuards` placement on the confirmed controller list, plus service-level scoping for `GET /workshops` and the matching frontend switcher behavior.

## Affected Areas

| Area | Impact | Part |
|---|---|---|
| `apps/api/src/modules/auth/jwt.strategy.ts` | Modified | 1 |
| `apps/api/src/common/guards/workshop-access.guard.ts` | Modified (`admin_taller` bypass) | 1 |
| `apps/api/src/modules/auth/auth.service.ts:38` | Unchanged (claim NOT embedded — decision) | 1 |
| QAS/PROD `users.allowed_workshop_ids` data | Audit only | 1 |
| `appointments`, `budget-appointments`, `operational-blocks`, `bodyshop-catalog`, `bodyshop-capacity`, `technicians` controllers | Modified | 2 |
| `apps/api/src/modules/workshops/workshops.controller.ts` + service | Modified (scoped list) | 2 |
| `apps/web/src/context/workshop-context.tsx`, `workshop-switcher.tsx` | Modified | 2 |
| `service-types`, `specialties`, `work-types` controllers | Decision pending | 2 |
| `apps/web/.../settings/users/page.tsx` | Unchanged (UI already complete) | — |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Real users locked out the moment enforcement turns on | High | Mandatory QAS/PROD data audit before merging Part 1; clear the list for anyone who should be unrestricted |
| `admin_taller` with a stale array gets wrongly restricted (UI hides the selector, so it can't be cleared) | High | Resolve bypass parity in Part 1; clear stale arrays on role change |
| Per-request DB read adds latency to every guarded request | Med | Short-TTL in-memory cache; measure before optimizing |
| Empty array currently means "unrestricted" (`guard:14`) — easy to misread as "no access" | Med | Make the semantic explicit in the spec and in the admin UI copy |
| Part 2 exceeds the 400-line review budget | Med | Chained PRs; controllers, workshops scoping, and frontend as separate slices |
| False sense of security: lists stay unfiltered even after rollout | Med | Documented non-goal above; state it in the spec, not only the proposal |

## Rollback Plan

- **Part 1**: revert one PR touching 2 files; the guard returns to its no-op default-allow branch. No schema, no migration, no data change.
- **Part 2**: revert per slice; removing `@UseGuards` restores unrestricted behavior. `GET /workshops` scoping is a service-level filter with no persisted state.
- No migrations in either part, so rollback cannot lose data.

## Dependencies

- QAS/PROD data audit result gates the Part 1 merge.
- Part 2 depends on Part 1 being merged (the guard is inert without hydration).

## Success Criteria

- [ ] A restricted user requesting a `workshopId` outside their list gets `403` on every guarded endpoint (today: `200`).
- [ ] Revoking a workshop in the admin UI takes effect on the user's next request, with no re-login.
- [ ] `admin` and (per design decision) `admin_taller` retain full access; `null`/empty array remains unrestricted.
- [ ] Pre-merge audit shows no existing QAS/PROD user is unintentionally locked out.
- [ ] `GET /workshops` returns only accessible workshops, and the switcher behaves per the chosen option.
- [ ] Non-goals (list filtering, `entryId` resources, `dms-sync`) are recorded in the spec as known gaps.

## Proposal question round

Open product decisions for the user before/while `sdd-design` runs:

1. **`admin_taller`**: full access to every workshop (backend bypass added), or is it a workshop-scoped role that must respect `allowedWorkshopIds` (frontend fixed instead)?
2. **Switcher UX**: hide inaccessible workshops entirely, or show them disabled so the user understands access exists but isn't granted?
3. **Catalogs** (`service-types`, `specialties`, `work-types`): are rows with `workshopId = null` shared global catalog entries that every user should keep seeing?
4. **Lockout policy**: if the audit finds restricted users, clear their lists (unrestricted) or keep the restriction and accept they lose access on merge?
