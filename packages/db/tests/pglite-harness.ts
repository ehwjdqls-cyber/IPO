import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { runMigrations } from "../src/migrate";

export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await runMigrations({
    exec: (sql: string) => db.exec(sql),
    query: (sql: string, params?: unknown[]) => db.query(sql, params as never[] | undefined),
  });
  return db;
}

export interface RequestScope {
  userId?: string;
  organizationId?: string;
}

/**
 * Mirrors packages/db/src/client.ts#withScope but against a PGlite instance,
 * so RLS test cases exercise the exact same role-switch + GUC pattern the
 * production `pg.Pool`-based withScope uses.
 */
export async function withScope<T>(
  db: PGlite,
  scope: RequestScope,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role app_user");
    await tx.query("select set_config('app.current_user_id', $1, true)", [scope.userId ?? ""]);
    await tx.query("select set_config('app.current_org_id', $1, true)", [
      scope.organizationId ?? "",
    ]);
    return fn(tx);
  });
}

/** Runs as the (superuser) migration owner, bypassing RLS -- for test seeding only. */
export async function asOwner<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
}
