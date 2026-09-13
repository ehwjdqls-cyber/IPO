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

describe("POST /api/v1/answer-versions/{answerVersionId}/reviews", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ decision: "APPROVED" }), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 답변 버전은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [] }]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ decision: "APPROVED" }), ctx);

    expect(response.status).toBe(404);
  });

  it("EDITOR/VIEWER는 승인·반려할 수 없다 (REVIEWER+만 가능)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [answerVersionJoinRow("NEEDS_REVIEW")] }]);
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ decision: "APPROVED" }), ctx);

    expect(response.status).toBe(403);
  });

  it("잘못된 요청 본문은 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [answerVersionJoinRow("NEEDS_REVIEW")] }]);
    getMembership.mockResolvedValue({ role: "REVIEWER" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ decision: "MAYBE" }), ctx);

    expect(response.status).toBe(422);
  });

  it("검토 대기(NEEDS_REVIEW) 상태가 아니면 409를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [answerVersionJoinRow("DRAFT")] }]);
    getMembership.mockResolvedValue({ role: "REVIEWER" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ decision: "APPROVED" }), ctx);

    expect(response.status).toBe(409);
  });

  it("REVIEWER+는 승인·반려하고 reviews 기록을 남길 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "REVIEWER" });
    mockQueries([
      { rows: [answerVersionJoinRow("NEEDS_REVIEW")] },
      { rows: [{ id: "review-1", decision: "REJECTED", comment: "불일치", created_at: "2026-09-14T00:00:00Z" }] },
      { rows: [{ id: "answer-1", review_status: "REJECTED" }] },
    ]);
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest({ decision: "REJECTED", comment: "불일치" }),
      ctx
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.review.decision).toBe("REJECTED");
    expect(body.data.reviewStatus).toBe("REJECTED");
  });
});
