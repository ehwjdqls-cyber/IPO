import { describe, expect, it, vi, beforeEach } from "vitest";

const { getAuthenticatedUser, findProjectById, getMembership, listQuestionsWithKpi, listActiveOrgMembers, notFound } =
  vi.hoisted(() => ({
    getAuthenticatedUser: vi.fn(),
    findProjectById: vi.fn(),
    getMembership: vi.fn(),
    listQuestionsWithKpi: vi.fn(),
    listActiveOrgMembers: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("../../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../../lib/queries/projects", () => ({ findProjectById }));
vi.mock("../../../../../lib/membership", () => ({ getMembership }));
vi.mock("../../../../../lib/queries/questions", () => ({ listQuestionsWithKpi }));
vi.mock("../../../../../lib/queries/organizations", () => ({ listActiveOrgMembers }));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const project = { id: "project-1", organizationId: "org-1", companyNameKo: "예시회사" };
const emptyKpi = { total: 0, unanswered: 0, needsEvidence: 0, conflict: 0, needsReview: 0, approved: 0 };

function makeParams(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ projectId: "project-1" }),
    searchParams: Promise.resolve(query),
  };
}

/** Recursively collects text content from a React element tree, skipping
 * any object already visited to stay safe against the circular references
 * Radix primitives (e.g. Select) carry internally -- JSON.stringify can't
 * handle those, but this walk only follows `props.children`. */
function collectText(node: unknown, seen = new WeakSet<object>()): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => collectText(n, seen)).join("");
  if (typeof node !== "object") return "";
  if (seen.has(node as object)) return "";
  seen.add(node as object);
  const children = (node as { props?: { children?: unknown } }).props?.children;
  return collectText(children, seen);
}

function findNode(
  node: unknown,
  predicate: (n: { type?: unknown; props?: Record<string, unknown> }) => boolean,
  seen = new WeakSet<object>()
): { type?: unknown; props?: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  if (seen.has(node as object)) return null;
  seen.add(node as object);
  const typed = node as { type?: unknown; props?: Record<string, unknown> };
  if (predicate(typed)) return typed;
  const children = typed.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findNode(child, predicate, seen);
      if (found) return found;
    }
    return null;
  }
  return findNode(children, predicate, seen);
}

describe("S10 Q&A 목록", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findProjectById.mockReset();
    getMembership.mockReset();
    listQuestionsWithKpi.mockReset();
    listActiveOrgMembers.mockReset();
    notFound.mockClear();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    findProjectById.mockResolvedValue(project);
    listActiveOrgMembers.mockResolvedValue([]);
  });

  it("멤버가 아니면 notFound를 호출한다", async () => {
    getMembership.mockResolvedValue(null);
    const { default: QuestionsPage } = await import("./page");

    await expect(QuestionsPage(makeParams())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("질문이 없으면 빈 상태 문구를 보여준다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    listQuestionsWithKpi.mockResolvedValue({ kpi: emptyKpi, questions: [] });
    const { default: QuestionsPage } = await import("./page");

    const result = await QuestionsPage(makeParams());

    expect(collectText(result)).toContain("조건에 맞는 질문이 없습니다");
  });

  it("KPI 값을 표시한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    listQuestionsWithKpi.mockResolvedValue({
      kpi: { total: 5, unanswered: 1, needsEvidence: 2, conflict: 1, needsReview: 1, approved: 0 },
      questions: [],
    });
    const { default: QuestionsPage } = await import("./page");

    const result = await QuestionsPage(makeParams());

    const text = collectText(result);
    expect(text).toContain("전체");
    expect(text).toContain("충돌");
    expect(text).toContain("5");
  });

  it("질문 목록을 QuestionsTable에 전달한다 (실제 렌더링/링크 검증은 questions-table.test.tsx)", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    const question = {
      id: "question-1",
      organizationId: "org-1",
      projectId: "project-1",
      category: "FINANCE",
      questionText: "2025년 매출액은 얼마입니까?",
      rationale: "근거",
      priority: "HIGH",
      followUpQuestions: [],
      sourceJobId: null,
      assignedTo: null,
      assigneeDisplayName: null,
      createdBy: "user-1",
      createdAt: "2026-09-11T00:00:00Z",
      updatedAt: "2026-09-11T00:00:00Z",
      answerVersionId: null,
      evidenceStatus: "UNANSWERED",
      reviewStatus: null,
    };
    listQuestionsWithKpi.mockResolvedValue({ kpi: emptyKpi, questions: [question] });
    const { default: QuestionsPage } = await import("./page");
    const { QuestionsTable } = await import("./questions-table");

    const result = await QuestionsPage(makeParams());

    const table = findNode(result, (n) => n.type === QuestionsTable);
    expect(table?.props?.questions).toEqual([question]);
    expect(table?.props?.projectId).toBe("project-1");
    expect(table?.props?.canManage).toBe(false);
  });

  it("EDITOR 이상은 canManage=true와 조직 멤버 목록을 QuestionsTable에 전달한다", async () => {
    getMembership.mockResolvedValue({ role: "EDITOR" });
    listActiveOrgMembers.mockResolvedValue([{ userId: "user-2", displayName: "김검토", role: "REVIEWER" }]);
    listQuestionsWithKpi.mockResolvedValue({
      kpi: emptyKpi,
      questions: [
        {
          id: "question-1",
          organizationId: "org-1",
          projectId: "project-1",
          category: "FINANCE",
          questionText: "질문",
          rationale: "근거",
          priority: "HIGH",
          followUpQuestions: [],
          sourceJobId: null,
          assignedTo: null,
          assigneeDisplayName: null,
          createdBy: "user-1",
          createdAt: "2026-09-11T00:00:00Z",
          updatedAt: "2026-09-11T00:00:00Z",
          answerVersionId: null,
          evidenceStatus: "UNANSWERED",
          reviewStatus: null,
        },
      ],
    });
    const { default: QuestionsPage } = await import("./page");
    const { QuestionsTable } = await import("./questions-table");

    const result = await QuestionsPage(makeParams());

    const table = findNode(result, (n) => n.type === QuestionsTable);
    expect(table?.props?.canManage).toBe(true);
    expect(table?.props?.orgMembers).toEqual([{ userId: "user-2", displayName: "김검토", role: "REVIEWER" }]);
    expect(listActiveOrgMembers).toHaveBeenCalledWith("user-1", "org-1");
  });

  it("VIEWER는 listActiveOrgMembers를 호출하지 않는다 (불필요한 조회 방지)", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    listQuestionsWithKpi.mockResolvedValue({ kpi: emptyKpi, questions: [] });
    const { default: QuestionsPage } = await import("./page");

    await QuestionsPage(makeParams());

    expect(listActiveOrgMembers).not.toHaveBeenCalled();
  });

  it("잘못된 쿼리 파라미터는 무시하고 필터 없이 조회한다", async () => {
    getMembership.mockResolvedValue({ role: "VIEWER" });
    listQuestionsWithKpi.mockResolvedValue({ kpi: emptyKpi, questions: [] });
    const { default: QuestionsPage } = await import("./page");

    await QuestionsPage(makeParams({ category: "LEGAL" }));

    expect(listQuestionsWithKpi).toHaveBeenCalledWith("user-1", "org-1", "project-1", {});
  });
});
