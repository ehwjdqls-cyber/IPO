import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ projectId: "project-1", questionId: "question-1" }) };

const questionRow = {
  id: "question-1",
  organization_id: "org-1",
  project_id: "project-1",
  category: "FINANCE",
  question_text: "질문",
  rationale: "근거",
  priority: "HIGH",
  follow_up_questions: [],
  source_job_id: null,
  assigned_to: null,
  created_by: "user-1",
  created_at: "2026-09-11T00:00:00Z",
  updated_at: "2026-09-11T00:00:00Z",
};

const answerVersionRow = {
  id: "answer-1",
  question_id: "question-1",
  version: 1,
  body_markdown: "답변",
  source: "AI",
  evidence_status: "SUPPORTED",
  review_status: "DRAFT",
  model_snapshot: "gpt",
  prompt_version: "grounded-answer-ko-v1.0.0",
  retrieval_set_hash: "hash",
  created_by: "user-1",
  created_at: "2026-09-11T00:00:00Z",
};

const claimRow = {
  id: "claim-1",
  answer_version_id: "answer-1",
  claim_index: 0,
  claim_text: "주장",
  is_factual: true,
  evidence_status: "SUPPORTED",
};

const citationRow = {
  id: "citation-1",
  claim_id: "claim-1",
  chunk_id: "chunk-1",
  quote_text: "인용",
  page_number: 3,
  relevance_score: "0.9",
  verdict: "SUPPORTS",
};

function makeRequest(body?: unknown) {
  return new Request("http://localhost/x", {
    method: body ? "PATCH" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function mockQueries(responses: Array<{ rows: unknown[] }>) {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
  return query;
}

describe("GET /api/v1/projects/{projectId}/questions/{questionId}", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 질문은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [] }]);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("다른 프로젝트에 속한 질문은 404를 반환한다 (IDOR 방지)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [{ ...questionRow, project_id: "other-project" }] }]);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("조직 멤버가 아니면 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [questionRow] }]);
    getMembership.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(403);
  });

  it("질문 + 최신 답변 버전 + 주장 + 인용을 함께 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    mockQueries([
      { rows: [questionRow] },
      { rows: [answerVersionRow] },
      { rows: [claimRow] },
      { rows: [citationRow] },
    ]);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.question.id).toBe("question-1");
    expect(body.data.answerVersion.id).toBe("answer-1");
    expect(body.data.answerVersion.claims).toHaveLength(1);
    expect(body.data.answerVersion.claims[0].citations).toHaveLength(1);
    expect(body.data.answerVersion.claims[0].citations[0].chunkId).toBe("chunk-1");
  });

  it("답변 버전이 없으면 answerVersion은 null이다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    mockQueries([{ rows: [questionRow] }, { rows: [] }]);
    const { GET } = await import("./route");

    const response = await GET(makeRequest(), ctx);

    const body = await response.json();
    expect(body.data.answerVersion).toBeNull();
  });
});

describe("PATCH /api/v1/projects/{projectId}/questions/{questionId}", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { PATCH } = await import("./route");

    const response = await PATCH(makeRequest({ priority: "HIGH" }), ctx);

    expect(response.status).toBe(401);
  });

  it("VIEWER는 수정할 수 없다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [questionRow] }]);
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { PATCH } = await import("./route");

    const response = await PATCH(makeRequest({ priority: "HIGH" }), ctx);

    expect(response.status).toBe(403);
  });

  it("잘못된 요청 본문은 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [questionRow] }]);
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { PATCH } = await import("./route");

    const response = await PATCH(makeRequest({}), ctx);

    expect(response.status).toBe(422);
  });

  it("존재하지 않는 질문은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [] }]);
    const { PATCH } = await import("./route");

    const response = await PATCH(makeRequest({ priority: "HIGH" }), ctx);

    expect(response.status).toBe(404);
  });

  it("EDITOR 이상은 priority/assignedTo를 수정할 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    mockQueries([{ rows: [questionRow] }, { rows: [{ ...questionRow, priority: "CRITICAL" }] }]);
    const { PATCH } = await import("./route");

    const response = await PATCH(makeRequest({ priority: "CRITICAL" }), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.priority).toBe("CRITICAL");
  });
});
