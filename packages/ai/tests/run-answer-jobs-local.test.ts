import { describe, expect, it } from "vitest";
import { mockGenerateAnswer } from "../scripts/run-answer-jobs-local";
import { answerGenerationOutputSchema, validateAnswerOutput } from "../src/answer-generation";
import type { RetrievalCandidate } from "../src/retrieval";

function makeCandidate(overrides: Partial<RetrievalCandidate>): RetrievalCandidate {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    pageNumber: 1,
    content: "본문 내용입니다",
    contentSha256: "x".repeat(64),
    bbox: null,
    denseScore: null,
    sparseScore: 0.5,
    fusedScore: 0.5,
    ...overrides,
  };
}

describe("mockGenerateAnswer", () => {
  it("evidence가 없으면 NEEDS_EVIDENCE 답변을 반환한다", () => {
    const result = mockGenerateAnswer("질문", [], 12);

    expect(result.evidenceStatus).toBe("NEEDS_EVIDENCE");
    expect(result.claims).toEqual([]);
  });

  it("evidence가 있으면 실제 청크 내용을 인용하는 claim을 생성한다", () => {
    const chunks = [makeCandidate({ chunkId: "chunk-1", content: "2025년 매출액은 120억원이다." })];

    const result = mockGenerateAnswer("2025년 매출은?", chunks, 12);

    expect(result.claims.length).toBeGreaterThan(0);
    const citation = result.claims[0]!.citations[0]!;
    expect(citation.evidenceChunkId).toBe("chunk-1");
    expect(chunks[0]!.content.includes(citation.quoteText)).toBe(true);
  });

  it("maxClaims를 넘지 않는다", () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      makeCandidate({ chunkId: `chunk-${i}`, content: `본문 ${i}번 내용입니다` })
    );

    const result = mockGenerateAnswer("질문", chunks, 3);

    expect(result.claims.length).toBeLessThanOrEqual(3);
  });

  it("생성된 출력이 실제 스키마를 통과한다", () => {
    const chunks = [makeCandidate({ content: "매출 관련 본문" })];
    const result = mockGenerateAnswer("질문", chunks, 5);

    expect(answerGenerationOutputSchema.safeParse(result).success).toBe(true);
  });

  it("validateAnswerOutput을 통과해 SUPPORTED로 집계된다 (인용문이 실제 substring이므로)", () => {
    const chunks = [makeCandidate({ chunkId: "chunk-1", content: "2025년 매출액은 120억원이다." })];
    const result = mockGenerateAnswer("2025년 매출은?", chunks, 5);

    const validated = validateAnswerOutput(result, chunks);

    expect(validated.evidenceStatus).toBe("SUPPORTED");
  });
});
