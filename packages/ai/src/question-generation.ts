import { z } from "zod";
import { PRIORITY_LEVELS, QUESTION_CATEGORIES } from "@ipo/contracts";
import { supportsTemperature } from "./model-capabilities";
import { extractResponseOutputText } from "./responses-api";

/**
 * spec 24절 "예상 질문 생성 프롬프트". Uses the OpenAI Responses API
 * (POST /v1/responses), not the older Chat Completions API -- spec 13절
 * calls for a "Responses API 호환 어댑터" explicitly. Request/response
 * shape (input roles, text.format for structured outputs, output[].
 * content[].text) confirmed against the official API reference, not
 * guessed.
 */
export const QUESTION_GENERATION_PROMPT_ID = "question-generation-ko-v1.0.0";

const generatedQuestionSchema = z
  .object({
    category: z.enum(QUESTION_CATEGORIES),
    question: z.string().min(10).max(500),
    rationale: z.string().min(10).max(1000),
    priority: z.enum(PRIORITY_LEVELS),
    evidenceChunkIds: z.array(z.string()).min(1),
    followUps: z.array(z.string()).max(3),
    dataGaps: z.array(z.string()),
  })
  .strict();

export const questionGenerationOutputSchema = z
  .object({ questions: z.array(generatedQuestionSchema) })
  .strict();

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type QuestionGenerationOutput = z.infer<typeof questionGenerationOutputSchema>;

// Mirrors questionGenerationOutputSchema exactly (spec 24절 "출력 JSON
// Schema") -- passed to OpenAI to enforce structure at generation time;
// questionGenerationOutputSchema re-validates server-side regardless
// (spec 22절: "출력은 JSON Schema로 강제하고 서버에서 재검증한다").
const QUESTION_GENERATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "question",
          "rationale",
          "priority",
          "evidenceChunkIds",
          "followUps",
          "dataGaps",
        ],
        properties: {
          category: { enum: QUESTION_CATEGORIES },
          question: { type: "string", minLength: 10, maxLength: 500 },
          rationale: { type: "string", minLength: 10, maxLength: 1000 },
          priority: { enum: PRIORITY_LEVELS },
          evidenceChunkIds: { type: "array", minItems: 1, items: { type: "string" } },
          followUps: { type: "array", maxItems: 3, items: { type: "string" } },
          dataGaps: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export function buildSystemPrompt(): string {
  return `당신은 대한민국 IPO 준비를 지원하는 상장심사 Q&A 분석 도구다.
당신의 임무는 제공된 회사 자료에서 심사자가 확인할 가능성이 높은 질문을 식별하는 것이다.

절대 규칙:
1. 제공되지 않은 회사 사실을 추정하거나 생성하지 않는다.
2. 각 질문은 최소 1개의 evidence_chunk_id와 연결한다.
3. 근거가 약한 경우에도 사실을 만들지 말고 data_gap을 기술한다.
4. 질문은 한 문장에 하나의 핵심 쟁점만 포함한다.
5. 홍보성 표현을 제거하고 중립적·검증 가능한 문장으로 작성한다.
6. 유사 질문은 합치고 중복 이유를 기록한다.
7. KRX 심사 통과 여부를 예측하거나 보장하지 않는다.
8. 출력은 지정된 JSON Schema만 사용한다.`;
}

export interface DeveloperPromptParams {
  targetMarket: string;
  industry: string;
  questionCount: number;
  categories: string[];
  depth: string;
}

export function buildDeveloperPrompt(params: DeveloperPromptParams): string {
  return `프로젝트 시장: ${params.targetMarket}
업종: ${params.industry}
목표 질문 수: ${params.questionCount}
선택 카테고리: ${params.categories.join(", ")}
심층도: ${params.depth}

우선 탐색 쟁점:
- 문서 간 수치·날짜·명칭 불일치
- 매출 및 고객 집중도
- 수익성과 현금흐름의 지속가능성
- 특수관계자 및 지배구조
- 내부통제 취약점과 개선 이력
- 계약·인허가·IP·소송·핵심인력 위험

priority 기준:
CRITICAL = 상장 적격성 또는 재무 신뢰성에 중대한 영향을 줄 수 있는 명시적 충돌
HIGH = 추가 설명이나 핵심 증빙이 필요한 중요한 쟁점
MEDIUM = 통상 확인이 필요한 쟁점
LOW = 보완적 설명 수준`;
}

export interface RetrievedChunkForPrompt {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  content: string;
}

export function buildUserPrompt(chunks: RetrievedChunkForPrompt[]): string {
  const evidence = chunks
    .map(
      (c) =>
        `[chunkId: ${c.chunkId}, documentId: ${c.documentId}, page: ${c.pageNumber}]\n${c.content}`
    )
    .join("\n\n");
  return `다음 evidence만 사용하여 예상 심사 질문을 생성하라.

<evidence>
${evidence}
</evidence>`;
}

export interface GenerateQuestionsParams extends DeveloperPromptParams {
  apiKey: string;
  model: string;
  baseUrl?: string;
  chunks: RetrievedChunkForPrompt[];
}

export async function generateQuestions(
  params: GenerateQuestionsParams
): Promise<GeneratedQuestion[]> {
  const baseUrl = params.baseUrl ?? "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      // spec 22절: 질문 생성 기본 temperature 0.3 -- 단 reasoning 모델(gpt-5
      // 계열 등)은 이 파라미터 자체를 거부하므로 지원하는 모델에만 보낸다.
      ...(supportsTemperature(params.model) ? { temperature: 0.3 } : {}),
      input: [
        { role: "system", content: buildSystemPrompt() },
        { role: "developer", content: buildDeveloperPrompt(params) },
        { role: "user", content: buildUserPrompt(params.chunks) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "question_generation",
          schema: QUESTION_GENERATION_JSON_SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`question generation request failed (${response.status}): ${detail}`);
  }

  const body = await response.json();
  const text = extractResponseOutputText(body);
  if (typeof text !== "string") {
    throw new Error("question generation response missing output text");
  }

  const parsed = questionGenerationOutputSchema.parse(JSON.parse(text));
  return parsed.questions;
}
