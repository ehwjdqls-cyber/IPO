import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ projectId: "project-1", documentId: "doc-1" }) };

const documentRow = {
  id: "doc-1",
  organization_id: "org-1",
  project_id: "project-1",
  original_filename: "감사보고서.pdf",
  storage_key: "org-1/project-1/doc-1/감사보고서.pdf",
  media_type: "application/pdf",
  byte_size: "1024",
  sha256: "a".repeat(64),
  version: 1,
  page_count: 3,
  status: "FAILED",
  failure_code: "EXTRACTION_FAILED",
  failure_message: "boom",
  uploaded_by: "user-1",
  created_at: "2026-09-11T00:00:00Z",
  updated_at: "2026-09-11T00:00:00Z",
  deleted_at: null,
};

describe("POST /api/v1/projects/{projectId}/documents/{documentId}/reprocess", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 문서는 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), ctx);

    expect(response.status).toBe(404);
  });

  it("VIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [documentRow] }) } as never)
    );
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), ctx);

    expect(response.status).toBe(403);
  });

  it("EDITOR 이상이면 문서를 SCANNING으로 되돌리고 새 job을 만든다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [documentRow] }) // findDocument
      .mockResolvedValueOnce({ rows: [{ ...documentRow, status: "SCANNING", failure_code: null }] }) // update
      .mockResolvedValueOnce({ rows: [{ id: "job-2", status: "QUEUED" }] }); // insert job
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x", { method: "POST" }), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.document.status).toBe("SCANNING");
    expect(body.data.job.id).toBe("job-2");
  });
});
