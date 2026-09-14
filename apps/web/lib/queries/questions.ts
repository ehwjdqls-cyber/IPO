import "server-only";
import type { EvidenceStatus, ListQuestionsQuery, ReviewStatus } from "@ipo/contracts";
import { withRequestScope } from "../db";
import { QUESTION_COLUMNS, toQuestionDto, type QuestionDto, type QuestionRow } from "../questions";
import {
  ANSWER_VERSION_COLUMNS,
  CLAIM_COLUMNS,
  CITATION_COLUMNS,
  toAnswerVersionDto,
  toClaimDto,
  toCitationDto,
  type AnswerVersionDto,
  type AnswerVersionRow,
  type ClaimRow,
  type CitationRow,
} from "../answer-versions";

export interface QuestionListItemDto extends QuestionDto {
  answerVersionId: string | null;
  evidenceStatus: EvidenceStatus | "UNANSWERED";
  reviewStatus: ReviewStatus | null;
  assigneeDisplayName: string | null;
}

export interface QuestionsKpi {
  total: number;
  unanswered: number;
  needsEvidence: number;
  conflict: number;
  needsReview: number;
  approved: number;
}

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
  evidence_status: EvidenceStatus | null;
  review_status: ReviewStatus | null;
  assignee_display_name: string | null;
}

const LATEST_ANSWERS_CTE = `
  with latest_answers as (
    select distinct on (question_id)
      id, question_id, evidence_status, review_status
    from answer_versions
    order by question_id, version desc
  )
`;

/** Same read path as GET /api/v1/projects/{projectId}/questions -- kept
 * here so the S10 Server Component page can call it directly. */
export async function listQuestionsWithKpi(
  userId: string,
  organizationId: string,
  projectId: string,
  filters: ListQuestionsQuery
): Promise<{ kpi: QuestionsKpi; questions: QuestionListItemDto[] }> {
  const { search, category, priority, evidenceStatus, reviewStatus, assignedTo } = filters;

  return withRequestScope({ userId, organizationId }, async (client) => {
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
       select ${QUESTION_COLUMNS}, la.id as answer_version_id, la.evidence_status, la.review_status,
              p.display_name as assignee_display_name
       from questions q
       left join latest_answers la on la.question_id = q.id
       left join profiles p on p.id = q.assigned_to
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

    return {
      kpi: {
        total: Number(kpi.rows[0]!.total),
        unanswered: Number(kpi.rows[0]!.unanswered),
        needsEvidence: Number(kpi.rows[0]!.needs_evidence),
        conflict: Number(kpi.rows[0]!.conflict),
        needsReview: Number(kpi.rows[0]!.needs_review),
        approved: Number(kpi.rows[0]!.approved),
      },
      questions: list.rows.map((row) => ({
        ...toQuestionDto(row),
        answerVersionId: row.answer_version_id,
        evidenceStatus: row.evidence_status ?? ("UNANSWERED" as const),
        reviewStatus: row.review_status,
        assigneeDisplayName: row.assignee_display_name,
      })),
    };
  });
}

/** S11 왼쪽 패널의 질문 목록/이전·다음 내비게이션용 -- S10과 동일한 기본
 * 정렬(근거 충돌 -> 근거 부족 -> 높은 중요도 -> 최근 생성)을 필터 없이
 * 사용한다. 워크스페이스 진입 시 어떤 필터로 목록에서 왔는지 URL에 남기지
 * 않으므로, 여기서는 프로젝트 전체 질문 순서를 기준으로 이전/다음을
 * 계산한다. */
export async function listQuestionsForWorkspaceNav(
  userId: string,
  organizationId: string,
  projectId: string
): Promise<QuestionListItemDto[]> {
  const { questions } = await listQuestionsWithKpi(userId, organizationId, projectId, {});
  return questions;
}

export interface ClaimWithCitationsDto extends ReturnType<typeof toClaimDto> {
  citations: ReturnType<typeof toCitationDto>[];
}

export interface QuestionWorkspaceData {
  question: QuestionDto;
  answerVersion: (AnswerVersionDto & { claims: ClaimWithCitationsDto[] }) | null;
}

/** Same read path as GET /api/v1/projects/{projectId}/questions/{questionId}
 * -- kept here so the S11 Server Component page can call it directly. */
export async function findQuestionWorkspaceData(
  userId: string,
  organizationId: string,
  questionId: string
): Promise<QuestionWorkspaceData | null> {
  const question = await withRequestScope({ userId }, async (client) => {
    const result = await client.query<QuestionRow>(
      `select ${QUESTION_COLUMNS} from questions where id = $1`,
      [questionId]
    );
    return result.rows[0] ?? null;
  });
  if (!question) return null;

  const detail = await withRequestScope({ userId, organizationId }, async (client) => {
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

  return {
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
  };
}
