// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { criticalViolations } from "../../../../../../test/axe";
import { GenerateQuestionsForm } from "./generate-questions-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("S08 질문 생성 설정 접근성", () => {
  it("axe 자동검사에서 critical 위반이 없다", async () => {
    const { container } = render(
      <GenerateQuestionsForm
        projectId="project-1"
        readyDocuments={[{ id: "doc-1", originalFilename: "a.pdf" }]}
      />
    );
    const results = await axe(container);
    expect(criticalViolations(results)).toEqual([]);
  });
});
