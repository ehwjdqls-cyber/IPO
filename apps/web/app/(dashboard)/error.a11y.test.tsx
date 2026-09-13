// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { criticalViolations } from "../../test/axe";
import ErrorBoundary from "./error";

describe("대시보드 영역 오류 상태 접근성", () => {
  it("axe 자동검사에서 critical 위반이 없다", async () => {
    const { container } = render(<ErrorBoundary error={new Error("boom")} retry={vi.fn()} />);
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });
});
