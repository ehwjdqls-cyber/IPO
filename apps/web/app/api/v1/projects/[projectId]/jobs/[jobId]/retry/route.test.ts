import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ projectId: "project-1", jobId: "job-1" }) };

const jobRow = {
  id: "job-1",
  organization_id: "org-1",
  project_id: "project-1",
  type: "DOCUMENT_PROCESS",
  status: "FAILED",
  input: { documentId: "doc-1" },
};

function makeRequest(headers: Record<string, string> = { "Idempotency-Key": "key-1" }) {
  return new Request("http://localhost/x", { method: "POST", headers });
}

describe("POST /api/v1/projects/{projectId}/jobs/{jobId}/retry", () => {
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

  it("존재하지 않는 작업은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(404);
  });

  it("VIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [jobRow] }) } as never)
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
      fn({ query: vi.fn().mockResolvedValue({ rows: [jobRow] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest({}), ctx);

    expect(response.status).toBe(422);
  });

  it("FAILED 상태가 아니면 409를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [{ ...jobRow, status: "RUNNING" }] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(409);
  });

  it("EDITOR 이상은 FAILED 작업을 동일 입력으로 재생성할 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [jobRow] })
      .mockResolvedValueOnce({ rows: [{ id: "job-2", status: "QUEUED" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("job-2");
    expect(body.data.status).toBe("QUEUED");
    const insertCall = query.mock.calls[1]!;
    expect(insertCall[0]).toContain("insert into jobs");
    expect(insertCall[1]).toEqual([
      "org-1",
      "project-1",
      "DOCUMENT_PROCESS",
      "key-1",
      JSON.stringify({ documentId: "doc-1" }),
      "user-1",
    ]);
  });

  it("동일한 Idempotency-Key로 재요청하면 새 job을 만들지 않고 기존 job을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [jobRow] })
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce({ rows: [{ id: "job-existing", status: "QUEUED" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("job-existing");
  });
});
