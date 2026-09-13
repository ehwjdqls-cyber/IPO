// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { JobProgressView, type JobSnapshot } from "./job-progress-view";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const baseJob: JobSnapshot = {
  id: "job-1",
  type: "DOCUMENT_PROCESS",
  status: "RUNNING",
  progress: 40,
  errorCode: null,
  errorMessage: null,
  startedAt: "2026-09-11T00:00:00Z",
  finishedAt: null,
  createdAt: "2026-09-11T00:00:00Z",
};

describe("JobProgressView", () => {
  afterEach(cleanup);

  beforeEach(() => {
    push.mockReset();
  });

  it(
    "진행 중인 작업은 취소 버튼을 보여준다",
    () => {
      render(<JobProgressView projectId="project-1" initialJob={baseJob} canManage={true} />);

      expect(screen.getByRole("button", { name: "취소" })).not.toBeNull();
      expect(screen.queryByRole("button", { name: "재시도" })).toBeNull();
    },
    15000
  );

  it(
    "권한이 없으면 취소/재시도 버튼을 볼 수 없다",
    () => {
      render(<JobProgressView projectId="project-1" initialJob={baseJob} canManage={false} />);

      expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    },
    15000
  );

  it(
    "실패한 작업은 재시도 버튼을 보여주고 취소 버튼은 숨긴다",
    () => {
      render(
        <JobProgressView
          projectId="project-1"
          initialJob={{ ...baseJob, status: "FAILED", errorMessage: "추출 실패" }}
          canManage={true}
        />
      );

      expect(screen.getByRole("button", { name: "재시도" })).not.toBeNull();
      expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
      expect(screen.getByText("추출 실패")).not.toBeNull();
    },
    15000
  );

  it(
    "취소 버튼을 누르면 상태가 취소됨으로 바뀐다",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "CANCELLED" } }) })
      );
      render(<JobProgressView projectId="project-1" initialJob={baseJob} canManage={true} />);

      fireEvent.click(screen.getByRole("button", { name: "취소" }));

      await waitFor(() => {
        expect(screen.getByText("취소됨")).not.toBeNull();
      });
      expect(fetch).toHaveBeenCalledWith("/api/v1/projects/project-1/jobs/job-1/cancel", {
        method: "POST",
      });
    },
    15000
  );

  it(
    "재시도 버튼을 누르면 새 작업 페이지로 이동한다",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({ ok: true, json: async () => ({ data: { id: "job-2", status: "QUEUED" } }) })
      );
      render(
        <JobProgressView
          projectId="project-1"
          initialJob={{ ...baseJob, status: "FAILED" }}
          canManage={true}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "재시도" }));

      await waitFor(() => {
        expect(push).toHaveBeenCalledWith("/projects/project-1/jobs/job-2");
      });
    },
    15000
  );
});
