# @ipo/db

SQL migrations, DB clients, and RLS/RBAC tests for IPO Proof.

## Migrations

Plain, numbered `.sql` files in `migrations/`, applied in filename order by
`src/migrate.ts`. No down-migrations in Milestone 1 (forward-only, per the
spec's expand→migrate→contract production rollout strategy in section 37).

## Two DB clients (`src/client.ts`)

- `createServiceClient()` — connects as the migration owner role. Owns the
  tables, so it bypasses RLS. Reserved for migrations and background workers
  that must legitimately operate across tenants. Never used by request-time
  API code.
- `withScope(pool, { userId, organizationId }, fn)` — runs `fn` inside a
  transaction as the non-owner `app_user` role, with `app.current_user_id`
  and `app.current_org_id` set via `set local`. Every table's RLS policies
  (see `migrations/0006_rls_policies.sql`) key off those two GUCs. This is
  the only way `/api/v1/*` Route Handlers should touch tenant data — it
  double-enforces the tenant/role checks already done by `@ipo/contracts`'
  RBAC matrix (defense in depth, per spec section 30).

The Auth provider is deliberately not baked into the DB layer: whichever
provider verifies the session (Supabase Auth today), the API sets
`app.current_user_id` from the verified session before running any query.

## Known RLS pitfall: self-referential policies

`organization_members`' own SELECT policy depends on `is_active_member()`
and `has_min_role()`. If those helper functions queried
`organization_members` as the calling role, that inner query would itself be
subject to the very policy being evaluated — an unresolvable circular check
that always evaluates false. Both helpers (and `shares_active_org()`, used by
`profiles`' policy) are declared `SECURITY DEFINER` to break the cycle. They
only ever return a boolean, never row data, so this cannot leak another
tenant's rows. See the comments in `migrations/0006_rls_policies.sql`.

## Testing without Docker (`tests/pglite-harness.ts`)

No Docker/Postgres was available in the development environment this
Milestone was built in, so `tests/rls.integration.test.ts` runs against
[`@electric-sql/pglite`](https://pglite.dev) — a real Postgres compiled to
WASM, not a mock. `withScope()` in the harness mirrors the production
`pg.Pool`-based `withScope()` in `src/client.ts` exactly (same
`set local role` + GUC pattern), so the RLS policies under test are the same
SQL running the same way. CI (`.github/workflows/ci.yml`) additionally runs
`pnpm db:migrate:test` (`src/migrate-cli.ts`) against a real
`pgvector/pgvector:pg17-trixie` service container, to catch anything pglite's
WASM build might not reproduce exactly.
