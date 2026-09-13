import pg from "pg";
import "./pg-types";

const { Pool } = pg;

export interface RequestScope {
  userId: string;
  organizationId?: string;
}

let servicePool: pg.Pool | undefined;

/**
 * Pool connected as the migration owner role. Bypasses RLS (table owner
 * privilege) -- reserved for migrations and background workers that must
 * operate across tenants, never for request-scoped reads/writes.
 */
export function createServiceClient(databaseUrl: string): pg.Pool {
  if (!servicePool) {
    servicePool = new Pool({ connectionString: databaseUrl });
  }
  return servicePool;
}

/**
 * Runs `fn` inside a transaction as the `app_user` role with the given
 * request scope applied via `set local` GUCs, so every query `fn` issues is
 * subject to the RLS policies in migrations/0006_rls_policies.sql. This is
 * the only way API Route Handlers should touch tenant data (packages/db
 * README documents the RLS + RBAC double-check this implements).
 */
export async function withScope<T>(
  pool: pg.Pool,
  scope: RequestScope,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role app_user");
    await client.query("select set_config('app.current_user_id', $1, true)", [scope.userId]);
    await client.query("select set_config('app.current_org_id', $1, true)", [
      scope.organizationId ?? "",
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
