import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();
const findProjectById = vi.fn();
const createPresignedUploadUrl = vi.fn();

vi.mock("../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../../../lib/storage", () => ({ createPresignedUploadUrl }));

const ctx = { params: Promise.resolve({ projectId: "project-1" }) };

const validBody = {
  filename: "감사보고서.pdf",
  mediaType: "application/pdf",
  byteSize: 8_240_501,
  sha256: "a".repeat(64),
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/v1/projects/{projectId}/uploads", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
    findProjectById.mockReset();
    createPresignedUploadUrl.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 프로젝트는 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(404);
  });

  it("VIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(403);
    expect(withRequestScope).not.toHaveBeenCalled();
  });

  it("허용되지 않은 파일 형식은 422를 반환한다 (UNSUPPORTED_TYPE)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ ...validBody, mediaType: "image/png" }), ctx);

    expect(response.status).toBe(422);
  });

  it("50MB 초과 파일은 422를 반환한다 (FILE_TOO_LARGE)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ ...validBody, byteSize: 52_428_801 }), ctx);

    expect(response.status).toBe(422);
  });

  it("동일 SHA-256 문서가 이미 있으면 409를 반환한다 (중복 경고)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: "existing-doc", version: 1 }] }),
      } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(409);
  });

  it("EDITOR 이상이 유효한 요청을 보내면 201과 presigned URL을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    createPresignedUploadUrl.mockResolvedValue("https://storage.example.com/signed-put-url");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // 중복 검사: 없음
      .mockResolvedValueOnce({ rows: [{ id: "doc-1" }] }); // insert 결과
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.documentId).toBe("doc-1");
    expect(body.data.uploadId).toBe("doc-1");
    expect(body.data.putUrl).toBe("https://storage.example.com/signed-put-url");
    expect(body.data.requiredHeaders).toEqual({ "Content-Type": "application/pdf" });
  });

  it("allowDuplicate=true면 중복이어도 새 버전을 생성한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    createPresignedUploadUrl.mockResolvedValue("https://storage.example.com/signed-put-url");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "existing-doc", version: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "doc-2" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ ...validBody, allowDuplicate: true }), ctx);

    expect(response.status).toBe(201);
  });
});
