import { listQuestionsQuerySchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../lib/db";
import { getMembership } from "../../../../../../lib/membership";
import { findProjectById } from "../../../../../../lib/queries/projects";
import { QUESTION_COLUMNS, toQuestionDto, type QuestionRow } from "../../../../../../lib/questions";
import { apiError, apiOk } from "../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string }> };

interface KpiRow {
  total: string;
  unanswered: string;
  needs_evidence: string;
  conflict: string;
  needs_review: string;
  approved: string;
}

interface ListRow extends QuestionRow {
  answer_version_id: string | null;
  evidence_status: "SUPPORTED" | "PARTIAL" | "NEEDS_EVIDENCE" | "CONFLICT" | null;
  review_status: "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED" | null;
}

const LATEST_ANSWERS_CTE = `
  with latest_answers as (
    select distinct on (question_id)
      id, question_id, evidence_status, review_status
    from answer_versions
    order by question_id, version desc
  )
`;

export async function GET(request: Request, { params }: RouteContext) {
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
  if (!membership) {
    return apiError("FORBIDDEN", "해당 프로젝트에 접근할 권한이 없습니다.");
  }

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const parsed = listQuestionsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const { search, category, priority, evidenceStatus, reviewStatus, assignedTo } = parsed.data;

  const result = await withRequestScope(
    { userId: user.id, organizationId: project.organizationId },
    async (client) => {
      const kpi = await client.query<KpiRow>(
        `${LATEST_ANSWERS_CTE}
         select
           count(*) as total,
           count(*) filter (where la.id is null) as unanswered,
           count(*) filter (where la.evidence_status = 'NEEDS_EVIDENCE') as needs_evidence,
           count(*) filter (where la.evidence_status = 'CONFLICT') as conflict,
           count(*) filter (where la.review_status = 'NEEDS_REVIEW') as needs_review,
           count(*) filter (where la.review_status = 'APPROVED') as approved
         from questions q
         left join latest_answers la on la.question_id = q.id
         where q.project_id = $1`,
        [projectId]
      );

      const conditions: string[] = ["q.project_id = $1"];
      const values: unknown[] = [projectId];

      if (search) {
        values.push(`%${search}%`);
        conditions.push(`q.question_text ilike $${values.length}`);
      }
      if (category) {
        values.push(category);
        conditions.push(`q.category = $${values.length}`);
      }
      if (priority) {
        values.push(priority);
        conditions.push(`q.priority = $${values.length}`);
      }
      if (assignedTo) {
        values.push(assignedTo);
        conditions.push(`q.assigned_to = $${values.length}`);
      }
      if (evidenceStatus === "UNANSWERED") {
        conditions.push(`la.id is null`);
      } else if (evidenceStatus) {
        values.push(evidenceStatus);
        conditions.push(`la.evidence_status = $${values.length}`);
      }
      if (reviewStatus) {
        values.push(reviewStatus);
        conditions.push(`la.review_status = $${values.length}`);
      }

      const list = await client.query<ListRow>(
        `${LATEST_ANSWERS_CTE}
         select ${QUESTION_COLUMNS}, la.id as answer_version_id, la.evidence_status, la.review_status
         from questions q
         left join latest_answers la on la.question_id = q.id
         where ${conditions.join(" and ")}
         order by
           case when la.evidence_status = 'CONFLICT' then 0
                when la.evidence_status = 'NEEDS_EVIDENCE' then 1
                else 2 end,
           case q.priority
             when 'CRITICAL' then 0
             when 'HIGH' then 1
             when 'MEDIUM' then 2
             else 3 end,
           q.created_at desc`,
        values
      );

      return { kpi: kpi.rows[0]!, list: list.rows };
    }
  );

  return apiOk({
    kpi: {
      total: Number(result.kpi.total),
      unanswered: Number(result.kpi.unanswered),
      needsEvidence: Number(result.kpi.needs_evidence),
      conflict: Number(result.kpi.conflict),
      needsReview: Number(result.kpi.needs_review),
      approved: Number(result.kpi.approved),
    },
    questions: result.list.map((row) => ({
      ...toQuestionDto(row),
      answerVersionId: row.answer_version_id,
      evidenceStatus: row.evidence_status ?? "UNANSWERED",
      reviewStatus: row.review_status,
    })),
  });
}
