// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { criticalViolations } from "../../../test/axe";
import { LoginForm } from "./login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("S01 로그인 접근성", () => {
  it("axe 자동검사에서 critical 위반이 없다", async () => {
    const { container } = render(<LoginForm />);
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });
});
