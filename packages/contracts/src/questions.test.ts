import { describe, expect, it } from "vitest";
import { createQuestionJobRequestSchema } from "./questions";

describe("createQuestionJobRequestSchema", () => {
  const valid = {
    categories: ["FINANCE", "RISK"],
    questionCount: 20,
    depth: "STANDARD",
  };

  it("유효한 요청은 통과한다", () => {
    expect(createQuestionJobRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("documentIds가 없으면 undefined로 통과한다 (전체 READY 문서 의미)", () => {
    const result = createQuestionJobRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documentIds).toBeUndefined();
    }
  });

  it("documentIds를 지정할 수 있다", () => {
    const result = createQuestionJobRequestSchema.safeParse({
      ...valid,
      documentIds: ["4d78a53d-66f4-4b44-b768-d66eb6ed957e"],
    });
    expect(result.success).toBe(true);
  });

  it("categories가 비어있으면 거부한다", () => {
    const result = createQuestionJobRequestSchema.safeParse({ ...valid, categories: [] });
    expect(result.success).toBe(false);
  });

  it("허용되지 않은 category는 거부한다", () => {
    const result = createQuestionJobRequestSchema.safeParse({
      ...valid,
      categories: ["LEGAL"],
    });
    expect(result.success).toBe(false);
  });

  it("questionCount는 10/20/30만 허용한다", () => {
    expect(createQuestionJobRequestSchema.safeParse({ ...valid, questionCount: 15 }).success).toBe(
      false
    );
    expect(createQuestionJobRequestSchema.safeParse({ ...valid, questionCount: 10 }).success).toBe(
      true
    );
  });

  it("questionCount 기본값은 20이다", () => {
    const { questionCount, ...rest } = valid;
    const result = createQuestionJobRequestSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionCount).toBe(20);
    }
  });

  it("depth 기본값은 STANDARD이다", () => {
    const { depth, ...rest } = valid;
    const result = createQuestionJobRequestSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.depth).toBe("STANDARD");
    }
  });

  it("허용되지 않은 depth는 거부한다", () => {
    const result = createQuestionJobRequestSchema.safeParse({ ...valid, depth: "MEDIUM" });
    expect(result.success).toBe(false);
  });
});
