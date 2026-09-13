import { describe, expect, it } from "vitest";
import { createAnswerJobRequestSchema } from "./answers";

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
