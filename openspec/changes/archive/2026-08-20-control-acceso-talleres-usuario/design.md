# Design: Per-user workshop access control

## Technical Approach

Hydrate `request.user.allowedWorkshopIds` from a **fresh per-request DB read** in
`JwtStrategy.validate()` — the single choke point every authenticated request
already crosses — and make `WorkshopAccessGuard` bypass `admin_taller` in parity
with the frontend. No JWT claim, no cache, no migration. Part 1 touches 4 files
(~180 lines with tests) and is independently revertable.

## Architecture Decisions

### Decision: Hydrate in `JwtStrategy.validate()`, not a claim or interceptor
**Choice**: `validate()` becomes `async`, injects `UsersService`, and reads the
user row on every authenticated request.
**Alternatives**: (a) embed `allowedWorkshopIds` in the signed JWT — rejected:
revocation would lag up to 8h, defeating the change's purpose; (b) a dedicated
global interceptor/middleware — rejected: a second auth-ish hop with its own
ordering bugs, when Passport already runs exactly once per request and owns
`request.user`.
**Rationale**: One choke point, zero controller edits, guard stays a pure
function of `request.user`.

### Decision: No cache — accept the direct read
**Choice**: Ship the raw query. Do not add TTL caching in Part 1.
**Alternatives**: 30-60s in-memory cache invalidated on `UsersService.update()`.
**Rationale**: A cache reintroduces exactly the staleness window we are removing,
plus an invalidation coupling. The read is a **single PK index lookup on `users`**
(no joins, no relations) at workshop scale — tens of concurrent users, not
thousands of RPS. Every request already performs heavier domain queries. Revisit
only if p95 auth latency exceeds ~5ms or sustained RPS crosses ~100.

### Decision: Narrow `findAccessContext()` instead of reusing `findById()`
**Choice**: New `UsersService.findAccessContext(id)` selecting only
`id, role, allowedWorkshopIds, active`.
**Alternatives**: reuse `findById()`.
**Rationale**: `findById()` eager-loads `customRole` **and** `fillDefaultRole()`
can fire a *second* query against `roles` — 2 queries per request for data the
strategy discards. The narrow method keeps it at 1.

### Decision: `role` becomes DB-authoritative; `permissions` stay JWT-borne
**Choice**: `request.user.role` comes from the row; `permissions` keep coming
from the payload.
**Rationale**: The workshop bypass keys off `role`, so a stale role would let a
demoted `admin_taller` bypass restrictions for 8h. Role is free once the row is
loaded. Permission staleness is pre-existing, deliberate behavior
(`auth.service.ts:35-37`) and is **not** in scope — recorded as a known gap.

### Decision: Fail closed on missing/inactive user
**Choice**: `validate()` throws `UnauthorizedException` when the row is absent or
`active === false`.
**Rationale**: Consistent with login (`auth.service.ts:29`) and closes a real
hole — deleting or deactivating a user is currently a no-op until token expiry.
DB-outage semantics do not regress: every controller already needs the DB, so an
outage is total regardless.

### Decision: `admin_taller` bypasses; other `admin` checks stay untouched
**Choice**: `workshop-access.guard.ts:10` → `role === 'admin' || role === 'admin_taller'`.
Grep audit of the remaining sites:

| Site | Verdict |
|---|---|
| `permissions.guard.ts:22` | **No change.** `resolvePermissions()` already returns full permissions for `admin_taller` (`users.service.ts:112`); adding it is a cosmetic short-circuit. |
| `appointments.service.ts:252,278,300`, `bodyshop.service.ts:529`, `bodyshop-work-items.service.ts:80` | **No change.** Different semantic — *ownership* override (`admin` or creator may edit). Widening it would silently grant `admin_taller` edit rights over other users' records. Out of scope. |

### Decision: Keep `[] = unrestricted`, normalize `[]` → `null` on write
**Choice**: Guard semantics unchanged (fail-open on empty). `UsersService`
create/update coerce `[]` to `null` so the ambiguous state is unpersistable.
**Alternatives**: make `[]` mean "deny all" — rejected: a behavior flip with
lockout risk, and it contradicts the admin UI's "nothing selected = all".
**Rationale**: One canonical representation kills the footgun without changing
the API contract.

### Decision: Log every denial
**Choice**: `Logger` warn on the 403 with `userId`, `role`, requested
`workshopId`, and allowed-list **count** (never the list or email).
**Rationale**: Enforcement has never fired in production; the first days need
evidence to separate "working as intended" from "locking out real users".

## Data Flow

```
Request ─cookie auth_token─▶ JwtAuthGuard ─▶ JwtStrategy.validate(payload)
                                                │  usersService.findAccessContext(sub)
                                                │      └─ 1 PK lookup on `users`
                                                │  row missing | !active ──▶ 401
                                                ▼
                  request.user = { id, email, role(DB), permissions(JWT),
                                   allowedWorkshopIds(DB) }
                                                │
                                                ▼
        WorkshopAccessGuard: admin|admin_taller ─▶ allow
                             null/[]            ─▶ allow (unrestricted)
                             workshopId absent  ─▶ allow
                             workshopId ∉ list  ─▶ WARN + 403
```

