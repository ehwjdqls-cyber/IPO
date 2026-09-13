import { can, updateQuestionRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../lib/db";
import { getMembership } from "../../../../../../../lib/membership";
import {
  QUESTION_COLUMNS,
  toQuestionDto,
  type QuestionRow,
} from "../../../../../../../lib/questions";
import {
  ANSWER_VERSION_COLUMNS,
  CLAIM_COLUMNS,
  CITATION_COLUMNS,
  toAnswerVersionDto,
  toClaimDto,
  toCitationDto,
  type AnswerVersionRow,
  type ClaimRow,
  type CitationRow,
} from "../../../../../../../lib/answer-versions";
import { apiError, apiOk } from "../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; questionId: string }> };

async function findQuestion(userId: string, questionId: string): Promise<QuestionRow | null> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<QuestionRow>(`select ${QUESTION_COLUMNS} from questions where id = $1`, [
      questionId,
    ])
  );
  return result.rows[0] ?? null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { projectId, questionId } = await params;
  const question = await findQuestion(user.id, questionId);
  if (!question || question.project_id !== projectId) {
    return apiError("NOT_FOUND", "질문을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, question.organization_id);
  if (!membership) {
    return apiError("FORBIDDEN", "해당 질문에 접근할 권한이 없습니다.");
  }

  const detail = await withRequestScope({ userId: user.id, organizationId: question.organization_id }, async (client) => {
    const latestAnswer = await client.query<AnswerVersionRow>(
      `select ${ANSWER_VERSION_COLUMNS} from answer_versions
       where question_id = $1
       order by version desc
       limit 1`,
      [questionId]
    );
    const answerVersion = latestAnswer.rows[0] ?? null;
    if (!answerVersion) {
      return { answerVersion: null, claims: [] as ClaimRow[], citations: [] as CitationRow[] };
    }

    const claims = await client.query<ClaimRow>(
      `select ${CLAIM_COLUMNS} from claims where answer_version_id = $1 order by claim_index`,
      [answerVersion.id]
    );
    const claimIds = claims.rows.map((c) => c.id);
    const citations =
      claimIds.length === 0
        ? { rows: [] as CitationRow[] }
        : await client.query<CitationRow>(
            `select ${CITATION_COLUMNS} from citations where claim_id = any($1::uuid[])`,
            [claimIds]
          );

    return { answerVersion, claims: claims.rows, citations: citations.rows };
  });

  const citationsByClaimId = new Map<string, CitationRow[]>();
  for (const citation of detail.citations) {
    const list = citationsByClaimId.get(citation.claim_id) ?? [];
    list.push(citation);
    citationsByClaimId.set(citation.claim_id, list);
  }

  return apiOk({
    question: toQuestionDto(question),
    answerVersion: detail.answerVersion
      ? {
          ...toAnswerVersionDto(detail.answerVersion),
          claims: detail.claims.map((claim) => ({
            ...toClaimDto(claim),
            citations: (citationsByClaimId.get(claim.id) ?? []).map(toCitationDto),
          })),
        }
      : null,
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { projectId, questionId } = await params;
  const question = await findQuestion(user.id, questionId);
  if (!question || question.project_id !== projectId) {
    return apiError("NOT_FOUND", "질문을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, question.organization_id);
  if (!membership || !can(membership.role, "job.manage")) {
    return apiError("FORBIDDEN", "질문을 수정할 권한이 없습니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = updateQuestionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const { assignedTo, priority } = parsed.data;

  const sets: string[] = [];
  const values: unknown[] = [];
  if (assignedTo !== undefined) {
    values.push(assignedTo);
    sets.push(`assigned_to = $${values.length}`);
  }
  if (priority !== undefined) {
    values.push(priority);
    sets.push(`priority = $${values.length}`);
  }
  values.push(questionId);

  const updated = await withRequestScope(
    { userId: user.id, organizationId: question.organization_id },
    (client) =>
      client.query<QuestionRow>(
        `update questions set ${sets.join(", ")}, updated_at = now()
         where id = $${values.length}
         returning ${QUESTION_COLUMNS}`,
        values
      )
  );

  return apiOk(toQuestionDto(updated.rows[0]!));
}
