import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ANSWER_GENERATION_PROMPT_ID,
  answerGenerationOutputSchema,
  buildAnswerDeveloperPrompt,
  buildAnswerSystemPrompt,
  buildAnswerUserPrompt,
  generateAnswer,
  validateAnswerOutput,
  type AnswerGenerationOutput,
  type RetrievedChunkForPrompt,
} from "../src/answer-generation";

describe("buildAnswerSystemPrompt", () => {
  it("spec 25절의 9가지 절대 규칙을 모두 포함한다", () => {
    const prompt = buildAnswerSystemPrompt();

    expect(prompt).toContain("evidence에 명시된 내용만 사용");
    expect(prompt).toContain("factual claim으로 분리");
    expect(prompt).toContain("evidence_chunk_id를 1개 이상 연결");
    expect(prompt).toContain("추가 자료 필요");
    expect(prompt).toContain("근거 충돌");
    expect(prompt).toContain("짧은 구절");
    expect(prompt).toContain("결론→근거→보완사항");
    expect(prompt).toContain("심사 통과 보장을 하지 않는다");
    expect(prompt).toContain("JSON Schema");
  });
});

describe("buildAnswerDeveloperPrompt", () => {
  it("카테고리를 프롬프트에 삽입한다", () => {
    const prompt = buildAnswerDeveloperPrompt({ category: "FINANCE" });
    expect(prompt).toContain("FINANCE");
    expect(prompt).toContain("SUPPORTED");
    expect(prompt).toContain("NEEDS_EVIDENCE");
  });
});

describe("buildAnswerUserPrompt", () => {
  it("질문과 evidence 청크를 포함한다", () => {
    const chunks: RetrievedChunkForPrompt[] = [
      { chunkId: "chunk-1", documentId: "doc-1", pageNumber: 5, content: "매출 관련 본문" },
    ];
    const prompt = buildAnswerUserPrompt("2025년 매출은 얼마입니까?", chunks);

    expect(prompt).toContain("2025년 매출은 얼마입니까?");
    expect(prompt).toContain("chunk-1");
    expect(prompt).toContain("매출 관련 본문");
  });
});

