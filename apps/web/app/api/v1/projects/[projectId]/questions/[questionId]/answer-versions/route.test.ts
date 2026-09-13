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

const citationId = "4d78a53d-66f4-4b44-b768-d66eb6ed957e";
const existingCitationRow = {
  id: citationId,
  claim_id: "old-claim-1",
  chunk_id: "chunk-1",
  quote_text: "매출액 12,000백만원",
  page_number: 42,
  relevance_score: "0.92",
  verdict: "SUPPORTS",
};

const validClaim = {
  claimIndex: 0,
  claimText: "2025년 매출액은 120억원입니다.",
  isFactual: true,
  citationIds: [citationId],
};

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

describe("POST /api/v1/projects/{projectId}/questions/{questionId}/answer-versions", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ baseVersion: 0, bodyMarkdown: "본문", claims: [validClaim] }), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 질문은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [] }]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ baseVersion: 0, bodyMarkdown: "본문", claims: [validClaim] }), ctx);

    expect(response.status).toBe(404);
  });

  it("다른 프로젝트에 속한 질문은 404를 반환한다 (IDOR 방지)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [{ ...questionRow, project_id: "other-project" }] }]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ baseVersion: 0, bodyMarkdown: "본문", claims: [validClaim] }), ctx);

    expect(response.status).toBe(404);
  });

  it("VIEWER는 저장할 수 없다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [questionRow] }]);
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ baseVersion: 0, bodyMarkdown: "본문", claims: [validClaim] }), ctx);

    expect(response.status).toBe(403);
  });

  it("잘못된 요청 본문은 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockQueries([{ rows: [questionRow] }]);
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ baseVersion: 0, bodyMarkdown: "", claims: [] }), ctx);

    expect(response.status).toBe(422);
  });

  it("baseVersion이 최신 버전과 다르면 409와 최신 버전을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    mockQueries([{ rows: [questionRow] }, { rows: [{ max: "3" }] }]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ baseVersion: 2, bodyMarkdown: "본문", claims: [validClaim] }), ctx);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.details.latestVersion).toBe(3);
  });

  it("존재하지 않는 citationId를 참조하면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    mockQueries([{ rows: [questionRow] }, { rows: [{ max: "0" }] }, { rows: [] }]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ baseVersion: 0, bodyMarkdown: "본문", claims: [validClaim] }), ctx);

    expect(response.status).toBe(422);
  });

  it("EDITOR는 유효한 편집본을 저장할 수 있다 (새 answer_version + claims + citations)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const newAnswerVersionRow = {
      id: "answer-2",
      question_id: "question-1",
      version: 1,
      body_markdown: "본문",
      source: "USER",
      evidence_status: "SUPPORTED",
      review_status: "DRAFT",
      model_snapshot: null,
      prompt_version: null,
      retrieval_set_hash: null,
      created_by: "user-1",
      created_at: "2026-09-14T00:00:00Z",
    };
    const newClaimRow = {
      id: "new-claim-1",
      answer_version_id: "answer-2",
      claim_index: 0,
      claim_text: validClaim.claimText,
      is_factual: true,
      evidence_status: "SUPPORTED",
    };
    const newCitationRow = { ...existingCitationRow, id: "new-citation-1", claim_id: "new-claim-1" };

    mockQueries([
      { rows: [questionRow] },
      { rows: [{ max: "0" }] },
      { rows: [existingCitationRow] },
      { rows: [newAnswerVersionRow] },
      { rows: [newClaimRow] },
      { rows: [newCitationRow] },
    ]);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ baseVersion: 0, bodyMarkdown: "본문", claims: [validClaim] }), ctx);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.answerVersion.id).toBe("answer-2");
    expect(body.data.answerVersion.source).toBe("USER");
    expect(body.data.answerVersion.claims).toHaveLength(1);
    expect(body.data.answerVersion.claims[0].citations[0].chunkId).toBe("chunk-1");
  });
});
