import type { MemberRole } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../lib/auth";
import { withRequestScope } from "../../../../lib/db";
import { apiError, apiOk } from "../../../../lib/api/response";

interface MembershipRow {
  organization_id: string;
  organization_name: string;
  role: MemberRole;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const memberships = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<MembershipRow>(
      `select o.id as organization_id, o.name as organization_name, m.role
       from organization_members m
       join organizations o on o.id = m.organization_id
       where m.user_id = $1 and m.status = 'ACTIVE'
       order by m.created_at asc`,
      [user.id]
    );
    return result.rows;
  });

  return apiOk({
    user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
    organizations: memberships.map((m: MembershipRow) => ({
      id: m.organization_id,
      name: m.organization_name,
      role: m.role,
    })),
  });
}
