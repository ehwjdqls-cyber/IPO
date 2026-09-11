import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface SqlExecutor {
  exec(sql: string): Promise<unknown>;
}

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "..", "migrations");

export async function listMigrationFiles(migrationsDir: string = MIGRATIONS_DIR): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  return entries.filter((f) => f.endsWith(".sql")).sort();
}

export async function runMigrations(
  executor: SqlExecutor,
  migrationsDir: string = MIGRATIONS_DIR
): Promise<string[]> {
  const files = await listMigrationFiles(migrationsDir);
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf-8");
    await executor.exec(sql);
  }
  return files;
}
