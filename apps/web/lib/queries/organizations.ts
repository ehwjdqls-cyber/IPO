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

export interface OrgMember {
  userId: string;
  displayName: string;
  role: MemberRole;
}

/** S10 대량행동(담당자 지정)의 담당자 선택 목록용. */
export async function listActiveOrgMembers(
  userId: string,
  organizationId: string
): Promise<OrgMember[]> {
  const result = await withRequestScope({ userId, organizationId }, (client) =>
    client.query<{ user_id: string; display_name: string; role: MemberRole }>(
      `select m.user_id, p.display_name, m.role
       from organization_members m
       join profiles p on p.id = m.user_id
       where m.organization_id = $1 and m.status = 'ACTIVE'
       order by p.display_name asc`,
      [organizationId]
    )
  );
  return result.rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, role: r.role }));
}
