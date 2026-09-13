import { describe, expect, it } from "vitest";
import {
  completeUploadRequestSchema,
  createUploadRequestSchema,
  updateDocumentPageRequestSchema,
} from "./documents";

describe("createUploadRequestSchema", () => {
  const valid = {
    filename: "감사보고서.pdf",
    mediaType: "application/pdf",
    byteSize: 8_240_501,
    sha256: "a".repeat(64),
  };

  it("유효한 요청은 통과한다", () => {
    expect(createUploadRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("허용되지 않은 MIME 타입은 거부한다 (UNSUPPORTED_TYPE)", () => {
    const result = createUploadRequestSchema.safeParse({ ...valid, mediaType: "image/png" });
    expect(result.success).toBe(false);
  });

  it("50MB를 초과하면 거부한다 (FILE_TOO_LARGE)", () => {
    const result = createUploadRequestSchema.safeParse({ ...valid, byteSize: 52_428_801 });
    expect(result.success).toBe(false);
  });

  it("byteSize가 0 이하면 거부한다", () => {
    const result = createUploadRequestSchema.safeParse({ ...valid, byteSize: 0 });
    expect(result.success).toBe(false);
  });

  it("sha256이 64자리 16진수가 아니면 거부한다", () => {
    const result = createUploadRequestSchema.safeParse({ ...valid, sha256: "not-a-hash" });
    expect(result.success).toBe(false);
  });

  it("filename이 비어있으면 거부한다", () => {
    const result = createUploadRequestSchema.safeParse({ ...valid, filename: "" });
    expect(result.success).toBe(false);
  });

  it("allowDuplicate는 선택값이다", () => {
    const result = createUploadRequestSchema.safeParse({ ...valid, allowDuplicate: true });
    expect(result.success).toBe(true);
  });
});

describe("completeUploadRequestSchema", () => {
  it("유효한 요청은 통과한다", () => {
    const result = completeUploadRequestSchema.safeParse({
      sha256: "b".repeat(64),
      byteSize: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("sha256 누락 시 거부한다", () => {
    const result = completeUploadRequestSchema.safeParse({ byteSize: 1024 });
    expect(result.success).toBe(false);
  });
});

describe("updateDocumentPageRequestSchema", () => {
  it("excluded=true는 통과한다", () => {
    expect(updateDocumentPageRequestSchema.safeParse({ excluded: true }).success).toBe(true);
  });

  it("excluded=false는 통과한다", () => {
    expect(updateDocumentPageRequestSchema.safeParse({ excluded: false }).success).toBe(true);
  });

  it("excluded가 boolean이 아니면 거부한다", () => {
    const result = updateDocumentPageRequestSchema.safeParse({ excluded: "true" });
    expect(result.success).toBe(false);
  });

  it("excluded가 없으면 거부한다", () => {
    const result = updateDocumentPageRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
