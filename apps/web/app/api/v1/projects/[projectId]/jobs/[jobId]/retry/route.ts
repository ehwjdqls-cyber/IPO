import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../lib/membership";
import { apiError, apiOk } from "../../../../../../../../lib/api/response";
import { getIdempotencyKey } from "../../../../../../../../lib/api/idempotency";
import { isUniqueViolation } from "../../../../../../../../lib/api/postgres-errors";

type RouteContext = { params: Promise<{ projectId: string; jobId: string }> };

interface JobRetrySourceRow {
  id: string;
  organization_id: string;
  project_id: string;
  type: string;
  status: string;
  input: Record<string, unknown>;
}

interface NewJobRow {
  id: string;
  status: string;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { jobId } = await params;

  const job = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<JobRetrySourceRow>(
      "select id, organization_id, project_id, type, status, input from jobs where id = $1",
      [jobId]
    );
    return result.rows[0] ?? null;
  });
  if (!job) {
    return apiError("NOT_FOUND", "작업을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, job.organization_id);
  if (!membership || !can(membership.role, "job.manage")) {
    return apiError("FORBIDDEN", "작업을 재시도할 권한이 없습니다.");
  }

  if (job.status !== "FAILED") {
    return apiError("CONFLICT", "실패한 작업만 재시도할 수 있습니다.");
  }

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return apiError("VALIDATION_ERROR", "Idempotency-Key 헤더가 필요합니다.");
  }

  const newJob = await withRequestScope(
    { userId: user.id, organizationId: job.organization_id },
    async (client) => {
      try {
        const result = await client.query<NewJobRow>(
          `insert into jobs (organization_id, project_id, type, idempotency_key, input, created_by)
           values ($1, $2, $3, $4, $5, $6)
           returning id, status`,
          [job.organization_id, job.project_id, job.type, idempotencyKey, JSON.stringify(job.input), user.id]
        );
        return result.rows[0]!;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await client.query<NewJobRow>(
          `select id, status from jobs where organization_id = $1 and idempotency_key = $2`,
          [job.organization_id, idempotencyKey]
        );
        return existing.rows[0]!;
      }
    }
  );

  return apiOk({ id: newJob.id, status: newJob.status });
}
