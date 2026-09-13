import { z } from "zod";
import { EVIDENCE_STATUSES, type EvidenceStatus } from "@ipo/contracts";
import type { RetrievedChunkForPrompt } from "./question-generation";

export type { RetrievedChunkForPrompt, EvidenceStatus };

/**
 * spec 25절 "근거 기반 답변 생성 프롬프트" + 26절 "Citation 검증 로직".
 * Same OpenAI Responses API shape as question-generation.ts (spec 13절
 * "Responses API 호환 어댑터").
 */
export const ANSWER_GENERATION_PROMPT_ID = "grounded-answer-ko-v1.0.0";

const CITATION_VERDICTS = ["SUPPORTS", "PARTIAL", "CONFLICTS"] as const;

const citationSchema = z
  .object({
    evidenceChunkId: z.string(),
    quoteText: z.string().max(300),
    verdict: z.enum(CITATION_VERDICTS),
  })
  .strict();

const claimSchema = z
  .object({
    claimText: z.string(),
    isFactual: z.boolean(),
    evidenceStatus: z.enum(EVIDENCE_STATUSES),
    citations: z.array(citationSchema),
  })
  .strict();

export const answerGenerationOutputSchema = z
  .object({
    answerMarkdown: z.string().max(5000),
    evidenceStatus: z.enum(EVIDENCE_STATUSES),
    claims: z.array(claimSchema),
    dataGaps: z.array(z.string()),
    conflicts: z.array(z.string()),
    followUpQuestions: z.array(z.string()).max(3),
  })
  .strict();

export type Citation = z.infer<typeof citationSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type AnswerGenerationOutput = z.infer<typeof answerGenerationOutputSchema>;

// Mirrors answerGenerationOutputSchema exactly (spec 25절 "출력 JSON
// Schema") for OpenAI structured-output enforcement; re-validated
// server-side regardless via answerGenerationOutputSchema.parse().
const ANSWER_GENERATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answerMarkdown", "evidenceStatus", "claims", "dataGaps", "conflicts", "followUpQuestions"],
  properties: {
    answerMarkdown: { type: "string", maxLength: 5000 },
    evidenceStatus: { enum: EVIDENCE_STATUSES },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claimText", "isFactual", "evidenceStatus", "citations"],
        properties: {
          claimText: { type: "string" },
          isFactual: { type: "boolean" },
          evidenceStatus: { enum: EVIDENCE_STATUSES },
          citations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["evidenceChunkId", "quoteText", "verdict"],
              properties: {
                evidenceChunkId: { type: "string" },
                quoteText: { type: "string", maxLength: 300 },
                verdict: { enum: CITATION_VERDICTS },
              },
            },
          },
        },
      },
    },
    dataGaps: { type: "array", items: { type: "string" } },
    conflicts: { type: "array", items: { type: "string" } },
    followUpQuestions: { type: "array", maxItems: 3, items: { type: "string" } },
  },
};

export function buildAnswerSystemPrompt(): string {
  return `당신은 IPO 실무자의 답변 초안을 지원하는 근거 중심 작성 도구다.

절대 규칙:
1. 답변의 회사 관련 사실은 evidence에 명시된 내용만 사용한다.
2. 수치, 비율, 날짜, 고유명사, 계약조건, 원인·결과 주장은 factual claim으로 분리한다.
3. 모든 factual claim에는 실제로 그 주장을 지지하는 evidence_chunk_id를 1개 이상 연결한다.
4. 근거가 없으면 내용을 추정하지 말고 "추가 자료 필요"라고 쓴다.
5. evidence끼리 충돌하면 하나를 선택하지 말고 양쪽 내용을 제시한 후 "근거 충돌"로 표시한다.
6. 인용문은 evidence 원문에 존재하는 짧은 구절이어야 한다.
7. 질문에 직접 답하고 결론→근거→보완사항 순서로 간결하게 작성한다.
8. 법률·회계 판단 또는 심사 통과 보장을 하지 않는다.
9. 출력은 지정된 JSON Schema만 사용한다.`;
}

