import { describe, expect, it } from "vitest";
import {
  createAnswerJobRequestSchema,
  createAnswerVersionRequestSchema,
  createReviewRequestSchema,
} from "./answers";

describe("createAnswerJobRequestSchema", () => {
  it("빈 객체도 통과한다 (모두 선택값, 기본값 적용)", () => {
    const result = createAnswerJobRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.style).toBe("CFO_CONCISE");
      expect(result.data.maxClaims).toBe(12);
      expect(result.data.documentIds).toBeUndefined();
    }
  });

  it("documentIds를 지정할 수 있다", () => {
    const result = createAnswerJobRequestSchema.safeParse({
      documentIds: ["4d78a53d-66f4-4b44-b768-d66eb6ed957e"],
    });
    expect(result.success).toBe(true);
  });

  it("허용되지 않은 style은 거부한다", () => {
    const result = createAnswerJobRequestSchema.safeParse({ style: "CASUAL" });
    expect(result.success).toBe(false);
  });

  it("maxClaims는 1~50 범위만 허용한다", () => {
    expect(createAnswerJobRequestSchema.safeParse({ maxClaims: 0 }).success).toBe(false);
    expect(createAnswerJobRequestSchema.safeParse({ maxClaims: 51 }).success).toBe(false);
    expect(createAnswerJobRequestSchema.safeParse({ maxClaims: 12 }).success).toBe(true);
  });
});

describe("createAnswerVersionRequestSchema", () => {
  const validClaim = {
    claimIndex: 0,
    claimText: "2025년 매출액은 120억원입니다.",
    isFactual: true,
    citationIds: ["4d78a53d-66f4-4b44-b768-d66eb6ed957e"],
  };

  it("유효한 요청은 통과한다", () => {
    const result = createAnswerVersionRequestSchema.safeParse({
      baseVersion: 2,
      bodyMarkdown: "당사의 매출은... [C1]",
      claims: [validClaim],
    });
    expect(result.success).toBe(true);
  });

  it("baseVersion 0은 아직 답변이 없는 질문의 첫 저장을 의미하며 허용된다", () => {
    const result = createAnswerVersionRequestSchema.safeParse({
      baseVersion: 0,
      bodyMarkdown: "본문",
      claims: [validClaim],
    });
    expect(result.success).toBe(true);
  });

  it("claims가 비어있으면 거부한다", () => {
    const result = createAnswerVersionRequestSchema.safeParse({
      baseVersion: 1,
      bodyMarkdown: "본문",
      claims: [],
    });
    expect(result.success).toBe(false);
  });

  it("citation 없는 사실 claim은 거부한다", () => {
    const result = createAnswerVersionRequestSchema.safeParse({
      baseVersion: 1,
      bodyMarkdown: "본문",
      claims: [{ ...validClaim, citationIds: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("citation 없는 사실 claim도 evidenceStatus를 NEEDS_EVIDENCE로 명시하면 허용한다", () => {
    const result = createAnswerVersionRequestSchema.safeParse({
      baseVersion: 1,
      bodyMarkdown: "본문",
      claims: [{ ...validClaim, citationIds: [], evidenceStatus: "NEEDS_EVIDENCE" }],
    });
    expect(result.success).toBe(true);
  });

  it("citation 없는 비사실(opinion) claim은 그대로 허용한다", () => {
    const result = createAnswerVersionRequestSchema.safeParse({
      baseVersion: 1,
      bodyMarkdown: "본문",
      claims: [{ ...validClaim, isFactual: false, citationIds: [] }],
    });
    expect(result.success).toBe(true);
  });
});

describe("createReviewRequestSchema", () => {
  it("decision만으로도 통과한다 (comment는 선택값)", () => {
    expect(createReviewRequestSchema.safeParse({ decision: "APPROVED" }).success).toBe(true);
  });

  it("comment를 포함할 수 있다", () => {
    const result = createReviewRequestSchema.safeParse({
      decision: "REJECTED",
      comment: "2025년 수치는 감사보고서와 불일치합니다.",
    });
    expect(result.success).toBe(true);
  });

  it("허용되지 않은 decision은 거부한다", () => {
    expect(createReviewRequestSchema.safeParse({ decision: "PENDING" }).success).toBe(false);
  });

  it("빈 comment는 거부한다", () => {
    expect(createReviewRequestSchema.safeParse({ decision: "APPROVED", comment: "" }).success).toBe(false);
  });
});
