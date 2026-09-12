import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  getServerEnv: () => ({
    OBJECT_STORAGE_ENDPOINT: "https://storage.example.com",
    OBJECT_STORAGE_REGION: "auto",
    OBJECT_STORAGE_BUCKET: "ipo-proof-documents",
    OBJECT_STORAGE_ACCESS_KEY_ID: "test-access-key",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
  }),
}));

describe("createPresignedUploadUrl", () => {
  it("버킷·키가 포함된 서명된 PUT URL을 반환한다", async () => {
    const { createPresignedUploadUrl } = await import("./storage");

    const url = await createPresignedUploadUrl(
      "org-1/project-1/document-1/report.pdf",
      "application/pdf"
    );

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://storage.example.com");
    expect(parsed.pathname).toBe("/ipo-proof-documents/org-1/project-1/document-1/report.pdf");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("만료시간(초)이 X-Amz-Expires에 반영된다", async () => {
    const { createPresignedUploadUrl } = await import("./storage");

    const url = await createPresignedUploadUrl("k", "application/pdf", 600);

    const parsed = new URL(url);
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("600");
  });
});
