import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  getAuthenticatedUser,
  findProjectById,
  getMembership,
  findQuestionWorkspaceData,
  listQuestionsForWorkspaceNav,
  notFound,
} = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  findProjectById: vi.fn(),
  getMembership: vi.fn(),
  findQuestionWorkspaceData: vi.fn(),
  listQuestionsForWorkspaceNav: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("../../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../../lib/queries/questions", () => ({
  findQuestionWorkspaceData,
  listQuestionsForWorkspaceNav,
}));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const project = { id: "project-1", organizationId: "org-1", companyNameKo: "예시회사" };

const question = {
  id: "question-1",
  organizationId: "org-1",
  projectId: "project-1",
  category: "FINANCE",
  questionText: "2025년 매출액은 얼마입니까?",
  rationale: "재무 실사 근거",
  priority: "HIGH",
  followUpQuestions: ["전년 대비 증감율은?"],
  sourceJobId: null,
  assignedTo: null,
  createdBy: "user-1",
  createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-11T00:00:00Z",
};

function makeParams() {
  return { params: Promise.resolve({ projectId: "project-1", questionId: "question-1" }) };
}

describe("S11 Q&A 워크스페이스", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findProjectById.mockReset();
    getMembership.mockReset();
    findQuestionWorkspaceData.mockReset();
    listQuestionsForWorkspaceNav.mockReset();
    notFound.mockClear();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(project);
    listQuestionsForWorkspaceNav.mockResolvedValue([
      { ...question, answerVersionId: null, evidenceStatus: "UNANSWERED", reviewStatus: null },
    ]);
  });

  it("멤버가 아니면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue(null);
    const { default: QuestionWorkspacePage } = await import("./page");

    await expect(QuestionWorkspacePage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("질문을 찾을 수 없으면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findQuestionWorkspaceData.mockResolvedValue(null);
    const { default: QuestionWorkspacePage } = await import("./page");

    await expect(QuestionWorkspacePage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("다른 프로젝트에 속한 질문이면 notFound를 호출한다 (IDOR 방지)", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findQuestionWorkspaceData.mockResolvedValue({
      question: { ...question, projectId: "other-project" },
      answerVersion: null,
    });
    const { default: QuestionWorkspacePage } = await import("./page");

    await expect(QuestionWorkspacePage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("답변이 없으면 답변 생성 버튼을 보여준다 (EDITOR 이상)", async () => {
    getMembership.mockResolvedValue({ role: "EDITOR" });
    findQuestionWorkspaceData.mockResolvedValue({ question, answerVersion: null });
    const { default: QuestionWorkspacePage } = await import("./page");
    const { GenerateAnswerButton } = await import("./generate-answer-button");

    const result = await QuestionWorkspacePage(makeParams());

    const containsType = (node: unknown, type: unknown, seen = new WeakSet<object>()): boolean => {
      if (!node || typeof node !== "object") return false;
      if (seen.has(node as object)) return false;
      seen.add(node as object);
      if ((node as { type?: unknown }).type === type) return true;
      const children = (node as { props?: { children?: unknown } }).props?.children;
      if (Array.isArray(children)) return children.some((c) => containsType(c, type, seen));
      return containsType(children, type, seen);
    };
    expect(containsType(result, GenerateAnswerButton)).toBe(true);
  });

  it("VIEWER는 답변이 없을 때 생성 버튼을 볼 수 없다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    findQuestionWorkspaceData.mockResolvedValue({ question, answerVersion: null });
    const { default: QuestionWorkspacePage } = await import("./page");
    const { GenerateAnswerButton } = await import("./generate-answer-button");

    const result = await QuestionWorkspacePage(makeParams());

    const containsType = (node: unknown, type: unknown, seen = new WeakSet<object>()): boolean => {
      if (!node || typeof node !== "object") return false;
      if (seen.has(node as object)) return false;
      seen.add(node as object);
      if ((node as { type?: unknown }).type === type) return true;
      const children = (node as { props?: { children?: unknown } }).props?.children;
      if (Array.isArray(children)) return children.some((c) => containsType(c, type, seen));
      return containsType(children, type, seen);
    };
    expect(containsType(result, GenerateAnswerButton)).toBe(false);
  });

  it("답변이 있으면 편집기와 근거 카드를 보여준다", async () => {
    getMembership.mockResolvedValue({ role: "EDITOR" });
    const citation = {
      id: "citation-1",
      claimId: "claim-1",
      chunkId: "chunk-1",
      quoteText: "매출액 12,000백만원",
      pageNumber: 42,
      relevanceScore: 0.9,
      verdict: "SUPPORTS",
    };
    findQuestionWorkspaceData.mockResolvedValue({
      question,
      answerVersion: {
        id: "answer-1",
        questionId: "question-1",
        version: 1,
        bodyMarkdown: "당사의 매출은...",
        source: "AI",
        evidenceStatus: "SUPPORTED",
        reviewStatus: "DRAFT",
        modelSnapshot: "gpt",
        promptVersion: "v1",
        createdBy: "user-1",
        createdAt: "2026-09-11T00:00:00Z",
        claims: [
          {
            id: "claim-1",
            claimIndex: 0,
            claimText: "2025년 매출액은 120억원입니다.",
            isFactual: true,
            evidenceStatus: "SUPPORTED",
            citations: [citation],
          },
        ],
      },
    });
    const { default: QuestionWorkspacePage } = await import("./page");

    const result = await QuestionWorkspacePage(makeParams());

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
    expect(text).toContain("42쪽");
  });

  it("근거상태가 CONFLICT면 경고 배너를 보여준다", async () => {
    getMembership.mockResolvedValue({ role: "EDITOR" });
    findQuestionWorkspaceData.mockResolvedValue({
      question,
      answerVersion: {
        id: "answer-1",
        questionId: "question-1",
        version: 1,
        bodyMarkdown: "본문",
        source: "AI",
        evidenceStatus: "CONFLICT",
        reviewStatus: "DRAFT",
        modelSnapshot: "gpt",
        promptVersion: "v1",
        createdBy: "user-1",
        createdAt: "2026-09-11T00:00:00Z",
        claims: [],
      },
    });
    const { default: QuestionWorkspacePage } = await import("./page");

    const result = await QuestionWorkspacePage(makeParams());

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
    expect(collectText(result)).toContain("상충합니다");
  });
});
