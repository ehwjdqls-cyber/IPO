import { describe, expect, it, vi, beforeEach } from "vitest";

const getAuthenticatedUser = vi.fn();
const withRequestScope = vi.fn();

vi.mock("../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../lib/db", () => ({ withRequestScope }));

describe("GET /api/v1/me", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    withRequestScope.mockReset();
  });

  it("로그인하지 않은 요청은 401 UNAUTHENTICATED를 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(withRequestScope).not.toHaveBeenCalled();
  });

  it("사용자와 소속 조직·역할 목록을 반환한다", async () => {
    getAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      emailVerified: true,
    });
    withRequestScope.mockImplementation(async (_scope, fn) =>
      fn({
        query: vi.fn().mockResolvedValue({
          rows: [
            { organization_id: "org-1", organization_name: "예시테크", role: "OWNER" },
          ],
        }),
      } as never)
    );
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.user).toEqual({
      id: "user-1",
      email: "a@example.com",
      emailVerified: true,
    });
    expect(body.data.organizations).toEqual([
      { id: "org-1", name: "예시테크", role: "OWNER" },
    ]);
    expect(withRequestScope).toHaveBeenCalledWith({ userId: "user-1" }, expect.any(Function));
  });
});
