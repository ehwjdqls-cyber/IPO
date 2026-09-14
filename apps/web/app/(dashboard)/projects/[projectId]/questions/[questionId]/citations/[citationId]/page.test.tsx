import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  getAuthenticatedUser,
  findProjectById,
  getMembership,
  findCitationDetail,
  listCitationIdsForQuestion,
  createPresignedDownloadUrl,
  notFound,
} = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  findProjectById: vi.fn(),
  getMembership: vi.fn(),
  findCitationDetail: vi.fn(),
  listCitationIdsForQuestion: vi.fn(),
  createPresignedDownloadUrl: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("../../../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../../../../lib/queries/citations", () => ({
  findCitationDetail,
  listCitationIdsForQuestion,
}));
vi.mock("../../../../../../../../lib/storage", () => ({ createPresignedDownloadUrl }));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ refresh: vi.fn() }) }));

const project = { id: "project-1", organizationId: "org-1", companyNameKo: "예시회사" };

const citation = {
  id: "citation-1",
  organizationId: "org-1",
  pageNumber: 42,
  quoteText: "매출액 12,000백만원",
  verdict: "SUPPORTS",
  bbox: null,
  document: {
    id: "doc-1",
    filename: "감사보고서.pdf",
    version: 1,
    storageKey: "org-1/project-1/doc-1.pdf",
    mediaType: "application/pdf",
  },
  claim: { id: "claim-1", claimText: "2025년 매출액은 120억원입니다." },
};

function makeParams() {
  return {
    params: Promise.resolve({
      projectId: "project-1",
      questionId: "question-1",
      citationId: "citation-1",
    }),
  };
}

describe("S12 근거 전체화면 뷰어", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findProjectById.mockReset();
    getMembership.mockReset();
    findCitationDetail.mockReset();
    listCitationIdsForQuestion.mockReset();
    createPresignedDownloadUrl.mockReset();
    notFound.mockClear();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(project);
    listCitationIdsForQuestion.mockResolvedValue(["citation-1"]);
    createPresignedDownloadUrl.mockResolvedValue("https://storage.example.com/signed");
  });

  it("멤버가 아니면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue(null);
    const { default: CitationViewerPage } = await import("./page");

    await expect(CitationViewerPage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("citation을 찾을 수 없으면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findCitationDetail.mockResolvedValue(null);
    const { default: CitationViewerPage } = await import("./page");

    await expect(CitationViewerPage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("다른 조직의 citation이면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findCitationDetail.mockResolvedValue({ ...citation, organizationId: "other-org" });
    const { default: CitationViewerPage } = await import("./page");

    await expect(CitationViewerPage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("PDF 문서는 #page= 프래그먼트가 붙은 뷰어 URL을 사용한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findCitationDetail.mockResolvedValue(citation);
    const { default: CitationViewerPage } = await import("./page");

    const result = await CitationViewerPage(makeParams());

    const findIframe = (node: unknown, seen = new WeakSet<object>()): { src?: string } | null => {
      if (!node || typeof node !== "object") return null;
      if (seen.has(node as object)) return null;
      seen.add(node as object);
      const typed = node as { type?: unknown; props?: { src?: string; children?: unknown } };
      if (typed.type === "iframe") return { src: typed.props?.src };
      const children = typed.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findIframe(child, seen);
          if (found) return found;
        }
        return null;
      }
      return findIframe(children, seen);
    };

    const iframe = findIframe(result);
    expect(iframe?.src).toBe("https://storage.example.com/signed#page=42");
    expect(createPresignedDownloadUrl).toHaveBeenCalledWith("org-1/project-1/doc-1.pdf");
  });

  it("인용문과 연결된 주장, verdict를 표시한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findCitationDetail.mockResolvedValue(citation);
    const { default: CitationViewerPage } = await import("./page");

    const result = await CitationViewerPage(makeParams());

    const collectText = (node: unknown, seen = new WeakSet<object>()): string => {
      if (node == null || typeof node === "boolean") return "";
      if (typeof node === "string" || typeof node === "number") return String(node);
      if (Array.isArray(node)) return node.map((n) => collectText(n, seen)).join("");
      if (typeof node !== "object") return "";
      if (seen.has(node as object)) return "";
      seen.add(node as object);
      const children = (node as { props?: { children?: unknown } }).props?.children;
      return collectText(children, seen);
    };
    const text = collectText(result);
    expect(text).toContain("2025년 매출액은 120억원입니다.");
    expect(text).toContain("매출액 12,000백만원");
    expect(text).toContain("지지");
  });
});
