import { createCitationFeedbackRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../lib/db";
import { getMembership } from "../../../../../../lib/membership";
import { apiError, apiOk } from "../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ citationId: string }> };

interface CitationJoinRow {
  id: string;
  organization_id: string;
}

interface CitationFeedbackRow {
  id: string;
  feedback: "ACCURATE" | "INACCURATE" | "INSUFFICIENT";
  comment: string | null;
  created_at: string;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { citationId } = await params;

  const citation = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<CitationJoinRow>(
      `select c.id, q.organization_id
       from citations c
       join claims cl on cl.id = c.claim_id
       join answer_versions av on av.id = cl.answer_version_id
       join questions q on q.id = av.question_id
       where c.id = $1`,
      [citationId]
    );
    return result.rows[0] ?? null;
  });
  if (!citation) {
    return apiError("NOT_FOUND", "인용을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, citation.organization_id);
  if (!membership) {
    return apiError("FORBIDDEN", "해당 인용에 접근할 권한이 없습니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createCitationFeedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const { feedback, comment } = parsed.data;

  const inserted = await withRequestScope(
    { userId: user.id, organizationId: citation.organization_id },
    (client) =>
      client.query<CitationFeedbackRow>(
        `insert into citation_feedback (citation_id, user_id, feedback, comment)
         values ($1, $2, $3, $4)
         returning id, feedback, comment, created_at`,
        [citationId, user.id, feedback, comment ?? null]
      )
  );

  const row = inserted.rows[0]!;
  return apiOk(
    { id: row.id, feedback: row.feedback, comment: row.comment, createdAt: row.created_at },
    { status: 201 }
  );
}
