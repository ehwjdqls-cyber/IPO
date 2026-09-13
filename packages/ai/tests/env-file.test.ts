import { describe, expect, it } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnvFile } from "../scripts/env-file";

function writeTempEnvFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "env-file-test-"));
  const filePath = join(dir, ".env.local");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("parseEnvFile", () => {
  it("key=value 쌍을 파싱한다", () => {
    const filePath = writeTempEnvFile("FOO=bar\nBAZ=qux\n");
    expect(parseEnvFile(filePath)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("주석과 빈 줄을 무시한다", () => {
    const filePath = writeTempEnvFile("# comment\nFOO=bar\n\n# another\nBAZ=qux\n");
    expect(parseEnvFile(filePath)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("값에 등호가 포함되어도 첫 번째 등호만 구분자로 쓴다", () => {
    const filePath = writeTempEnvFile("DATABASE_URL=postgres://a:b@c/d?x=1\n");
    expect(parseEnvFile(filePath)).toEqual({ DATABASE_URL: "postgres://a:b@c/d?x=1" });
  });

  it("파일이 없으면 빈 객체를 반환한다", () => {
    expect(parseEnvFile("/nonexistent/.env.local")).toEqual({});
  });
});
