import { describe, expect, it, vi, beforeEach } from "vitest";
import { UploadForm } from "./upload-form";

const { getAuthenticatedUser, findProjectById, getMembership, listDocuments, notFound } = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  findProjectById: vi.fn(),
  getMembership: vi.fn(),
  listDocuments: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../lib/queries/documents", () => ({ listDocuments }));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ refresh: vi.fn() }) }));

const project = { id: "project-1", organizationId: "org-1", companyNameKo: "예시회사" };

describe("S06 문서 센터", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findProjectById.mockReset();
    getMembership.mockReset();
    listDocuments.mockReset();
    notFound.mockClear();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(project);
  });

  it("멤버가 아니면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue(null);
    listDocuments.mockResolvedValue([]);
    const { default: DocumentsPage } = await import("./page");

    await expect(DocumentsPage({ params: Promise.resolve({ projectId: "project-1" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("문서가 없으면 빈 상태 문구를 보여준다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    listDocuments.mockResolvedValue([]);
    const { default: DocumentsPage } = await import("./page");

    const result = await DocumentsPage({ params: Promise.resolve({ projectId: "project-1" }) });

    expect(JSON.stringify(result)).toContain("아직 업로드된 문서가 없습니다");
  });

  it("VIEWER 역할은 업로드 폼을 볼 수 없다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    listDocuments.mockResolvedValue([]);
    const { default: DocumentsPage } = await import("./page");

    const result = await DocumentsPage({ params: Promise.resolve({ projectId: "project-1" }) });

    const containsUploadForm = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return false;
      if ((node as { type?: unknown }).type === UploadForm) return true;
      const children = (node as { props?: { children?: unknown } }).props?.children;
      if (Array.isArray(children)) return children.some(containsUploadForm);
      return containsUploadForm(children);
    };
    expect(containsUploadForm(result)).toBe(false);
  });

  it("EDITOR 이상 역할은 업로드 폼을 볼 수 있다", async () => {
    getMembership.mockResolvedValue({ role: "EDITOR" });
    listDocuments.mockResolvedValue([]);
    const { default: DocumentsPage } = await import("./page");

    const result = await DocumentsPage({ params: Promise.resolve({ projectId: "project-1" }) });

    const containsUploadForm = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return false;
      if ((node as { type?: unknown }).type === UploadForm) return true;
      const children = (node as { props?: { children?: unknown } }).props?.children;
      if (Array.isArray(children)) return children.some(containsUploadForm);
      return containsUploadForm(children);
    };
    expect(containsUploadForm(result)).toBe(true);
  });
});
