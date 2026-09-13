// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("DocumentRowActions", () => {
  afterEach(cleanup);

  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { url: "https://storage.example.com/signed", filename: "a.pdf" } }),
      })
    );
    vi.stubGlobal("open", vi.fn());
  });

  it(
    "미리보기 버튼은 상세 페이지로 이동한다",
    async () => {
      const { DocumentRowActions } = await import("./document-row-actions");
      render(<DocumentRowActions projectId="project-1" documentId="doc-1" />);

      fireEvent.click(screen.getByRole("button", { name: "미리보기" }));

      expect(push).toHaveBeenCalledWith("/projects/project-1/documents/doc-1");
    },
    15000
  );

  it(
    "다운로드 버튼은 서명된 URL을 받아 새 창으로 연다",
    async () => {
      const { DocumentRowActions } = await import("./document-row-actions");
      render(<DocumentRowActions projectId="project-1" documentId="doc-1" />);

      fireEvent.click(screen.getByRole("button", { name: "다운로드" }));

      await waitFor(() => {
        expect(window.open).toHaveBeenCalledWith("https://storage.example.com/signed", "_blank");
      });
      expect(fetch).toHaveBeenCalledWith("/api/v1/projects/project-1/documents/doc-1/download");
    },
    15000
  );
});
