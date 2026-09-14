// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const question = {
  id: "question-1",
  questionText: "2025년 매출액은 얼마입니까?",
  category: "FINANCE",
  priority: "HIGH",
  evidenceStatus: "UNANSWERED",
  reviewStatus: null,
  answerVersionId: null,
  assigneeDisplayName: null,
};

const answeredQuestion = {
  id: "question-2",
  questionText: "영업이익은 얼마입니까?",
  category: "FINANCE",
  priority: "MEDIUM",
  evidenceStatus: "SUPPORTED",
  reviewStatus: "DRAFT",
  answerVersionId: "answer-2",
  assigneeDisplayName: null,
};

const orgMembers = [{ userId: "user-2", displayName: "김검토" }];

describe("QuestionsTable", () => {
  afterEach(cleanup);

  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }));
  });

  it("VIEWER(canManage=false)는 체크박스와 대량행동 바를 볼 수 없다", async () => {
    const { QuestionsTable } = await import("./questions-table");
    render(
      <QuestionsTable
        projectId="project-1"
        questions={[question]}
        canManage={false}
        orgMembers={[]}
      />
    );

    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("행을 선택하면 대량행동 바가 나타나고, 선택 해제하면 사라진다", async () => {
    const { QuestionsTable } = await import("./questions-table");
    render(
      <QuestionsTable
        projectId="project-1"
        questions={[question]}
        canManage={true}
        orgMembers={orgMembers}
      />
    );

    expect(screen.queryByText(/건 선택됨/)).toBeNull();
    const rowCheckbox = screen.getByRole("checkbox", { name: `${question.questionText} 선택` });
    fireEvent.click(rowCheckbox);

    expect(screen.getByText("1건 선택됨")).toBeTruthy();

    fireEvent.click(rowCheckbox);
    expect(screen.queryByText(/건 선택됨/)).toBeNull();
  });

  it(
    "답변 생성 버튼은 선택된 질문마다 answer-jobs를 POST한다",
    async () => {
      const { QuestionsTable } = await import("./questions-table");
      render(
        <QuestionsTable
          projectId="project-1"
          questions={[question, answeredQuestion]}
          canManage={true}
          orgMembers={orgMembers}
        />
      );

      fireEvent.click(screen.getByRole("checkbox", { name: "전체 선택" }));
      fireEvent.click(screen.getByRole("button", { name: "답변 생성" }));

      await waitFor(() => {
        expect(screen.getByText(/답변 생성 작업 시작: 성공 2건/)).toBeTruthy();
      });
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/projects/project-1/questions/question-1/answer-jobs",
        expect.objectContaining({ method: "POST" })
      );
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/projects/project-1/questions/question-2/answer-jobs",
        expect.objectContaining({ method: "POST" })
      );
      expect(refresh).toHaveBeenCalled();
    },
    15000
  );

  it(
    "검토 요청은 답변이 있는 질문만 대상으로 하고, 나머지는 건너뛴다",
    async () => {
      const { QuestionsTable } = await import("./questions-table");
      render(
        <QuestionsTable
          projectId="project-1"
          questions={[question, answeredQuestion]}
          canManage={true}
          orgMembers={orgMembers}
        />
      );

      fireEvent.click(screen.getByRole("checkbox", { name: "전체 선택" }));
      fireEvent.click(screen.getByRole("button", { name: "검토 요청" }));

      await waitFor(() => {
        expect(screen.getByText(/검토 요청: 성공 1건 \(답변이 없는 1건은 제외됨\)/)).toBeTruthy();
      });
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/answer-versions/answer-2/review-request",
        expect.objectContaining({ method: "POST" })
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
    15000
  );

  it("내보내기 버튼은 비활성화되어 있다 (Milestone 4)", async () => {
    const { QuestionsTable } = await import("./questions-table");
    render(
      <QuestionsTable
        projectId="project-1"
        questions={[question]}
        canManage={true}
        orgMembers={orgMembers}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "전체 선택" }));

    expect((screen.getByRole("button", { name: "내보내기" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
