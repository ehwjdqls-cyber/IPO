import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../../../../lib/membership", () => ({ getMembership }));

const ctx = { params: Promise.resolve({ projectId: "project-1", jobId: "job-1" }) };

const jobRow = { id: "job-1", organization_id: "org-1", status: "RUNNING" };

describe("POST /api/v1/projects/{projectId}/jobs/{jobId}/cancel", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 작업은 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(404);
  });

  it("VIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [jobRow] }) } as never)
    );
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(403);
  });

  it("이미 종료된 작업(SUCCEEDED)은 409를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [{ ...jobRow, status: "SUCCEEDED" }] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(409);
  });

  it("EDITOR 이상은 QUEUED/RUNNING 작업을 취소할 수 있다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [jobRow] })
      .mockResolvedValueOnce({ rows: [{ ...jobRow, status: "CANCELLED" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("CANCELLED");
  });
});
