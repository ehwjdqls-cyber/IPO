import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { vector } from "@electric-sql/pglite-pgvector";
import { runMigrations } from "@ipo/db/migrate";

/**
 * Duplicates packages/db/tests/pglite-harness.ts's shape (createTestDb +
 * withScope + asOwner) rather than importing it, since that file lives
 * under packages/db/tests/ (not exported from @ipo/db's public API) and
 * PGlite's transaction API differs from pg.Pool's, so it can't be reused
 * as-is across packages. `runMigrations` itself IS reused from @ipo/db --
 * its default migrationsDir resolves relative to migrate.ts's own file
 * location, so it finds the real packages/db/migrations regardless of
 * which package calls it.
 */
export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto, vector } });
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
