// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import { criticalViolations } from "../../../../test/axe";

const { getAuthenticatedUser, findProjectById, listDocuments, notFound } = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  findProjectById: vi.fn(),
  listDocuments: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../lib/queries/documents", () => ({ listDocuments }));
vi.mock("next/navigation", () => ({ notFound }));

const project = {
  id: "project-1",
  organizationId: "org-1",
  companyNameKo: "예시회사",
  targetMarket: "KOSDAQ",
  targetFilingDate: "2027-03-31",
};

const params = Promise.resolve({ projectId: "project-1" });

describe("S05 프로젝트 대시보드 접근성", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findProjectById.mockReset();
    listDocuments.mockReset();
    notFound.mockClear();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(project);
  });

  it("문서가 없는 빈 상태에서 axe 위반이 없다", async () => {
    listDocuments.mockResolvedValue([]);
    const { default: ProjectDashboardPage } = await import("./page");

    const { container } = render(await ProjectDashboardPage({ params }));
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });

  it("문서가 있는 상태에서 axe 위반이 없다", async () => {
    listDocuments.mockResolvedValue([
      { id: "doc-1", status: "READY" },
      { id: "doc-2", status: "FAILED" },
    ]);
    const { default: ProjectDashboardPage } = await import("./page");

    const { container } = render(await ProjectDashboardPage({ params }));
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });
});
