import { describe, expect, it } from "vitest";
import { signupRequestSchema } from "./auth";

describe("signupRequestSchema", () => {
  it("orgName과 displayName이 있으면 통과한다", () => {
    const result = signupRequestSchema.safeParse({
      orgName: "예시테크",
      displayName: "홍길동",
    });
    expect(result.success).toBe(true);
  });

  it("orgName이 비어있으면 거부한다", () => {
    const result = signupRequestSchema.safeParse({ orgName: "  ", displayName: "홍길동" });
    expect(result.success).toBe(false);
  });

  it("displayName이 누락되면 거부한다", () => {
    const result = signupRequestSchema.safeParse({ orgName: "예시테크" });
    expect(result.success).toBe(false);
  });

  it("orgName 앞뒤 공백을 제거한다", () => {
    const result = signupRequestSchema.safeParse({
      orgName: "  예시테크  ",
      displayName: "홍길동",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgName).toBe("예시테크");
    }
  });
});
