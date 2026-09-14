import { can, createAnswerVersionRequestSchema, type AnswerVersionClaimInput } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../lib/membership";
import { QUESTION_COLUMNS, type QuestionRow } from "../../../../../../../../lib/questions";
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
} from "../../../../../../../../lib/answer-versions";
import { apiError, apiOk } from "../../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; questionId: string }> };

type EvidenceStatus = "SUPPORTED" | "PARTIAL" | "NEEDS_EVIDENCE" | "CONFLICT";

const EVIDENCE_STATUS_SEVERITY: Record<EvidenceStatus, number> = {
  SUPPORTED: 0,
  PARTIAL: 1,
  NEEDS_EVIDENCE: 2,
  CONFLICT: 3,
};

function deriveClaimEvidenceStatus(
  claim: AnswerVersionClaimInput,
  citations: CitationRow[]
): EvidenceStatus {
  if (!claim.isFactual) return "SUPPORTED";
  if (citations.length === 0) return "NEEDS_EVIDENCE";
  if (citations.some((c) => c.verdict === "CONFLICTS")) return "CONFLICT";
  if (citations.some((c) => c.verdict === "PARTIAL")) return "PARTIAL";
  return "SUPPORTED";
}

function worstStatus(statuses: EvidenceStatus[]): EvidenceStatus {
  let worst: EvidenceStatus = "SUPPORTED";
  for (const status of statuses) {
    if (EVIDENCE_STATUS_SEVERITY[status] > EVIDENCE_STATUS_SEVERITY[worst]) worst = status;
  }
  return worst;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { projectId, questionId } = await params;

  const question = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<QuestionRow>(
      `select ${QUESTION_COLUMNS} from questions where id = $1`,
      [questionId]
    );
    return result.rows[0] ?? null;
  });
  if (!question || question.project_id !== projectId) {
    return apiError("NOT_FOUND", "질문을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, question.organization_id);
  if (!membership || !can(membership.role, "job.manage")) {
    return apiError("FORBIDDEN", "답변을 저장할 권한이 없습니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createAnswerVersionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const { baseVersion, bodyMarkdown, claims: claimInputs } = parsed.data;

  const scope = { userId: user.id, organizationId: question.organization_id };

  const result = await withRequestScope(scope, async (client) => {
    const latest = await client.query<{ max: string | null }>(
      `select max(version) as max from answer_versions where question_id = $1`,
      [questionId]
    );
    const latestVersion = Number(latest.rows[0]?.max ?? 0);
    if (latestVersion !== baseVersion) {
      return { kind: "conflict" as const, latestVersion };
    }

    const citationIds = [...new Set(claimInputs.flatMap((c) => c.citationIds))];
    const existingCitations =
      citationIds.length === 0
        ? { rows: [] as CitationRow[] }
        : await client.query<CitationRow>(
            `select ${CITATION_COLUMNS} from citations c
             where c.id = any($1::uuid[])
               and exists (
                 select 1 from claims cl
                 join answer_versions av on av.id = cl.answer_version_id
                 where cl.id = c.claim_id and av.question_id = $2
               )`,
            [citationIds, questionId]
          );
    const citationById = new Map(existingCitations.rows.map((c) => [c.id, c]));
    for (const id of citationIds) {
      if (!citationById.has(id)) {
        return { kind: "invalid-citation" as const };
      }
    }

    const newVersion = latestVersion + 1;
    const claimPlans = claimInputs.map((claimInput) => {
      const sourceCitations = claimInput.citationIds.map((id) => citationById.get(id)!);
      return { claimInput, sourceCitations, evidenceStatus: deriveClaimEvidenceStatus(claimInput, sourceCitations) };
    });
    const finalEvidenceStatus = worstStatus(claimPlans.map((p) => p.evidenceStatus));
    const claimResults: Array<{ claim: ClaimRow; citations: CitationRow[] }> = [];

    const answerVersionInsert = await client.query<AnswerVersionRow>(
      `insert into answer_versions
         (question_id, version, body_markdown, source, evidence_status, created_by)
       values ($1, $2, $3, 'USER', $4, $5)
       returning ${ANSWER_VERSION_COLUMNS}`,
      [questionId, newVersion, bodyMarkdown, finalEvidenceStatus, user.id]
    );
    const answerVersion = answerVersionInsert.rows[0]!;

    for (const { claimInput, sourceCitations, evidenceStatus } of claimPlans) {
      const claimInsert = await client.query<ClaimRow>(
        `insert into claims (answer_version_id, claim_index, claim_text, is_factual, evidence_status)
         values ($1, $2, $3, $4, $5)
         returning ${CLAIM_COLUMNS}`,
        [answerVersion.id, claimInput.claimIndex, claimInput.claimText, claimInput.isFactual, evidenceStatus]
      );
      const claim = claimInsert.rows[0]!;

      const newCitations: CitationRow[] = [];
      for (const source of sourceCitations) {
        const citationInsert = await client.query<CitationRow>(
          `insert into citations (claim_id, chunk_id, quote_text, page_number, relevance_score, verdict)
           values ($1, $2, $3, $4, $5, $6)
           returning ${CITATION_COLUMNS}`,
          [claim.id, source.chunk_id, source.quote_text, source.page_number, source.relevance_score, source.verdict]
        );
        newCitations.push(citationInsert.rows[0]!);
      }

      claimResults.push({ claim, citations: newCitations });
    }

    return {
      kind: "created" as const,
      answerVersion,
      claims: claimResults,
    };
  });

  if (result.kind === "conflict") {
    return apiError("CONFLICT", "다른 사용자가 먼저 답변을 수정했습니다.", {
      latestVersion: result.latestVersion,
    });
  }
  if (result.kind === "invalid-citation") {
    return apiError("VALIDATION_ERROR", "존재하지 않는 근거(citation)를 참조했습니다.");
  }

  return apiOk(
    {
      answerVersion: {
        ...toAnswerVersionDto(result.answerVersion),
        claims: result.claims.map(({ claim, citations }) => ({
          ...toClaimDto(claim),
          citations: citations.map(toCitationDto),
        })),
      },
    },
    { status: 201 }
  );
}
