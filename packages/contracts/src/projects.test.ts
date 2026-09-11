import { describe, expect, it } from "vitest";
import { createProjectRequestSchema, updateProjectRequestSchema } from "./projects";

describe("createProjectRequestSchema", () => {
  const valid = {
    name: "예시테크 IPO 2027",
    companyNameKo: "주식회사 예시테크",
    industry: "B2B SaaS",
  };

  it("필수값만 있으면 통과하고 targetMarket 기본값은 UNDECIDED다", () => {
    const result = createProjectRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetMarket).toBe("UNDECIDED");
    }
  });

  it("name이 비어있으면 거부한다", () => {
    const result = createProjectRequestSchema.safeParse({ ...valid, name: "" });
    expect(result.success).toBe(false);
  });

  it("targetFilingDate 형식이 틀리면 거부한다", () => {
    const result = createProjectRequestSchema.safeParse({
      ...valid,
      targetFilingDate: "2027/03/31",
    });
    expect(result.success).toBe(false);
  });

  it("websiteUrl이 유효한 URL이 아니면 거부한다", () => {
    const result = createProjectRequestSchema.safeParse({ ...valid, websiteUrl: "example" });
    expect(result.success).toBe(false);
  });

  it("targetMarket이 허용되지 않은 값이면 거부한다", () => {
    const result = createProjectRequestSchema.safeParse({ ...valid, targetMarket: "NASDAQ" });
    expect(result.success).toBe(false);
  });
});

describe("updateProjectRequestSchema", () => {
  it("빈 객체는 거부한다", () => {
    const result = updateProjectRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("일부 필드만 있어도 통과한다", () => {
    const result = updateProjectRequestSchema.safeParse({ name: "새 이름" });
    expect(result.success).toBe(true);
  });

  it("status만 변경하는 것도 허용한다", () => {
    const result = updateProjectRequestSchema.safeParse({ status: "ARCHIVED" });
    expect(result.success).toBe(true);
  });
});
