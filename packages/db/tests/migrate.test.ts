import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runMigrations, type SqlExecutor } from "../src/migrate";

/** Simulates a schema_migrations table in memory, so this suite can test
 * runMigrations' idempotency logic without a real Postgres/pglite engine. */
function createFakeExecutor(): { executor: SqlExecutor; execCalls: string[] } {
  const applied = new Set<string>();
  const execCalls: string[] = [];

  const executor: SqlExecutor = {
    async exec(sql) {
      execCalls.push(sql);
    },
    async query<T>(sql: string, params?: unknown[]) {
      if (sql.startsWith("select filename")) {
        return { rows: Array.from(applied, (filename) => ({ filename })) as T[] };
      }
      if (sql.startsWith("insert into schema_migrations")) {
        applied.add(params![0] as string);
        return { rows: [] as T[] };
      }
      return { rows: [] as T[] };
    },
  };

  return { executor, execCalls };
}

describe("runMigrations", () => {
  it("모든 마이그레이션 파일을 파일명 순서대로 적용한다", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ipo-migrate-"));
    await writeFile(path.join(dir, "0002_b.sql"), "select 2;");
    await writeFile(path.join(dir, "0001_a.sql"), "select 1;");

    const { executor, execCalls } = createFakeExecutor();
    const applied = await runMigrations(executor, dir);

    expect(applied).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(execCalls).toContain("select 1;");
    expect(execCalls).toContain("select 2;");
  });

  it("이미 적용된 마이그레이션은 다시 실행하지 않는다 (재실행해도 안전해야 한다)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ipo-migrate-"));
    await writeFile(path.join(dir, "0001_a.sql"), "select 1;");

    const { executor } = createFakeExecutor();
    const firstRun = await runMigrations(executor, dir);
    const secondRun = await runMigrations(executor, dir);

    expect(firstRun).toEqual(["0001_a.sql"]);
    expect(secondRun).toEqual([]);
  });

  it("새로 추가된 마이그레이션 파일만 적용한다", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ipo-migrate-"));
    await writeFile(path.join(dir, "0001_a.sql"), "select 1;");

    const { executor } = createFakeExecutor();
    await runMigrations(executor, dir);

    await writeFile(path.join(dir, "0002_b.sql"), "select 2;");
    const secondRun = await runMigrations(executor, dir);

    expect(secondRun).toEqual(["0002_b.sql"]);
  });
});
