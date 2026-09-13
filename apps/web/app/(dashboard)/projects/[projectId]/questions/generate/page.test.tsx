import { describe, expect, it, vi, beforeEach } from "vitest";
import { AccessDenied } from "../../../../../../components/access-denied";
import { GenerateQuestionsForm } from "./generate-questions-form";

const { getAuthenticatedUser, findProjectById, getMembership, listDocuments, notFound } = vi.hoisted(
  () => ({
    getAuthenticatedUser: vi.fn(),
    findProjectById: vi.fn(),
    getMembership: vi.fn(),
    listDocuments: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  })
);

vi.mock("../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../../lib/queries/documents", () => ({ listDocuments }));
vi.mock("next/navigation", () => ({ notFound }));

const project = { id: "project-1", organizationId: "org-1", companyNameKo: "예시회사" };
const params = Promise.resolve({ projectId: "project-1" });

describe("S08 질문 생성 설정", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findProjectById.mockReset();
    getMembership.mockReset();
    listDocuments.mockReset();
    notFound.mockClear();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(project);
    listDocuments.mockResolvedValue([
      { id: "doc-1", originalFilename: "a.pdf", status: "READY" },
      { id: "doc-2", originalFilename: "b.pdf", status: "SCANNING" },
      { id: "doc-3", originalFilename: "c.pdf", status: "READY" },
    ]);
  });

  it("멤버가 아니면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue(null);
    const { default: GeneratePage } = await import("./page");

    await expect(GeneratePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("VIEWER 역할은 권한없음 화면을 본다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const { default: GeneratePage } = await import("./page");

    const result = await GeneratePage({ params });

    expect(result?.type).toBe(AccessDenied);
  });

  it("REVIEWER 역할도 권한없음 화면을 본다", async () => {
    getMembership.mockResolvedValue({ role: "REVIEWER" });
    const { default: GeneratePage } = await import("./page");

    const result = await GeneratePage({ params });

    expect(result?.type).toBe(AccessDenied);
  });

  it("EDITOR 이상 역할은 READY 문서만 골라서 폼에 전달한다", async () => {
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const { default: GeneratePage } = await import("./page");

    const result = await GeneratePage({ params });

    const findForm = (node: unknown): { readyDocuments: { id: string }[] } | null => {
      if (!node || typeof node !== "object") return null;
      const typed = node as { type?: unknown; props?: { children?: unknown; readyDocuments?: unknown } };
      if (typed.type === GenerateQuestionsForm) {
        return typed.props as { readyDocuments: { id: string }[] };
      }
      const children = typed.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findForm(child);
          if (found) return found;
        }
        return null;
      }
      return findForm(children);
    };

    const props = findForm(result);
    expect(props?.readyDocuments.map((d) => d.id)).toEqual(["doc-1", "doc-3"]);
  });
});
