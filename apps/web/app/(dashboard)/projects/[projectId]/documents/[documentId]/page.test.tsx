import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReprocessButton } from "./reprocess-button";

const {
  getAuthenticatedUser,
  findProjectById,
  getMembership,
  findDocumentById,
  listDocumentPages,
  listDocumentJobs,
  createPresignedDownloadUrl,
  notFound,
} = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  findProjectById: vi.fn(),
  getMembership: vi.fn(),
  findDocumentById: vi.fn(),
  listDocumentPages: vi.fn(),
  listDocumentJobs: vi.fn(),
  createPresignedDownloadUrl: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../../lib/queries/documents", () => ({ findDocumentById }));
vi.mock("../../../../../../lib/queries/document-pages", () => ({ listDocumentPages }));
vi.mock("../../../../../../lib/queries/jobs", () => ({ listDocumentJobs }));
vi.mock("../../../../../../lib/storage", () => ({ createPresignedDownloadUrl }));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ refresh: vi.fn() }) }));

const project = { id: "project-1", organizationId: "org-1", companyNameKo: "예시회사" };
const document = {
  id: "doc-1",
  organizationId: "org-1",
  storageKey: "org-1/project-1/doc-1/report.pdf",
  originalFilename: "감사보고서.pdf",
  mediaType: "application/pdf",
  version: 1,
  pageCount: 1,
  status: "READY",
  failureCode: null,
  failureMessage: null,
  createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-11T00:00:00Z",
};

const params = Promise.resolve({ projectId: "project-1", documentId: "doc-1" });

describe("S07 문서 상세·추출 검증", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findProjectById.mockReset();
    getMembership.mockReset();
    findDocumentById.mockReset();
    listDocumentPages.mockReset();
    listDocumentJobs.mockReset();
    createPresignedDownloadUrl.mockReset();
    notFound.mockClear();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(project);
    findDocumentById.mockResolvedValue(document);
    listDocumentPages.mockResolvedValue([]);
    listDocumentJobs.mockResolvedValue([]);
    createPresignedDownloadUrl.mockResolvedValue("https://storage.example.com/signed");
  });

  it("멤버가 아니면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue(null);
    const { default: DocumentDetailPage } = await import("./page");

    await expect(DocumentDetailPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("문서를 찾을 수 없으면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findDocumentById.mockResolvedValue(null);
    const { default: DocumentDetailPage } = await import("./page");

    await expect(DocumentDetailPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("VIEWER 역할은 재처리 버튼을 볼 수 없다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { default: DocumentDetailPage } = await import("./page");

    const result = await DocumentDetailPage({ params });

    const contains = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return false;
      if ((node as { type?: unknown }).type === ReprocessButton) return true;
      const children = (node as { props?: { children?: unknown } }).props?.children;
      if (Array.isArray(children)) return children.some(contains);
      return contains(children);
    };
    expect(contains(result)).toBe(false);
  });

  it("EDITOR 이상 역할은 재처리 버튼을 볼 수 있다", async () => {
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { default: DocumentDetailPage } = await import("./page");

    const result = await DocumentDetailPage({ params });

    const contains = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return false;
      if ((node as { type?: unknown }).type === ReprocessButton) return true;
      const children = (node as { props?: { children?: unknown } }).props?.children;
      if (Array.isArray(children)) return children.some(contains);
      return contains(children);
    };
    expect(contains(result)).toBe(true);
  });

  it("PDF 문서는 서명된 다운로드 URL로 원문을 렌더링한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { default: DocumentDetailPage } = await import("./page");

    const result = await DocumentDetailPage({ params });

    const findIframeSrc = (node: unknown): string | undefined => {
      if (!node || typeof node !== "object") return undefined;
      const props = (node as { props?: { src?: string; children?: unknown } }).props;
      if ((node as { type?: unknown }).type === "iframe" && props?.src) return props.src;
      const children = props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findIframeSrc(child);
          if (found) return found;
        }
        return undefined;
      }
      return findIframeSrc(children);
    };
    expect(findIframeSrc(result)).toBe("https://storage.example.com/signed");
  });
});
