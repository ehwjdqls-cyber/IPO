import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  QUESTION_GENERATION_PROMPT_ID,
  buildDeveloperPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  generateQuestions,
  questionGenerationOutputSchema,
  type RetrievedChunkForPrompt,
} from "../src/question-generation";

describe("buildSystemPrompt", () => {
  it("spec 24절의 8가지 절대 규칙을 모두 포함한다", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("제공되지 않은 회사 사실을 추정하거나 생성하지 않는다");
    expect(prompt).toContain("evidence_chunk_id");
    expect(prompt).toContain("data_gap");
    expect(prompt).toContain("한 문장에 하나의 핵심 쟁점");
    expect(prompt).toContain("홍보성 표현");
    expect(prompt).toContain("유사 질문은 합치고");
    expect(prompt).toContain("KRX 심사 통과 여부를 예측");
    expect(prompt).toContain("JSON Schema");
  });
});

describe("buildDeveloperPrompt", () => {
  it("프로젝트 파라미터를 프롬프트에 삽입한다", () => {
    const prompt = buildDeveloperPrompt({
      targetMarket: "KOSDAQ",
      industry: "B2B SaaS",
      questionCount: 20,
      categories: ["FINANCE", "RISK"],
      depth: "표준",
    });

    expect(prompt).toContain("KOSDAQ");
    expect(prompt).toContain("B2B SaaS");
    expect(prompt).toContain("20");
    expect(prompt).toContain("FINANCE");
    expect(prompt).toContain("RISK");
    expect(prompt).toContain("표준");
  });
});

describe("buildUserPrompt", () => {
  it("evidence 청크를 id/문서/페이지/본문과 함께 포함한다", () => {
    const chunks: RetrievedChunkForPrompt[] = [
      { chunkId: "chunk-1", documentId: "doc-1", pageNumber: 3, content: "매출 관련 내용" },
    ];

    const prompt = buildUserPrompt(chunks);

    expect(prompt).toContain("chunk-1");
    expect(prompt).toContain("doc-1");
    expect(prompt).toContain("3");
    expect(prompt).toContain("매출 관련 내용");
  });
});

describe("questionGenerationOutputSchema", () => {
  const validQuestion = {
    category: "FINANCE",
    question: "2025년과 2026년 매출 인식 기준이 왜 달라졌습니까?",
    rationale: "두 회계연도의 매출 인식 방식 차이가 재무제표 신뢰성에 영향을 줄 수 있습니다.",
    priority: "HIGH",
    evidenceChunkIds: ["chunk-1"],
    followUps: [],
    dataGaps: [],
  };

  it("유효한 출력은 통과한다", () => {
    const result = questionGenerationOutputSchema.safeParse({ questions: [validQuestion] });
    expect(result.success).toBe(true);
  });

  it("evidenceChunkIds가 비어있으면 거부한다 (근거 없는 질문 금지)", () => {
    const result = questionGenerationOutputSchema.safeParse({
      questions: [{ ...validQuestion, evidenceChunkIds: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("허용되지 않은 category는 거부한다", () => {
    const result = questionGenerationOutputSchema.safeParse({
      questions: [{ ...validQuestion, category: "LEGAL" }],
    });
    expect(result.success).toBe(false);
  });

  it("question이 10자 미만이면 거부한다", () => {
    const result = questionGenerationOutputSchema.safeParse({
      questions: [{ ...validQuestion, question: "짧음" }],
    });
    expect(result.success).toBe(false);
  });

  it("followUps가 3개를 초과하면 거부한다", () => {
    const result = questionGenerationOutputSchema.safeParse({
      questions: [{ ...validQuestion, followUps: ["a", "b", "c", "d"] }],
    });
    expect(result.success).toBe(false);
  });

  it("정의되지 않은 필드가 있으면 거부한다", () => {
    const result = questionGenerationOutputSchema.safeParse({
      questions: [{ ...validQuestion, extra: "안됨" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("generateQuestions", () => {
  const chunks: RetrievedChunkForPrompt[] = [
    { chunkId: "chunk-1", documentId: "doc-1", pageNumber: 1, content: "본문" },
  ];

  const baseParams = {
    apiKey: "test-key",
    model: "test-model",
    targetMarket: "KOSDAQ",
    industry: "B2B SaaS",
    questionCount: 20,
    categories: ["FINANCE"],
    depth: "표준",
    chunks,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Responses API를 올바른 shape로 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify({ questions: [] }) }],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateQuestions(baseParams);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.model).toBe("test-model");
    expect(body.temperature).toBe(0.3);
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(body.input).toHaveLength(3);
    expect(body.input[0].role).toBe("system");
    expect(body.input[1].role).toBe("developer");
    expect(body.input[2].role).toBe("user");
  });

  it("reasoning 모델(gpt-5 계열)에는 temperature를 보내지 않는다 (400 Unsupported parameter 방지)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify({ questions: [] }) }],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateQuestions({ ...baseParams, model: "gpt-5-nano" });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.model).toBe("gpt-5-nano");
    expect(body).not.toHaveProperty("temperature");
  });

  it("성공 응답에서 questions 배열을 파싱해 반환한다", async () => {
    const question = {
      category: "FINANCE",
      question: "2025년과 2026년 매출 인식 기준이 왜 달라졌습니까?",
      rationale: "재무제표 신뢰성에 영향을 줄 수 있습니다.",
      priority: "HIGH",
      evidenceChunkIds: ["chunk-1"],
      followUps: [],
      dataGaps: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify({ questions: [question] }) }],
            },
          ],
        }),
      })
    );

    const result = await generateQuestions(baseParams);

    expect(result).toEqual([question]);
  });

  it("HTTP 오류 응답이면 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" })
    );

    await expect(generateQuestions(baseParams)).rejects.toThrow();
  });

  it("모델이 스키마를 위반한 JSON을 반환하면 서버 재검증에서 거부한다 (spec 22절)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ questions: [{ category: "FINANCE" }] }),
                },
              ],
            },
          ],
        }),
      })
    );

    await expect(generateQuestions(baseParams)).rejects.toThrow();
  });
});
