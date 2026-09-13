import { describe, expect, it } from "vitest";
import { createCitationFeedbackRequestSchema } from "./citations";

describe("createCitationFeedbackRequestSchema", () => {
  it("feedback만으로도 통과한다 (comment는 선택값)", () => {
    expect(createCitationFeedbackRequestSchema.safeParse({ feedback: "ACCURATE" }).success).toBe(true);
  });

  it("comment를 포함할 수 있다", () => {
    const result = createCitationFeedbackRequestSchema.safeParse({
      feedback: "INSUFFICIENT",
      comment: "페이지 번호가 다릅니다.",
    });
    expect(result.success).toBe(true);
  });

  it("허용되지 않은 feedback 값은 거부한다", () => {
    expect(createCitationFeedbackRequestSchema.safeParse({ feedback: "MAYBE" }).success).toBe(false);
  });

  it("빈 comment는 거부한다", () => {
    expect(
      createCitationFeedbackRequestSchema.safeParse({ feedback: "ACCURATE", comment: "" }).success
    ).toBe(false);
  });
});
