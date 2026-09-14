import { createReviewRequestSchema, type MemberRole } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../lib/db";
import { getMembership } from "../../../../../../lib/membership";
import { apiError, apiOk } from "../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ answerVersionId: string }> };

interface AnswerVersionJoinRow {
  id: string;
  organization_id: string;
  review_status: "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED";
}

interface ReviewRow {
  id: string;
  decision: "APPROVED" | "REJECTED";
  comment: string | null;
  created_at: string;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { answerVersionId } = await params;

  const answerVersion = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<AnswerVersionJoinRow>(
      `select av.id, q.organization_id, av.review_status
       from answer_versions av
       join questions q on q.id = av.question_id
       where av.id = $1`,
      [answerVersionId]
    );
    return result.rows[0] ?? null;
  });
  if (!answerVersion) {
    return apiError("NOT_FOUND", "답변 버전을 찾을 수 없습니다.");
  }

  const REVIEWER_OR_ABOVE: ReadonlySet<MemberRole> = new Set(["REVIEWER", "ADMIN", "OWNER"]);
  const membership = await getMembership(user.id, answerVersion.organization_id);
  if (!membership || !REVIEWER_OR_ABOVE.has(membership.role)) {
    return apiError("FORBIDDEN", "답변을 승인·반려할 권한이 없습니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createReviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const { decision, comment } = parsed.data;

  if (answerVersion.review_status !== "NEEDS_REVIEW") {
    return apiError("CONFLICT", "검토 대기 중인 답변이 아닙니다.");
  }

  const scope = { userId: user.id, organizationId: answerVersion.organization_id };
  const result = await withRequestScope(scope, async (client) => {
    // review_status를 조건절에 넣어 원자적으로 갱신한다 -- 위의
    // answerVersion.review_status 체크와 이 UPDATE 사이에 다른 REVIEWER의
    // 요청이 끼어들 수 있으므로(TOCTOU), affected row 0건을 "이미 처리됨"
    // 신호로 삼아 reviews row 중복 기록을 막는다.
    const updated = await client.query<{ id: string; review_status: string }>(
      `update answer_versions set review_status = $1
       where id = $2 and review_status = 'NEEDS_REVIEW'
       returning id, review_status`,
      [decision, answerVersionId]
    );
    if (updated.rows.length === 0) {
      return { kind: "conflict" as const };
    }

    const reviewInsert = await client.query<ReviewRow>(
      `insert into reviews (answer_version_id, reviewer_id, decision, comment)
       values ($1, $2, $3, $4)
       returning id, decision, comment, created_at`,
      [answerVersionId, user.id, decision, comment ?? null]
    );
    return { kind: "created" as const, review: reviewInsert.rows[0]!, answerVersion: updated.rows[0]! };
  });

  if (result.kind === "conflict") {
    return apiError("CONFLICT", "검토 대기 중인 답변이 아닙니다.");
  }

  return apiOk(
    {
      review: {
        id: result.review.id,
        decision: result.review.decision,
        comment: result.review.comment,
        createdAt: result.review.created_at,
      },
      reviewStatus: result.answerVersion.review_status,
    },
    { status: 201 }
  );
}
