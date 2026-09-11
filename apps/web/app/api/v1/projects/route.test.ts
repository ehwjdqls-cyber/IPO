import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();
const getMembership = vi.fn();

vi.mock("../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../lib/db", () => ({ withRequestScope }));
vi.mock("../../../../lib/membership", () => ({ getMembership }));

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

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

describe("GET /api/v1/projects", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("로그인하지 않은 요청은 401을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest("http://localhost/api/v1/projects?organizationId=org-1"));

    expect(response.status).toBe(401);
  });

  it("organizationId가 없으면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    const { GET } = await import("./route");

    const response = await GET(makeRequest("http://localhost/api/v1/projects"));

    expect(response.status).toBe(422);
  });

  it("해당 조직 멤버가 아니면 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(makeRequest("http://localhost/api/v1/projects?organizationId=org-1"));

    expect(response.status).toBe(403);
  });

  it("멤버면 프로젝트 목록을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [projectRow] }) } as never)
    );
    const { GET } = await import("./route");

    const response = await GET(makeRequest("http://localhost/api/v1/projects?organizationId=org-1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.projects[0].id).toBe("project-1");
  });
});

describe("POST /api/v1/projects", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
    getMembership.mockReset();
  });

  it("VIEWER 역할은 403을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest("http://localhost/api/v1/projects?organizationId=org-1", {
        method: "POST",
        body: JSON.stringify({
          name: "예시테크 IPO 2027",
          companyNameKo: "주식회사 예시테크",
          industry: "B2B SaaS",
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(withRequestScope).not.toHaveBeenCalled();
  });

  it("필수값이 누락되면 422를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest("http://localhost/api/v1/projects?organizationId=org-1", {
        method: "POST",
        body: JSON.stringify({ name: "예시테크 IPO 2027" }),
      })
    );

    expect(response.status).toBe(422);
  });

  it("EDITOR 이상이면 201과 생성된 프로젝트를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [projectRow] }) } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest("http://localhost/api/v1/projects?organizationId=org-1", {
        method: "POST",
        body: JSON.stringify({
          name: "예시테크 IPO 2027",
          companyNameKo: "주식회사 예시테크",
          industry: "B2B SaaS",
        }),
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe("project-1");
  });

  it("이름이 중복되면 409 CONFLICT를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    getMembership.mockResolvedValue({ role: "EDITOR" });
    withRequestScope.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest("http://localhost/api/v1/projects?organizationId=org-1", {
        method: "POST",
        body: JSON.stringify({
          name: "예시테크 IPO 2027",
          companyNameKo: "주식회사 예시테크",
          industry: "B2B SaaS",
        }),
      })
    );

    expect(response.status).toBe(409);
  });
});
