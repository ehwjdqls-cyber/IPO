import { can, updateProjectRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../lib/auth";
import { withRequestScope } from "../../../../../lib/db";
import { getMembership } from "../../../../../lib/membership";
import { PROJECT_COLUMNS, toProjectDto, type ProjectRow } from "../../../../../lib/projects";
import { apiError, apiOk } from "../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Fetches the project scoped only by userId (no organizationId GUC needed):
 * projects_select's RLS policy checks the row's own organization_id via
 * is_active_member(), so a member of the owning org can read it regardless
 * of what org, if any, is set in the session scope. Returns null both when
 * the row doesn't exist and when the caller isn't an active member of its
 * org -- RLS makes those indistinguishable, which is the point (no leak).
 */
async function findProject(userId: string, projectId: string): Promise<ProjectRow | null> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<ProjectRow>(`select ${PROJECT_COLUMNS} from projects where id = $1`, [projectId])
  );
  return result.rows[0] ?? null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { projectId } = await params;
  const project = await findProject(user.id, projectId);
  if (!project) {
    return apiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }

  return apiOk(toProjectDto(project));
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { projectId } = await params;
  const project = await findProject(user.id, projectId);
  if (!project) {
    return apiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, project.organization_id);
  if (!membership || !can(membership.role, "project.update")) {
    return apiError("FORBIDDEN", "프로젝트를 수정할 권한이 없습니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }

  const fieldMap: Record<string, string> = {
    name: "name",
    companyNameKo: "company_name_ko",
    companyNameEn: "company_name_en",
    industry: "industry",
    websiteUrl: "website_url",
    targetMarket: "target_market",
    targetFilingDate: "target_filing_date",
    leadUnderwriter: "lead_underwriter",
    status: "status",
  };
  const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  const setClauses = entries.map(([key], i) => `${fieldMap[key]} = $${i + 2}`);
  const values = entries.map(([, value]) => value);

  const result = await withRequestScope(
    { userId: user.id, organizationId: project.organization_id },
    (client) =>
      client.query<ProjectRow>(
        `update projects set ${setClauses.join(", ")}, updated_at = now()
         where id = $1
         returning ${PROJECT_COLUMNS}`,
        [projectId, ...values]
      )
  );

  if (result.rows.length === 0) {
    return apiError("FORBIDDEN", "프로젝트를 수정할 권한이 없습니다.");
  }

  return apiOk(toProjectDto(result.rows[0]!));
}

/**
 * "DELETE" here is the deletion *request* the endpoint table (spec 19절)
 * describes, not an immediate hard delete: it flips status to DELETING and
 * leaves actual purge/export/audit orchestration to Milestone 4 (spec 41절,
 * "데이터 보존·삭제 orchestration"). ADMIN+ is enforced in the app layer
 * (project.delete) since the DB's projects_update RLS policy alone would
 * allow EDITOR to reach this UPDATE too.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { projectId } = await params;
  const project = await findProject(user.id, projectId);
  if (!project) {
    return apiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, project.organization_id);
  if (!membership || !can(membership.role, "project.delete")) {
    return apiError("FORBIDDEN", "프로젝트를 삭제할 권한이 없습니다.");
  }

  const result = await withRequestScope(
    { userId: user.id, organizationId: project.organization_id },
    (client) =>
      client.query<ProjectRow>(
        `update projects set status = 'DELETING', updated_at = now()
         where id = $1
         returning ${PROJECT_COLUMNS}`,
        [projectId]
      )
  );

  if (result.rows.length === 0) {
    return apiError("FORBIDDEN", "프로젝트를 삭제할 권한이 없습니다.");
  }

  return apiOk(toProjectDto(result.rows[0]!));
}
