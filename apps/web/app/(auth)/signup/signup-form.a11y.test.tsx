// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { criticalViolations } from "../../../test/axe";
import { SignupForm } from "./signup-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("S02 회원가입 접근성", () => {
  it("axe 자동검사에서 critical 위반이 없다", async () => {
    const { container } = render(<SignupForm />);
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });
});
