import { describe, expect, it } from "vitest";
import { mockGenerateQuestions } from "../scripts/run-question-jobs-local";
import { questionGenerationOutputSchema } from "../src/question-generation";

describe("mockGenerateQuestions", () => {
  const chunks = [
    { chunkId: "chunk-1", documentId: "doc-1", pageNumber: 1, content: "본문 1" },
    { chunkId: "chunk-2", documentId: "doc-1", pageNumber: 2, content: "본문 2" },
  ];

  it("요청한 개수만큼 질문을 생성한다", () => {
    const result = mockGenerateQuestions({
      categories: ["FINANCE", "RISK"],
      questionCount: 5,
      chunks,
    });

    expect(result).toHaveLength(5);
  });

  it("선택된 카테고리만 순환하며 사용한다", () => {
    const result = mockGenerateQuestions({
      categories: ["FINANCE", "RISK"],
      questionCount: 4,
      chunks,
    });

    expect(new Set(result.map((q) => q.category))).toEqual(new Set(["FINANCE", "RISK"]));
  });

  it("evidenceChunkIds는 실제 전달된 chunk id를 참조한다", () => {
    const result = mockGenerateQuestions({
      categories: ["FINANCE"],
      questionCount: 3,
      chunks,
    });

    for (const question of result) {
      for (const id of question.evidenceChunkIds) {
        expect(chunks.some((c) => c.chunkId === id)).toBe(true);
      }
    }
  });

  it("생성된 출력이 실제 스키마(questionGenerationOutputSchema)를 통과한다", () => {
    const result = mockGenerateQuestions({
      categories: ["FINANCE", "GOVERNANCE"],
      questionCount: 6,
      chunks,
    });

    const parsed = questionGenerationOutputSchema.safeParse({ questions: result });
    expect(parsed.success).toBe(true);
  });

  it("evidence chunk가 없으면 빈 배열을 반환한다 (근거 없는 질문 생성 금지)", () => {
    const result = mockGenerateQuestions({ categories: ["FINANCE"], questionCount: 5, chunks: [] });

    expect(result).toEqual([]);
  });
});
