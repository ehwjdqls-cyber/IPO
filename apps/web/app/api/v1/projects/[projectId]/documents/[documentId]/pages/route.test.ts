import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ projectId: "project-1", documentId: "doc-1" }) };

const documentRow = { id: "doc-1", organization_id: "org-1", project_id: "project-1" };

const pageRow = {
  id: "page-1",
  document_id: "doc-1",
  page_number: 1,
  extracted_text: "본문 내용",
  extraction_confidence: "0.9800",
  excluded: false,
  created_at: "2026-09-11T00:00:00Z",
};

describe("GET /api/v1/projects/{projectId}/documents/{documentId}/pages", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 문서는 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(404);
  });

  it("조직 멤버가 아니면 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [documentRow] }) } as never)
    );
    getMembership.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(403);
  });

  it("VIEWER도 페이지 목록을 조회할 수 있고 페이지 번호순으로 정렬된다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [pageRow] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].pageNumber).toBe(1);
    expect(query.mock.calls[1]![0]).toContain("order by page_number");
  });
});
