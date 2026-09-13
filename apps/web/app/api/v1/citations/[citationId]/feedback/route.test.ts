import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ citationId: "citation-1" }) };

const citationJoinRow = { id: "citation-1", organization_id: "org-1" };

function makeRequest(body: unknown) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockQueries(responses: Array<{ rows: unknown[] }>) {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
  return query;
}

describe("POST /api/v1/citations/{citationId}/feedback", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ feedback: "ACCURATE" }), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 citation은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [] }]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ feedback: "ACCURATE" }), ctx);

    expect(response.status).toBe(404);
  });

  it("조직 멤버가 아니면 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [citationJoinRow] }]);
    getMembership.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ feedback: "ACCURATE" }), ctx);

    expect(response.status).toBe(403);
  });

  it("잘못된 요청 본문은 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [citationJoinRow] }]);
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ feedback: "MAYBE" }), ctx);

    expect(response.status).toBe(422);
  });

  it("VIEWER도 피드백을 남길 수 있다 (role 무관)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([
      { rows: [citationJoinRow] },
      {
        rows: [
          {
            id: "feedback-1",
            feedback: "INSUFFICIENT",
            comment: "페이지가 다릅니다",
            created_at: "2026-09-14T00:00:00Z",
          },
        ],
      },
    ]);
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest({ feedback: "INSUFFICIENT", comment: "페이지가 다릅니다" }),
      ctx
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe("feedback-1");
    expect(body.data.feedback).toBe("INSUFFICIENT");
  });
});