describe("answerGenerationOutputSchema", () => {
  const valid: AnswerGenerationOutput = {
    answerMarkdown: "2025년 매출액은 120억원입니다.",
    evidenceStatus: "SUPPORTED",
    claims: [
      {
        claimText: "2025년 매출액은 120억원입니다.",
        isFactual: true,
        evidenceStatus: "SUPPORTED",
        citations: [{ evidenceChunkId: "chunk-1", quoteText: "매출액 120억원", verdict: "SUPPORTS" }],
      },
    ],
    dataGaps: [],
    conflicts: [],
    followUpQuestions: [],
  };

  it("유효한 출력은 통과한다", () => {
    expect(answerGenerationOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("정의되지 않은 필드가 있으면 거부한다", () => {
    const result = answerGenerationOutputSchema.safeParse({ ...valid, extra: "x" });
    expect(result.success).toBe(false);
  });

  it("claim에 citations 필드가 없으면 거부한다", () => {
    const claim = { ...valid.claims[0]! } as Record<string, unknown>;
    delete claim.citations;
    const result = answerGenerationOutputSchema.safeParse({ ...valid, claims: [claim] });
    expect(result.success).toBe(false);
  });

  it("answerMarkdown이 5000자를 초과하면 거부한다", () => {
    const result = answerGenerationOutputSchema.safeParse({
      ...valid,
      answerMarkdown: "a".repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe("validateAnswerOutput (spec 26절 Citation 검증 로직)", () => {
  const retrievalSet: RetrievedChunkForPrompt[] = [
    { chunkId: "chunk-1", documentId: "doc-1", pageNumber: 5, content: "2025년 매출액은 120억원이다." },
    { chunkId: "chunk-2", documentId: "doc-1", pageNumber: 6, content: "영업이익은 30억원이다." },
  ];

  it("factual claim에 citation이 없으면 NEEDS_EVIDENCE로 강등한다", () => {
    const output: AnswerGenerationOutput = {
      answerMarkdown: "답변",
      evidenceStatus: "SUPPORTED",
      claims: [
        { claimText: "매출액은 120억원이다.", isFactual: true, evidenceStatus: "SUPPORTED", citations: [] },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    };

    const result = validateAnswerOutput(output, retrievalSet);

    expect(result.claims[0]!.evidenceStatus).toBe("NEEDS_EVIDENCE");
  });

  it("retrieval set에 없는 chunkId를 인용하면 해당 citation을 제거한다 (환각 방지)", () => {
    const output: AnswerGenerationOutput = {
      answerMarkdown: "답변",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "매출액은 120억원이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [
            { evidenceChunkId: "chunk-does-not-exist", quoteText: "120억원", verdict: "SUPPORTS" },
          ],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    };

    const result = validateAnswerOutput(output, retrievalSet);

    expect(result.claims[0]!.citations).toHaveLength(0);
    expect(result.claims[0]!.evidenceStatus).toBe("NEEDS_EVIDENCE");
  });

  it("인용문이 원문에 실제로 존재하지 않으면 해당 citation을 제거한다 (quote faithfulness)", () => {
    const output: AnswerGenerationOutput = {
      answerMarkdown: "답변",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "매출액은 900억원이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [{ evidenceChunkId: "chunk-1", quoteText: "매출액은 900억원", verdict: "SUPPORTS" }],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    };

    const result = validateAnswerOutput(output, retrievalSet);

    expect(result.claims[0]!.citations).toHaveLength(0);
  });

  it("공백 차이만 있는 인용문은 정규화 후 일치하면 통과한다", () => {
    const output: AnswerGenerationOutput = {
      answerMarkdown: "답변",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "매출액은 120억원이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [{ evidenceChunkId: "chunk-1", quoteText: "2025년   매출액은 120억원", verdict: "SUPPORTS" }],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    };

    const result = validateAnswerOutput(output, retrievalSet);

    expect(result.claims[0]!.citations).toHaveLength(1);
    expect(result.claims[0]!.evidenceStatus).toBe("SUPPORTED");
  });

  it("유효한 citation이 있는 factual claim은 SUPPORTED를 유지한다", () => {
    const output: AnswerGenerationOutput = {
      answerMarkdown: "답변",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "매출액은 120억원이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [{ evidenceChunkId: "chunk-1", quoteText: "매출액은 120억원", verdict: "SUPPORTS" }],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    };

    const result = validateAnswerOutput(output, retrievalSet);

    expect(result.claims[0]!.evidenceStatus).toBe("SUPPORTED");
    expect(result.claims[0]!.citations).toHaveLength(1);
  });

  it("전체 답변 상태는 claim 중 가장 나쁜 상태로 집계된다 (CONFLICT > NEEDS_EVIDENCE > PARTIAL > SUPPORTED)", () => {
    const output: AnswerGenerationOutput = {
      answerMarkdown: "답변",
      evidenceStatus: "SUPPORTED",
      claims: [
        {
          claimText: "매출액은 120억원이다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [{ evidenceChunkId: "chunk-1", quoteText: "매출액은 120억원", verdict: "SUPPORTS" }],
        },
        {
          claimText: "영업이익률은 알 수 없다.",
          isFactual: true,
          evidenceStatus: "SUPPORTED",
          citations: [],
        },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    };

    const result = validateAnswerOutput(output, retrievalSet);

    expect(result.evidenceStatus).toBe("NEEDS_EVIDENCE");
  });

  it("factual이 아닌 claim은 citation이 없어도 강등되지 않는다", () => {
    const output: AnswerGenerationOutput = {
      answerMarkdown: "답변",
      evidenceStatus: "SUPPORTED",
      claims: [
        { claimText: "이 수치는 양호한 편입니다.", isFactual: false, evidenceStatus: "SUPPORTED", citations: [] },
      ],
      dataGaps: [],
      conflicts: [],
      followUpQuestions: [],
    };

    const result = validateAnswerOutput(output, retrievalSet);

    expect(result.claims[0]!.evidenceStatus).toBe("SUPPORTED");
    expect(result.evidenceStatus).toBe("SUPPORTED");
  });
});

describe("generateAnswer", () => {
  const chunks: RetrievedChunkForPrompt[] = [
    { chunkId: "chunk-1", documentId: "doc-1", pageNumber: 1, content: "본문" },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("temperature 0.1로 Responses API를 호출한다 (spec 22절)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  answerMarkdown: "답변",
                  evidenceStatus: "NEEDS_EVIDENCE",
                  claims: [],
                  dataGaps: [],
                  conflicts: [],
                  followUpQuestions: [],
                }),
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateAnswer({
      apiKey: "test-key",
      model: "test-model",
      questionText: "질문",
      category: "FINANCE",
      chunks,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.temperature).toBe(0.1);
    expect(body.text.format.strict).toBe(true);
  });

  it("reasoning 모델(gpt-5 계열)에는 temperature를 보내지 않는다 (400 Unsupported parameter 방지)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  answerMarkdown: "답변",
                  evidenceStatus: "NEEDS_EVIDENCE",
                  claims: [],
                  dataGaps: [],
                  conflicts: [],
                  followUpQuestions: [],
                }),
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateAnswer({
      apiKey: "test-key",
      model: "gpt-5-nano",
      questionText: "질문",
      category: "FINANCE",
      chunks,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.model).toBe("gpt-5-nano");
    expect(body).not.toHaveProperty("temperature");
  });

  it("모델이 스키마를 위반한 JSON을 반환하면 거부한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output: [
            { type: "message", content: [{ type: "output_text", text: JSON.stringify({ answerMarkdown: "x" }) }] },
          ],
        }),
      })
    );

    await expect(
      generateAnswer({ apiKey: "k", model: "m", questionText: "q", category: "FINANCE", chunks })
    ).rejects.toThrow();
  });
});

void ANSWER_GENERATION_PROMPT_ID;
