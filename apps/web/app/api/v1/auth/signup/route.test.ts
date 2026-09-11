import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();

vi.mock("../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../lib/db", () => ({ withRequestScope }));

describe("POST /api/v1/auth/signup", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
  });

  it("로그인하지 않은 요청은 401 UNAUTHENTICATED를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ orgName: "예시테크", displayName: "홍길동" }),
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(withRequestScope).not.toHaveBeenCalled();
  });

  it("orgName이 누락되면 422 VALIDATION_ERROR를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      emailVerified: false,
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ displayName: "홍길동" }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("정상 요청이면 조직을 생성하고 201과 organizationId를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      emailVerified: true,
    });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({
        query: vi.fn().mockResolvedValue({
          rows: [{ create_organization_with_owner: "org-1" }],
        }),
      } as never)
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ orgName: "예시테크", displayName: "홍길동" }),
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toEqual({ organizationId: "org-1", role: "OWNER" });
    expect(withRequestScope).toHaveBeenCalledWith({ userId: "user-1" }, expect.any(Function));
  });
});
