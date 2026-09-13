import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ projectId: "project-1", jobId: "job-1" }) };

const jobRow = {
  id: "job-1",
  organization_id: "org-1",
  project_id: "project-1",
  type: "DOCUMENT_PROCESS",
  status: "RUNNING",
  progress: 40,
  error_code: null,
  error_message: null,
  started_at: "2026-09-11T00:00:00Z",
  finished_at: null,
  created_at: "2026-09-11T00:00:00Z",
};

describe("GET /api/v1/projects/{projectId}/jobs/{jobId}", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 작업은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(404);
  });

  it("조직 멤버가 아니면 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [jobRow] }) } as never)
    );
    getMembership.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(403);
  });

  it("VIEWER도 작업 상태를 조회할 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [jobRow] }) } as never)
    );
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("job-1");
    expect(body.data.progress).toBe(40);
  });
});
