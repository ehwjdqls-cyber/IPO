import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../../../../lib/membership", () => ({ getMembership }));

const ctx = {
  params: Promise.resolve({ projectId: "project-1", documentId: "doc-1", pageId: "page-1" }),
};

const documentRow = { id: "doc-1", organization_id: "org-1", project_id: "project-1" };

const pageRow = {
  id: "page-1",
  document_id: "doc-1",
  page_number: 1,
  extracted_text: "본문 내용",
  extraction_confidence: "0.9800",
  excluded: true,
  created_at: "2026-09-11T00:00:00Z",
};

function request(body: unknown) {
  return new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/projects/{projectId}/documents/{documentId}/pages/{pageId}", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { PATCH } = await import("./route");

    const response = await PATCH(request({ excluded: true }), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 문서는 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { PATCH } = await import("./route");

    const response = await PATCH(request({ excluded: true }), ctx);

    expect(response.status).toBe(404);
  });

  it("VIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [documentRow] }) } as never)
    );
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { PATCH } = await import("./route");

    const response = await PATCH(request({ excluded: true }), ctx);

    expect(response.status).toBe(403);
  });

  it("잘못된 입력값은 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [documentRow] }) } as never)
    );
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { PATCH } = await import("./route");

    const response = await PATCH(request({ excluded: "yes" }), ctx);

    expect(response.status).toBe(422);
  });

  it("EDITOR 이상은 페이지를 제외 처리할 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [pageRow] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { PATCH } = await import("./route");

    const response = await PATCH(request({ excluded: true }), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.excluded).toBe(true);
  });

  it("존재하지 않는 페이지는 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { PATCH } = await import("./route");

    const response = await PATCH(request({ excluded: true }), ctx);

    expect(response.status).toBe(404);
  });
});
