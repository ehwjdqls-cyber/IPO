import { describe, expect, it } from "vitest";
import { parseServerEnv, parsePublicEnv, publicEnvSchema } from "./env";

const validServerEnv = {
  APP_URL: "https://app.example.com",
  DATABASE_URL: "postgres://user:pass@localhost:5432/ipo",
  AUTH_SECRET: "a".repeat(32),
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  OBJECT_STORAGE_ENDPOINT: "https://storage.example.com",
  OBJECT_STORAGE_REGION: "kr-standard",
  OBJECT_STORAGE_BUCKET: "ipo-proof-documents",
  OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
  OBJECT_STORAGE_KMS_KEY_ID: "kms-key",
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  QSTASH_TOKEN: "qstash-token",
  QSTASH_CURRENT_SIGNING_KEY: "current-signing-key",
  QSTASH_NEXT_SIGNING_KEY: "next-signing-key",
  AI_API_KEY: "ai-key",
  AI_GENERATION_MODEL_SNAPSHOT: "gpt-model-snapshot",
  AI_EMBEDDING_MODEL_SNAPSHOT: "embedding-model-snapshot",
  SENTRY_DSN: "https://sentry.example.com/1",
  AUDIT_HASH_PEPPER: "b".repeat(32),
};

const validPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
};

describe("parseServerEnv", () => {
  it("유효한 값이 모두 있으면 파싱에 성공한다", () => {
    expect(() => parseServerEnv(validServerEnv)).not.toThrow();
  });

  it("필수 서버 환경변수가 없으면 상세 오류와 함께 throw한다", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("DATABASE_URL이 postgres URL 형식이 아니면 실패한다", () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, DATABASE_URL: "not-a-url" })
    ).toThrow();
  });
});

describe("parsePublicEnv", () => {
  it("NEXT_PUBLIC_ 값만으로 파싱에 성공한다", () => {
    expect(() => parsePublicEnv(validPublicEnv)).not.toThrow();
  });

  it("필수 public 환경변수가 없으면 throw한다", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("publicEnvSchema", () => {
  it("서버 전용 시크릿 키는 public 스키마에 존재하지 않는다", () => {
    const publicKeys = Object.keys(publicEnvSchema.shape);
    expect(publicKeys).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(publicKeys).not.toContain("AUTH_SECRET");
    expect(publicKeys).not.toContain("DATABASE_URL");
    expect(publicKeys).not.toContain("AI_API_KEY");
    expect(publicKeys).not.toContain("AUDIT_HASH_PEPPER");
  });

  it("public 스키마의 모든 키는 NEXT_PUBLIC_ 접두사를 가진다", () => {
    const publicKeys = Object.keys(publicEnvSchema.shape);
    expect(publicKeys.length).toBeGreaterThan(0);
    for (const key of publicKeys) {
      expect(key.startsWith("NEXT_PUBLIC_")).toBe(true);
    }
  });
});
