// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import { criticalViolations } from "../../../test/axe";

const { getAuthenticatedUser, listMemberships, listProjects } = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  listMemberships: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../lib/queries/organizations", () => ({ listMemberships }));
vi.mock("../../../lib/queries/projects", () => ({ listProjects }));

describe("S03 프로젝트 목록 접근성", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    listMemberships.mockReset();
    listProjects.mockReset();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  });

  it("빈 상태에서 axe 위반이 없다", async () => {
    listMemberships.mockResolvedValue([{ id: "org-1", name: "예시조직", role: "EDITOR" }]);
    listProjects.mockResolvedValue([]);
    const { default: ProjectsPage } = await import("./page");

    const { container } = render(await ProjectsPage());
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });

  it("목록 상태에서 axe 위반이 없다", async () => {
    listMemberships.mockResolvedValue([{ id: "org-1", name: "예시조직", role: "EDITOR" }]);
    listProjects.mockResolvedValue([
      {
        id: "project-1",
        companyNameKo: "예시회사",
        targetMarket: "KOSDAQ",
        targetFilingDate: "2027-03-31",
        status: "ACTIVE",
      },
    ]);
    const { default: ProjectsPage } = await import("./page");

    const { container } = render(await ProjectsPage());
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });
});
