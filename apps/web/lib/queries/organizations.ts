import "server-only";
import type { MemberRole } from "@ipo/contracts";
import { withRequestScope } from "../db";

export interface OrganizationMembership {
  id: string;
  name: string;
  role: MemberRole;
}

/** Mirrors the query behind GET /api/v1/me -- shared so Server Components
 * don't need to self-fetch the API route over HTTP. */
export async function listMemberships(userId: string): Promise<OrganizationMembership[]> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<{ organization_id: string; organization_name: string; role: MemberRole }>(
      `select o.id as organization_id, o.name as organization_name, m.role
       from organization_members m
       join organizations o on o.id = m.organization_id
       where m.user_id = $1 and m.status = 'ACTIVE'
       order by m.created_at asc`,
      [userId]
    )
  );
  return result.rows.map((r) => ({ id: r.organization_id, name: r.organization_name, role: r.role }));
}
