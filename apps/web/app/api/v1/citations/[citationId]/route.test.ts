import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();
const createPresignedDownloadUrl = vi.fn();

vi.mock("../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../lib/storage", () => ({ createPresignedDownloadUrl }));

const ctx = { params: Promise.resolve({ citationId: "citation-1" }) };

const citationJoinRow = {
  id: "citation-1",
  organization_id: "org-1",
  page_number: 42,
  quote_text: "매출액 12,000백만원",
  verdict: "SUPPORTS",
  bbox: { x: 0.12, y: 0.31, width: 0.54, height: 0.06 },
  document_id: "doc-1",
  original_filename: "감사보고서.pdf",
  version: 1,
  storage_key: "org-1/project-1/doc-1.pdf",
};

function makeRequest() {
  return new Request("http://localhost/x");
}

function mockQueries(responses: Array<{ rows: unknown[] }>) {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
  return query;
}

describe("GET /api/v1/citations/{citationId}", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
    createPresignedDownloadUrl.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 citation은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [] }]);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("조직 멤버가 아니면 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [citationJoinRow] }]);
    getMembership.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(403);
  });

  it("VIEWER도 citation과 뷰어 URL을 조회할 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [citationJoinRow] }]);
    getMembership.mockResolvedValue({ role: "VIEWER" });
    createPresignedDownloadUrl.mockResolvedValue("https://storage.example.com/signed");
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("citation-1");
    expect(body.data.document).toEqual({ id: "doc-1", filename: "감사보고서.pdf", version: 1 });
    expect(body.data.pageNumber).toBe(42);
    expect(body.data.quoteText).toBe("매출액 12,000백만원");
    expect(body.data.bbox).toEqual({ x: 0.12, y: 0.31, width: 0.54, height: 0.06 });
    expect(body.data.verdict).toBe("SUPPORTS");
    expect(body.data.viewerUrl).toBe("https://storage.example.com/signed");
    expect(createPresignedDownloadUrl).toHaveBeenCalledWith("org-1/project-1/doc-1.pdf");
  });

  it("bbox가 없으면 null을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [{ ...citationJoinRow, bbox: null }] }]);
    getMembership.mockResolvedValue({ role: "VIEWER" });
    createPresignedDownloadUrl.mockResolvedValue("https://storage.example.com/signed");
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    const body = await response.json();
    expect(body.data.bbox).toBeNull();
  });
});
