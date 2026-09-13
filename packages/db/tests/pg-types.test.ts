import { describe, expect, it } from "vitest";
import pg from "pg";
import "../src/pg-types";

describe("pg 타입 파서 (date/timestamptz)", () => {
  it("date(OID 1082)는 문자열 그대로 반환한다 (Date 객체 아님)", () => {
    const parser = pg.types.getTypeParser(pg.types.builtins.DATE);
    const result = parser("2027-03-31");
    expect(result).toBe("2027-03-31");
    expect(result).not.toBeInstanceOf(Date);
  });

  it("timestamptz(OID 1184)는 ISO 8601 문자열로 반환한다 (spec 18절)", () => {
    const parser = pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ);
    const result = parser("2026-09-11 00:00:00+00");
    expect(result).toBe("2026-09-11T00:00:00.000Z");
    expect(result).not.toBeInstanceOf(Date);
  });
});
