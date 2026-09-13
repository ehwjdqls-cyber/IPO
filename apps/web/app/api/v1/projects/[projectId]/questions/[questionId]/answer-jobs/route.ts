import { can, createAnswerJobRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../lib/membership";
import { getIdempotencyKey } from "../../../../../../../../lib/api/idempotency";
import { isUniqueViolation } from "../../../../../../../../lib/api/postgres-errors";
import { apiError, apiOk } from "../../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; questionId: string }> };

interface QuestionRow {
  id: string;
  organization_id: string;
  project_id: string;
  category: string;
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

  const { projectId, questionId } = await params;

  const question = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<QuestionRow>(
      "select id, organization_id, project_id, category from questions where id = $1",
      [questionId]
    );
    return result.rows[0] ?? null;
  });
  if (!question || question.project_id !== projectId) {
    return apiError("NOT_FOUND", "질문을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, question.organization_id);
  if (!membership || !can(membership.role, "job.manage")) {
    return apiError("FORBIDDEN", "답변 생성 작업을 시작할 권한이 없습니다.");
  }

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return apiError("VALIDATION_ERROR", "Idempotency-Key 헤더가 필요합니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createAnswerJobRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const { documentIds, style, maxClaims } = parsed.data;

  const job = await withRequestScope(
    { userId: user.id, organizationId: question.organization_id },
    async (client) => {
      const input = JSON.stringify({
        questionId,
        documentIds: documentIds ?? null,
        category: question.category,
        style,
        maxClaims,
      });

      try {
        const inserted = await client.query<NewJobRow>(
          `insert into jobs (organization_id, project_id, type, idempotency_key, input, created_by)
           values ($1, $2, 'ANSWER_GENERATE', $3, $4, $5)
           returning id, status`,
          [question.organization_id, projectId, idempotencyKey, input, user.id]
        );
        return inserted.rows[0]!;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await client.query<NewJobRow>(
          `select id, status from jobs where organization_id = $1 and idempotency_key = $2`,
          [question.organization_id, idempotencyKey]
        );
        return existing.rows[0]!;
      }
    }
  );

  return apiOk({ id: job.id, status: job.status }, { status: 201 });
}
