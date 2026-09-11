import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../../lib/membership", () => ({ getMembership }));

const projectRow = {
  id: "project-1",
  organization_id: "org-1",
  name: "예시테크 IPO 2027",
  company_name_ko: "주식회사 예시테크",
  company_name_en: null,
  industry: "B2B SaaS",
  website_url: null,
  target_market: "UNDECIDED",
  target_filing_date: null,
  lead_underwriter: null,
  status: "ACTIVE",
  created_by: "user-1",
  created_at: "2026-09-11T00:00:00Z",
  updated_at: "2026-09-11T00:00:00Z",
};

const ctx = { params: Promise.resolve({ projectId: "project-1" }) };

describe("GET /api/v1/projects/{projectId}", () => {
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

  it("존재하지 않거나 접근권한이 없는 프로젝트는 404를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [] }) } as never)
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(404);
  });

  it("접근 가능한 프로젝트는 200과 상세를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [projectRow] }) } as never)
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("project-1");
  });
});

describe("PATCH /api/v1/projects/{projectId}", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("REVIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [projectRow] }) } as never)
    );
    getMembership.mockResolvedValue({ role: "REVIEWER" });
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ name: "새 이름" }) }),
      ctx
    );

    expect(response.status).toBe(403);
  });

  it("EDITOR 이상이면 수정된 프로젝트를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [{ ...projectRow, name: "새 이름" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ name: "새 이름" }) }),
      ctx
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("새 이름");
  });

  it("빈 body는 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [projectRow] }) } as never)
    );
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({}) }),
      ctx
    );

    expect(response.status).toBe(422);
  });
});

describe("DELETE /api/v1/projects/{projectId}", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("EDITOR 역할은 403을 반환한다 (ADMIN+만 삭제 요청 가능)", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [projectRow] }) } as never)
    );
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(403);
  });

  it("ADMIN 이상이면 status를 DELETING으로 변경한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "ADMIN" });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [{ ...projectRow, status: "DELETING" }] });
    withRequestScope.mockImplementation(async (_scope, fn) => fn({ query } as never));
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/x"), ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("DELETING");
  });
});
