import { signupRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../lib/auth";
import { withRequestScope } from "../../../../../lib/db";
import { apiError, apiOk } from "../../../../../lib/api/response";

/**
 * Completes signup (US-01/S02 step 2): the client has already created the
 * Supabase Auth user (supabase.auth.signUp), so a session cookie exists by
 * the time this runs. This just provisions the organization and grants the
 * caller OWNER, atomically, via create_organization_with_owner().
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = signupRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", {
      issues: parsed.error.issues,
    });
  }

  const { orgName, displayName } = parsed.data;

  const organizationId = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<{ create_organization_with_owner: string }>(
      "select create_organization_with_owner($1, $2, $3) as create_organization_with_owner",
      [orgName, user.id, displayName]
    );
    return result.rows[0]!.create_organization_with_owner;
  });

  return apiOk({ organizationId, role: "OWNER" as const }, { status: 201 });
}
