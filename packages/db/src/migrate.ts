import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface SqlExecutor {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "..", "migrations");

export async function listMigrationFiles(migrationsDir: string = MIGRATIONS_DIR): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  return entries.filter((f) => f.endsWith(".sql")).sort();
}

/**
 * Applies every migration file not yet recorded in `schema_migrations`, in
 * filename order, and returns the ones newly applied. Idempotent by design:
 * safe to run repeatedly against the same long-lived database (a real
 * Supabase project, for instance), unlike a plain "run every .sql file"
 * script, which would fail on the second run with "relation already
 * exists". `tests/pglite-harness.ts` still gets a from-scratch DB per test,
 * so this only matters there in that it makes the same executor contract
 * work for both ephemeral and persistent targets.
 */
export async function runMigrations(
  executor: SqlExecutor,
  migrationsDir: string = MIGRATIONS_DIR
): Promise<string[]> {
  await executor.exec(
    `create table if not exists schema_migrations (
       filename text primary key,
       applied_at timestamptz not null default now()
     )`
  );

  const applied = await executor.query<{ filename: string }>("select filename from schema_migrations");
  const appliedFiles = new Set(applied.rows.map((row) => row.filename));

  const files = await listMigrationFiles(migrationsDir);
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (appliedFiles.has(file)) {
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf-8");
    await executor.exec(sql);
    await executor.query("insert into schema_migrations (filename) values ($1)", [file]);
    newlyApplied.push(file);
  }
  return newlyApplied;
}
