// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { criticalViolations } from "../../../../test/axe";
import { NewProjectForm } from "./new-project-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("S04 프로젝트 생성 마법사 접근성", () => {
  it("첫 단계(기본정보)에서 axe critical 위반이 없다", async () => {
    const { container } = render(<NewProjectForm organizationId="org-1" />);
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });
});
