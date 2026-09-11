import "server-only";
import { createServiceClient, withScope, type RequestScope } from "@ipo/db";
import type pg from "pg";
import { getServerEnv } from "./env";

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    pool = createServiceClient(getServerEnv().DATABASE_URL);
  }
  return pool;
}

/**
 * Runs `fn` as the RLS-scoped `app_user` role for the given request scope.
 * The only sanctioned way for Route Handlers to touch tenant tables -- see
 * packages/db/README.md.
 */
export function withRequestScope<T>(
  scope: RequestScope,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  return withScope(getPool(), scope, fn);
}
