import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validEnv: Record<string, string> = {
  APP_URL: "https://app.example.com",
  DATABASE_URL: "postgres://user:pass@localhost:5432/ipo",
  AUTH_SECRET: "a".repeat(32),
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
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

describe("apps/web env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...validEnv, NODE_ENV: "test" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("유효한 .env 값이 있으면 getServerEnv가 파싱된 값을 반환한다", async () => {
    const { getServerEnv } = await import("./env");
    expect(getServerEnv().DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it("필수 값이 누락되면 getServerEnv 호출 시 즉시 throw한다 (fail-fast)", async () => {
    process.env = { NODE_ENV: "test" };
    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).toThrow();
  });

  it("getPublicEnv는 NEXT_PUBLIC_ 값만으로 파싱된다", async () => {
    const { getPublicEnv } = await import("./env");
    expect(getPublicEnv().NEXT_PUBLIC_APP_URL).toBe(validEnv.NEXT_PUBLIC_APP_URL);
  });
});
