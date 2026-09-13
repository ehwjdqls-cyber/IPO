import { describe, expect, it } from "vitest";
import { getIdempotencyKey } from "./idempotency";

describe("getIdempotencyKey", () => {
  it("Idempotency-Key 헤더 값을 반환한다", () => {
    const request = new Request("http://localhost/x", {
      headers: { "Idempotency-Key": "abc-123" },
    });
    expect(getIdempotencyKey(request)).toBe("abc-123");
  });

  it("헤더가 없으면 null을 반환한다", () => {
    const request = new Request("http://localhost/x");
    expect(getIdempotencyKey(request)).toBeNull();
  });

  it("헤더가 공백뿐이면 null을 반환한다", () => {
    const request = new Request("http://localhost/x", {
      headers: { "Idempotency-Key": "   " },
    });
    expect(getIdempotencyKey(request)).toBeNull();
  });

  it("앞뒤 공백을 제거한다", () => {
    const request = new Request("http://localhost/x", {
      headers: { "Idempotency-Key": "  abc-123  " },
    });
    expect(getIdempotencyKey(request)).toBe("abc-123");
  });
});
