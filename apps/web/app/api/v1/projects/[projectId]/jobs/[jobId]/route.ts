import { getAuthenticatedUser } from "../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../lib/db";
import { getMembership } from "../../../../../../../lib/membership";
import { toJobDto, type JobRow } from "../../../../../../../lib/jobs";
import { apiError, apiOk } from "../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; jobId: string }> };

interface JobWithOrgRow extends JobRow {
  organization_id: string;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { jobId } = await params;

  const job = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<JobWithOrgRow>(
      `select id, organization_id, type, status, progress, error_code, error_message,
              started_at, finished_at, created_at
       from jobs where id = $1`,
      [jobId]
    );
    return result.rows[0] ?? null;
  });
  if (!job) {
    return apiError("NOT_FOUND", "작업을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, job.organization_id);
  if (!membership) {
    return apiError("FORBIDDEN", "해당 작업에 접근할 권한이 없습니다.");
  }

  return apiOk(toJobDto(job));
}
