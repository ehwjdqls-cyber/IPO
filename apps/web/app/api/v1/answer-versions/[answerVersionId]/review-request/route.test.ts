import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ answerVersionId: "answer-1" }) };

function answerVersionJoinRow(reviewStatus: string) {
  return { id: "answer-1", organization_id: "org-1", review_status: reviewStatus };
}

function makeRequest() {
  return new Request("http://localhost/x", { method: "POST" });
}

function mockQueries(responses: Array<{ rows: unknown[] }>) {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
  return query;
}

describe("POST /api/v1/answer-versions/{answerVersionId}/review-request", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 답변 버전은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [] }]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("조직 멤버가 아니면 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [answerVersionJoinRow("DRAFT")] }]);
    getMembership.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(403);
  });

  it("VIEWER/REVIEWER는 검토를 요청할 수 없다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [answerVersionJoinRow("DRAFT")] }]);
    getMembership.mockResolvedValue({ role: "REVIEWER" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(403);
  });

  it("이미 검토 대기/승인 상태면 409를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [answerVersionJoinRow("NEEDS_REVIEW")] }]);
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(409);
  });

  it("EDITOR+는 DRAFT/REJECTED 상태에서 검토를 요청할 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    mockQueries([
      { rows: [answerVersionJoinRow("DRAFT")] },
      { rows: [{ id: "answer-1", review_status: "NEEDS_REVIEW" }] },
    ]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.reviewStatus).toBe("NEEDS_REVIEW");
  });
});
