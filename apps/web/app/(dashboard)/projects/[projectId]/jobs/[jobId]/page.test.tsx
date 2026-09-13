import { describe, expect, it, vi, beforeEach } from "vitest";
import { JobProgressView } from "./job-progress-view";

const { getAuthenticatedUser, findProjectById, getMembership, findJobById, notFound } = vi.hoisted(
  () => ({
    getAuthenticatedUser: vi.fn(),
    findProjectById: vi.fn(),
    getMembership: vi.fn(),
    findJobById: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  })
);

vi.mock("../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../../lib/queries/jobs", () => ({ findJobById }));
vi.mock("next/navigation", () => ({ notFound }));

const project = { id: "project-1", organizationId: "org-1", companyNameKo: "예시회사" };
const job = {
  id: "job-1",
  organizationId: "org-1",
  type: "DOCUMENT_PROCESS",
  status: "RUNNING",
  progress: 40,
  errorCode: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
  createdAt: "2026-09-11T00:00:00Z",
};

const params = Promise.resolve({ projectId: "project-1", jobId: "job-1" });

describe("S09 작업 진행", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findProjectById.mockReset();
    getMembership.mockReset();
    findJobById.mockReset();
    notFound.mockClear();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(project);
    findJobById.mockResolvedValue(job);
  });

  it("멤버가 아니면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue(null);
    const { default: JobPage } = await import("./page");

    await expect(JobPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("작업을 찾을 수 없으면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findJobById.mockResolvedValue(null);
    const { default: JobPage } = await import("./page");

    await expect(JobPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("VIEWER 역할도 진행 상황을 볼 수 있다 (관리 권한 없음)", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { default: JobPage } = await import("./page");

    const result = await JobPage({ params });

    const findNode = (node: unknown): { type?: unknown; props?: Record<string, unknown> } | null => {
      if (!node || typeof node !== "object") return null;
      const typed = node as { type?: unknown; props?: { children?: unknown } };
      if (typed.type === JobProgressView) return typed as { type: unknown; props: Record<string, unknown> };
      const children = typed.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findNode(child);
          if (found) return found;
        }
        return null;
      }
      return findNode(children);
    };
    const view = findNode(result);
    expect(view?.props?.canManage).toBe(false);
  });

  it("EDITOR 이상 역할은 관리 권한을 받는다", async () => {
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { default: JobPage } = await import("./page");

    const result = await JobPage({ params });

    const findNode = (node: unknown): { type?: unknown; props?: Record<string, unknown> } | null => {
      if (!node || typeof node !== "object") return null;
      const typed = node as { type?: unknown; props?: { children?: unknown } };
      if (typed.type === JobProgressView) return typed as { type: unknown; props: Record<string, unknown> };
      const children = typed.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findNode(child);
          if (found) return found;
        }
        return null;
      }
      return findNode(children);
    };
    const view = findNode(result);
    expect(view?.props?.canManage).toBe(true);
  });
});
