import { describe, expect, it, vi, beforeEach } from "vitest";
import Link from "next/link";
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

  it("파일명이 문서 상세 페이지로 가는 링크다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    listDocuments.mockResolvedValue([
      { id: "doc-1", originalFilename: "감사보고서.pdf", mediaType: "application/pdf", version: 1, pageCount: 3, status: "READY", failureMessage: null, createdAt: "2026-09-11T00:00:00Z" },
    ]);
    const { default: DocumentsPage } = await import("./page");

    const result = await DocumentsPage({ params: Promise.resolve({ projectId: "project-1" }) });

    const findFilenameLink = (node: unknown): { href?: string; text?: unknown } | null => {
      if (!node || typeof node !== "object") return null;
      const typed = node as { type?: unknown; props?: { href?: string; children?: unknown } };
      if (typed.type === Link && typed.props?.href?.toString().includes("/documents/doc-1")) {
        return { href: typed.props.href, text: typed.props.children };
      }
      const children = typed.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findFilenameLink(child);
          if (found) return found;
        }
        return null;
      }
      return findFilenameLink(children);
    };

    const link = findFilenameLink(result);
    expect(link?.href).toBe("/projects/project-1/documents/doc-1");
    expect(link?.text).toBe("감사보고서.pdf");
  });
});
