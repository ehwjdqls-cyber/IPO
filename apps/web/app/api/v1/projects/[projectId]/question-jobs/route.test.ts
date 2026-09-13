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

const DOC_UUID_1 = "59d6f8f8-6b23-4b14-93ec-b330e49297eb";
const DOC_UUID_2 = "e10d6a96-d740-44a2-8f4c-21adfb0fa6ae";

function makeRequest(body: unknown, headers: Record<string, string> = { "Idempotency-Key": "key-1" }) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = { categories: ["FINANCE"], questionCount: 20, depth: "STANDARD" };

describe("POST /api/v1/projects/{projectId}/question-jobs", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
    findProjectById.mockReset();
    findProjectById.mockResolvedValue(project);
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 프로젝트는 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(404);
  });

  it("VIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(403);
  });

  it("Idempotency-Key 헤더가 없으면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody, {}), ctx);

    expect(response.status).toBe(422);
  });

  it("입력값이 유효하지 않으면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ categories: [] }), ctx);

    expect(response.status).toBe(422);
  });

  it("documentIds를 지정하지 않으면 프로젝트의 READY 문서 전체를 사용한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "doc-1" }, { id: "doc-2" }] }) // ready documents lookup
      .mockResolvedValueOnce({ rows: [{ id: "job-1", status: "QUEUED" }] }); // insert job
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe("job-1");
    const insertCall = query.mock.calls[1]!;
    const input = JSON.parse(insertCall[1][3]);
    expect(input.documentIds).toEqual(["doc-1", "doc-2"]);
  });

  it("READY 문서가 하나도 없으면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody), ctx);

    expect(response.status).toBe(422);
  });

  it("documentIds를 지정하면 해당 문서만 사용하고 존재/READY 여부를 검증한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "doc-1" }] }) // documents matching id+READY
      .mockResolvedValueOnce({ rows: [{ id: "job-1", status: "QUEUED" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest({ ...validBody, documentIds: [DOC_UUID_1] }),
      ctx
    );

    expect(response.status).toBe(201);
  });

  it("지정한 documentIds 중 READY가 아니거나 존재하지 않는 문서가 있으면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [{ id: DOC_UUID_1 }] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest({ ...validBody, documentIds: [DOC_UUID_1, DOC_UUID_2] }),
      ctx
    );

    expect(response.status).toBe(422);
  });

  it("동일한 Idempotency-Key로 재요청하면 기존 job을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: DOC_UUID_1 }] })
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce({ rows: [{ id: "job-existing", status: "QUEUED" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest({ ...validBody, documentIds: [DOC_UUID_1] }),
      ctx
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe("job-existing");
  });
});
