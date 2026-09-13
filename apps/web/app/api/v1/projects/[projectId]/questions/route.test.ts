import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();
const findProjectById = vi.fn();

vi.mock("../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../../lib/queries/projects", () => ({ findProjectById }));

const ctx = { params: Promise.resolve({ projectId: "project-1" }) };

const project = { id: "project-1", organizationId: "org-1" };

const kpiRow = {
  total: "5",
  unanswered: "1",
  needs_evidence: "1",
  conflict: "1",
  needs_review: "1",
  approved: "1",
};

const listRow = {
  id: "question-1",
  category: "FINANCE",
  question_text: "질문",
  priority: "HIGH",
  assigned_to: null,
  created_at: "2026-09-11T00:00:00Z",
  answer_version_id: "answer-1",
  evidence_status: "CONFLICT",
  review_status: "NEEDS_REVIEW",
};

function makeRequest(query = "") {
  return new Request(`http://localhost/x${query}`);
}

describe("GET /api/v1/projects/{projectId}/questions", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
    findProjectById.mockReset();
    findProjectById.mockResolvedValue(project);
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 프로젝트는 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("조직 멤버가 아니면 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(403);
  });

  it("잘못된 쿼리 파라미터는 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { GET } = await import("./route");

    const response = await GET(makeRequest("?category=LEGAL"), ctx);

    expect(response.status).toBe(422);
  });

  it("VIEWER도 목록과 KPI를 조회할 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [kpiRow] })
      .mockResolvedValueOnce({ rows: [listRow] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.kpi).toEqual({
      total: 5,
      unanswered: 1,
      needsEvidence: 1,
      conflict: 1,
      needsReview: 1,
      approved: 1,
    });
    expect(body.data.questions).toHaveLength(1);
    expect(body.data.questions[0].id).toBe("question-1");
    expect(body.data.questions[0].evidenceStatus).toBe("CONFLICT");
  });

  it("답변이 없는 질문은 evidenceStatus가 UNANSWERED로 표시된다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const unansweredRow = { ...listRow, answer_version_id: null, evidence_status: null, review_status: null };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [kpiRow] })
      .mockResolvedValueOnce({ rows: [unansweredRow] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    const body = await response.json();
    expect(body.data.questions[0].evidenceStatus).toBe("UNANSWERED");
  });

  it("필터 쿼리 파라미터를 SQL 조건으로 전달한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [kpiRow] })
      .mockResolvedValueOnce({ rows: [] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { GET } = await import("./route");

    await GET(makeRequest("?category=FINANCE&priority=HIGH&search=매출"), ctx);

    const listCall = query.mock.calls[1]!;
    expect(listCall[0]).toContain("q.category = ");
    expect(listCall[0]).toContain("q.priority = ");
    expect(listCall[0]).toContain("ilike");
    expect(listCall[1]).toContain("FINANCE");
    expect(listCall[1]).toContain("HIGH");
  });
});
