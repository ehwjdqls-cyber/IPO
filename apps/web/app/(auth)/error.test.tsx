// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./error";

describe("인증 영역 오류 상태", () => {
  it("오류 메시지와 다시 시도 버튼을 보여준다", () => {
    const retry = vi.fn();
    render(<ErrorBoundary error={new Error("boom")} retry={retry} />);

    expect(screen.getByText("문제가 발생했습니다")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalled();
  });
});
