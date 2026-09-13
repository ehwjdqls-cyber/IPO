import { can, createQuestionJobRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../lib/db";
import { getMembership } from "../../../../../../lib/membership";
import { findProjectById } from "../../../../../../lib/queries/projects";
import { getIdempotencyKey } from "../../../../../../lib/api/idempotency";
import { isUniqueViolation } from "../../../../../../lib/api/postgres-errors";
import { apiError, apiOk } from "../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string }> };

interface NewJobRow {
  id: string;
  status: string;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { projectId } = await params;
  const project = await findProjectById(user.id, projectId);
  if (!project) {
    return apiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, project.organizationId);
  if (!membership || !can(membership.role, "job.manage")) {
    return apiError("FORBIDDEN", "질문 생성 작업을 시작할 권한이 없습니다.");
  }

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return apiError("VALIDATION_ERROR", "Idempotency-Key 헤더가 필요합니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createQuestionJobRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const { documentIds, categories, questionCount, depth } = parsed.data;

  const job = await withRequestScope(
    { userId: user.id, organizationId: project.organizationId },
    async (client) => {
      let resolvedDocumentIds: string[];
      if (documentIds && documentIds.length > 0) {
        const found = await client.query<{ id: string }>(
          `select id from documents
           where project_id = $1 and status = 'READY' and deleted_at is null and id = any($2::uuid[])`,
          [projectId, documentIds]
        );
        if (found.rows.length !== documentIds.length) {
          return { kind: "invalid-documents" as const };
        }
        resolvedDocumentIds = found.rows.map((r) => r.id);
      } else {
        const ready = await client.query<{ id: string }>(
          `select id from documents where project_id = $1 and status = 'READY' and deleted_at is null`,
          [projectId]
        );
        if (ready.rows.length === 0) {
          return { kind: "no-ready-documents" as const };
        }
        resolvedDocumentIds = ready.rows.map((r) => r.id);
      }

      const input = JSON.stringify({
        documentIds: resolvedDocumentIds,
        categories,
        questionCount,
        depth,
      });

      try {
        const inserted = await client.query<NewJobRow>(
          `insert into jobs (organization_id, project_id, type, idempotency_key, input, created_by)
           values ($1, $2, 'QUESTION_GENERATE', $3, $4, $5)
           returning id, status`,
          [project.organizationId, projectId, idempotencyKey, input, user.id]
        );
        return { kind: "created" as const, job: inserted.rows[0]! };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await client.query<NewJobRow>(
          `select id, status from jobs where organization_id = $1 and idempotency_key = $2`,
          [project.organizationId, idempotencyKey]
        );
        return { kind: "created" as const, job: existing.rows[0]! };
      }
    }
  );

  if (job.kind === "invalid-documents") {
    return apiError("VALIDATION_ERROR", "지정한 문서 중 준비되지 않았거나 존재하지 않는 문서가 있습니다.");
  }
  if (job.kind === "no-ready-documents") {
    return apiError("VALIDATION_ERROR", "준비된(READY) 문서가 없습니다.");
  }

  return apiOk({ id: job.job.id, status: job.job.status }, { status: 201 });
}