export function buildAnswerDeveloperPrompt(params: { category: string }): string {
  return `답변 문체: CFO가 심사 대응 문서에 사용할 수 있는 정중하고 간결한 한국어
길이: 3~7문단, 최대 1,200자
질문 카테고리: ${params.category}

evidence_status 판정:
SUPPORTED = 모든 factual claim이 직접 근거로 지지됨
PARTIAL = 일부 비핵심 claim의 근거가 간접적임
NEEDS_EVIDENCE = 핵심 답변에 필요한 근거가 없음
CONFLICT = 관련 근거가 서로 충돌함`;
}

export function buildAnswerUserPrompt(questionText: string, chunks: RetrievedChunkForPrompt[]): string {
  const evidence = chunks
    .map(
      (c) =>
        `[chunkId: ${c.chunkId}, documentId: ${c.documentId}, page: ${c.pageNumber}]\n${c.content}`
    )
    .join("\n\n");
  return `<question>${questionText}</question>
<evidence>
${evidence}
</evidence>
위 자료만으로 답변 초안을 작성하라.`;
}

export interface GenerateAnswerParams {
  apiKey: string;
  model: string;
  baseUrl?: string;
  questionText: string;
  category: string;
  chunks: RetrievedChunkForPrompt[];
}

export async function generateAnswer(params: GenerateAnswerParams): Promise<AnswerGenerationOutput> {
  const baseUrl = params.baseUrl ?? "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.1, // spec 22절: 답변 생성 기본 temperature
      input: [
        { role: "system", content: buildAnswerSystemPrompt() },
        { role: "developer", content: buildAnswerDeveloperPrompt({ category: params.category }) },
        { role: "user", content: buildAnswerUserPrompt(params.questionText, params.chunks) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "grounded_answer",
          schema: ANSWER_GENERATION_JSON_SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`answer generation request failed (${response.status}): ${detail}`);
  }

  const body = await response.json();
  const text: unknown = body?.output?.[0]?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("answer generation response missing output text");
  }

  return answerGenerationOutputSchema.parse(JSON.parse(text));
}

const STATUS_SEVERITY: Record<EvidenceStatus, number> = {
  SUPPORTED: 0,
  PARTIAL: 1,
  NEEDS_EVIDENCE: 2,
  CONFLICT: 3,
};

function worstStatus(a: EvidenceStatus, b: EvidenceStatus): EvidenceStatus {
  return STATUS_SEVERITY[a] >= STATUS_SEVERITY[b] ? a : b;
}

/** Collapses whitespace so PDF-extraction spacing quirks don't break an
 * otherwise-faithful quote match. Spec 26절 doesn't define "normalize"
 * precisely; this is the documented interpretation. */
function normalize(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * spec 26절 Citation 검증 로직. Re-checks the model's own output against
 * the actual retrieval set, independent of OpenAI's structured-output
 * enforcement (spec 22절: "서버에서 재검증한다") -- a model can satisfy the
 * JSON Schema shape while still hallucinating a chunk id or misquoting a
 * chunk's content, neither of which strict-mode json_schema can catch.
 *
 * NOT implemented here: the `entailment = verify_support(...)` semantic
 * check (spec 26절) -- that needs a real NLI/entailment model call, out of
 * scope while AI generation itself is mocked. Citations that pass the
 * structural checks (chunk exists in the retrieval set, quote is a real
 * substring) are trusted at the verdict the model reported.
 */
export function validateAnswerOutput(
  output: AnswerGenerationOutput,
  retrievalSet: RetrievedChunkForPrompt[]
): AnswerGenerationOutput {
  const chunkById = new Map(retrievalSet.map((c) => [c.chunkId, c]));

  const claims = output.claims.map((claim) => {
    const validCitations = claim.citations.filter((citation) => {
      const chunk = chunkById.get(citation.evidenceChunkId);
      if (!chunk) return false;
      return normalize(chunk.content).includes(normalize(citation.quoteText));
    });

    const evidenceStatus: EvidenceStatus =
      claim.isFactual && validCitations.length === 0 ? "NEEDS_EVIDENCE" : claim.evidenceStatus;

    return { ...claim, citations: validCitations, evidenceStatus };
  });

  const aggregated =
    claims.length === 0
      ? output.evidenceStatus
      : claims.reduce<EvidenceStatus>((acc, c) => worstStatus(acc, c.evidenceStatus), "SUPPORTED");

  return { ...output, claims, evidenceStatus: aggregated };
}
