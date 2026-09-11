import { can, createProjectRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../lib/auth";
import { withRequestScope } from "../../../../lib/db";
import { getMembership } from "../../../../lib/membership";
import { PROJECT_COLUMNS, toProjectDto, type ProjectRow } from "../../../../lib/projects";
import { apiError, apiOk } from "../../../../lib/api/response";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) {
    return apiError("VALIDATION_ERROR", "organizationId 쿼리 파라미터가 필요합니다.");
  }

  const membership = await getMembership(user.id, organizationId);
  if (!membership) {
    return apiError("FORBIDDEN", "해당 조직에 접근할 권한이 없습니다.");
  }

  const rows = await withRequestScope({ userId: user.id, organizationId }, (client) =>
    client.query<ProjectRow>(
      `select ${PROJECT_COLUMNS} from projects where organization_id = $1 order by created_at desc`,
      [organizationId]
    )
  );

  return apiOk({ projects: rows.rows.map(toProjectDto) });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) {
    return apiError("VALIDATION_ERROR", "organizationId 쿼리 파라미터가 필요합니다.");
  }

  const membership = await getMembership(user.id, organizationId);
  if (!membership || !can(membership.role, "project.create")) {
    return apiError("FORBIDDEN", "프로젝트를 생성할 권한이 없습니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const p = parsed.data;

  try {
    const result = await withRequestScope({ userId: user.id, organizationId }, (client) =>
      client.query<ProjectRow>(
        `insert into projects
           (organization_id, name, company_name_ko, company_name_en, industry, website_url,
            target_market, target_filing_date, lead_underwriter, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning ${PROJECT_COLUMNS}`,
        [
          organizationId,
          p.name,
          p.companyNameKo,
          p.companyNameEn ?? null,
          p.industry,
          p.websiteUrl ?? null,
          p.targetMarket,
          p.targetFilingDate ?? null,
          p.leadUnderwriter ?? null,
          user.id,
        ]
      )
    );
    return apiOk(toProjectDto(result.rows[0]!), { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return apiError("CONFLICT", "동일한 이름의 프로젝트가 이미 존재합니다.");
    }
    throw error;
  }
}
