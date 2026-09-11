import pg from "pg";
import { runMigrations } from "./migrate";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    async function query<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<{ rows: T[] }> {
      const result = await client.query(sql, params);
      return { rows: result.rows as T[] };
    }

    const files = await runMigrations({
      exec: (sql: string) => client.query(sql),
      query,
    });
    if (files.length === 0) {
      console.log("No new migrations to apply.");
    } else {
      console.log(`Applied ${files.length} migration(s): ${files.join(", ")}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
