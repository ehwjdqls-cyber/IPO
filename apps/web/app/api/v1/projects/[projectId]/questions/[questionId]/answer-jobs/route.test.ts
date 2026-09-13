import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ projectId: "project-1", questionId: "question-1" }) };

const questionRow = {
  id: "question-1",
  organization_id: "org-1",
  project_id: "project-1",
  category: "FINANCE",
  question_text: "2025년 매출은 얼마입니까?",
};

function makeRequest(body: unknown = {}, headers: Record<string, string> = { "Idempotency-Key": "key-1" }) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/projects/{projectId}/questions/{questionId}/answer-jobs", () => {
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

  it("존재하지 않는 질문은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("URL의 projectId와 질문의 project_id가 다르면 404를 반환한다 (IDOR 방지)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({
        query: vi.fn().mockResolvedValue({ rows: [{ ...questionRow, project_id: "other-project" }] }),
      } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("VIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [questionRow] }) } as never)
    );
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(403);
  });

  it("Idempotency-Key 헤더가 없으면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [questionRow] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest({}, {}), ctx);

    expect(response.status).toBe(422);
  });

  it("입력값이 유효하지 않으면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [questionRow] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ style: "CASUAL" }), ctx);

    expect(response.status).toBe(422);
  });

  it("EDITOR 이상이면 ANSWER_GENERATE job을 생성한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [questionRow] }) // question lookup
      .mockResolvedValueOnce({ rows: [{ id: "job-1", status: "QUEUED" }] }); // insert job
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe("job-1");
    const insertCall = query.mock.calls[1]!;
    expect(insertCall[0]).toContain("insert into jobs");
    const input = JSON.parse(insertCall[1][3]);
    expect(input.questionId).toBe("question-1");
    expect(input.style).toBe("CFO_CONCISE");
    expect(input.maxClaims).toBe(12);
  });

  it("동일한 Idempotency-Key로 재요청하면 기존 job을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [questionRow] })
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce({ rows: [{ id: "job-existing", status: "QUEUED" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe("job-existing");
  });
});
