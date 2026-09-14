import { can } from "@ipo/contracts";
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

export async function POST(_request: Request, { params }: RouteContext) {
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

  const membership = await getMembership(user.id, answerVersion.organization_id);
  if (!membership || !can(membership.role, "job.manage")) {
    return apiError("FORBIDDEN", "검토를 요청할 권한이 없습니다.");
  }

  if (answerVersion.review_status !== "DRAFT" && answerVersion.review_status !== "REJECTED") {
    return apiError("CONFLICT", "이미 검토 대기 중이거나 승인된 답변입니다.");
  }

  // review_status를 조건절에 넣어 원자적으로 갱신한다 -- 위의 사전 체크와
  // 이 UPDATE 사이에 다른 요청(REVIEWER의 승인/반려 등)이 끼어들 수
  // 있으므로(TOCTOU), affected row 0건이면 그 사이 상태가 바뀐 것으로 보고
  // 409를 반환한다.
  const updated = await withRequestScope(
    { userId: user.id, organizationId: answerVersion.organization_id },
    (client) =>
      client.query<{ id: string; review_status: string }>(
        `update answer_versions set review_status = 'NEEDS_REVIEW'
         where id = $1 and review_status in ('DRAFT', 'REJECTED')
         returning id, review_status`,
        [answerVersionId]
      )
  );
  if (updated.rows.length === 0) {
    return apiError("CONFLICT", "이미 검토 대기 중이거나 승인된 답변입니다.");
  }

  return apiOk({ id: updated.rows[0]!.id, reviewStatus: updated.rows[0]!.review_status });
}
