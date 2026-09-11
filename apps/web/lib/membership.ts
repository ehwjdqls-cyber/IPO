import "server-only";
import type { MemberRole } from "@ipo/contracts";
import { withRequestScope } from "./db";

/**
 * Looks up the caller's ACTIVE role in an organization. Scoped by userId
 * only (no organizationId GUC needed) because organization_members' RLS
 * policy checks each row's own organization_id, not a session-wide GUC --
 * see packages/db/migrations/0006_rls_policies.sql.
 */
export async function getMembership(
  userId: string,
  organizationId: string
): Promise<{ role: MemberRole } | null> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<{ role: MemberRole }>(
      `select role from organization_members
       where organization_id = $1 and user_id = $2 and status = 'ACTIVE'`,
      [organizationId, userId]
    )
  );
  return result.rows[0] ?? null;
}
