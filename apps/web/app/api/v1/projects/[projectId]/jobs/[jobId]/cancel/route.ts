import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../lib/membership";
import { apiError, apiOk } from "../../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; jobId: string }> };

interface JobStatusRow {
  id: string;
  organization_id: string;
  status: string;
}

const CANCELLABLE_STATUSES = new Set(["QUEUED", "RUNNING"]);

export async function POST(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { jobId } = await params;

  const job = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<JobStatusRow>(
      "select id, organization_id, status from jobs where id = $1",
      [jobId]
    );
    return result.rows[0] ?? null;
  });
  if (!job) {
    return apiError("NOT_FOUND", "작업을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, job.organization_id);
  if (!membership || !can(membership.role, "job.manage")) {
    return apiError("FORBIDDEN", "작업을 취소할 권한이 없습니다.");
  }

  if (!CANCELLABLE_STATUSES.has(job.status)) {
    return apiError("CONFLICT", "대기 중이거나 진행 중인 작업만 취소할 수 있습니다.");
  }

  const updated = await withRequestScope(
    { userId: user.id, organizationId: job.organization_id },
    async (client) => {
      const result = await client.query<JobStatusRow>(
        `update jobs set status = 'CANCELLED', finished_at = now()
         where id = $1
         returning id, organization_id, status`,
        [jobId]
      );
      return result.rows[0] ?? null;
    }
  );
  if (!updated) {
    return apiError("FORBIDDEN", "작업을 취소할 권한이 없습니다.");
  }

  return apiOk({ id: updated.id, status: updated.status });
}
