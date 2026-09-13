import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./postgres-errors";

describe("isUniqueViolation", () => {
  it("code가 23505이면 true를 반환한다", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("다른 code면 false를 반환한다", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });

  it("객체가 아니면 false를 반환한다", () => {
    expect(isUniqueViolation("boom")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