## File Changes

| File | Action | Change |
|---|---|---|
| `apps/api/src/modules/auth/jwt.strategy.ts` | Modify | Inject `UsersService`; `async validate()` reads row; fail closed; hydrate `role` + `allowedWorkshopIds` |
| `apps/api/src/modules/users/users.service.ts` | Modify | `findAccessContext()`; normalize `[]`→`null` in `create()`/`update()` |
| `apps/api/src/common/guards/workshop-access.guard.ts` | Modify | `admin_taller` bypass + denial `Logger.warn` |
| `apps/api/src/modules/auth/auth.module.ts` | **Unchanged** | Already imports `UsersModule`, which exports `UsersService` — zero wiring needed |
| `apps/api/src/__tests__/workshop-access.guard.spec.ts` | Create | New guard suite |
| `apps/api/src/__tests__/jwt.strategy.spec.ts` | Create | Hydration + fail-closed suite |

## Interfaces / Contracts

```ts
// users.service.ts
export type UserAccessContext = {
  id: string; role: UserRole; allowedWorkshopIds: string[] | null; active: boolean;
};
async findAccessContext(id: string): Promise<UserAccessContext | null> {
  return this.repo.findOne({
    where: { id },
    select: ['id', 'role', 'allowedWorkshopIds', 'active'],
  }) as Promise<UserAccessContext | null>;
}

// jwt.strategy.ts
async validate(payload: { sub: string; email: string; role: string; permissions?: any }) {
  const ctx = await this.users.findAccessContext(payload.sub);
  if (!ctx || !ctx.active) throw new UnauthorizedException('Sesión inválida');
  return {
    id: ctx.id,
    email: payload.email,
    role: ctx.role,                            // DB wins over the claim
    permissions: payload.permissions,          // unchanged, known gap
    allowedWorkshopIds: ctx.allowedWorkshopIds,
  };
}
```

Public API contract is **unchanged**: `POST/PATCH /users` still accept
`allowedWorkshopIds: string[] | null`, so `settings/users/page.tsx` needs no edit.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Guard: `admin`/`admin_taller` bypass; `null`/`[]` unrestricted; no `workshopId` → allow; `workshopId` ∉ list → 403 + warn logged | Mirror `permissions.guard.spec.ts` context stub |
| Unit | Strategy: hydrates list; DB role overrides claim; missing row → 401; `active:false` → 401; exactly 1 repo call | Mock `UsersService` |
| Unit | `[]` → `null` normalization on create/update | Extend users service spec |
| Integration | Restricted user gets 403 on the 7 already-guarded routes; revocation applies on next request without re-login | `integration.int.spec.ts` |
| Regression | `tracking.controller.spec.ts` (overrides the guard) stays green | Run unmodified |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file
classification, or process-integration boundary. This is an in-process
authorization guard; its failure modes (fail-closed 401, logged 403) are covered
by the decisions above.

## Migration / Rollout

**No migration, no backfill.** Audit of QAS and PROD found **0 users** with a
restricted `allowedWorkshopIds`, so enabling enforcement cannot lock anyone out
on merge; every existing user resolves to the unrestricted branch. The `[]`→`null`
normalization is write-path only and needs no data fix (no `[]` rows exist).
The admin assignment flow in `settings/users` is untouched and keeps working
against the same DTO. Rollback: revert the PR — the guard returns to its
default-allow no-op.

### PR chain

| PR | Scope | Est. lines |
|---|---|---|
| **1 — security fix** (this design) | strategy hydration, `admin_taller` bypass, denial log, `[]` normalization, 2 new specs | ~180 |
| **2 — controller rollout** | `@UseGuards(WorkshopAccessGuard)` on `appointments`, `budget-appointments`, `operational-blocks`, `bodyshop-catalog`, `bodyshop-capacity`, `technicians` + per-controller tests | ~150 |
| **3 — `GET /workshops` scoping** | `WorkshopsService.findAll(user)` filters by `allowedWorkshopIds`; `findOne` 403s on inaccessible ids | ~80 |

**Frontend needs no PR.** `workshop-switcher.tsx` renders `useWorkshops()`
verbatim and already has a "Sin talleres" empty state, and
`workshop-context.tsx:38` re-resolves a stale stored id to `workshops[0].id`.
Server-side scoping in PR 3 delivers the "hide inaccessible workshops" decision
end to end. The admin assignment picker keeps seeing every workshop because
`users.controller` is `@Roles('admin','admin_taller')` and both bypass.

Each PR is independently shippable and revertable; 2 and 3 both require 1 merged.

## Open Questions

- [ ] Guard reads `workshopId` only from `query`/`body`, never `params` — routes
  like `/x/:workshopId` would silently pass. None exist today on the Part 2 list;
  confirm during PR 2 and extend the guard if one appears.
- [ ] Permission staleness (up to 8h after a role change) is a documented known
  gap, not fixed here. Separate change if it matters.
- [ ] Catalogs (`service-types`, `specialties`, `work-types`) confirmed global —
  no scoping, out of scope for all three PRs.
