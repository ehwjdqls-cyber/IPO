// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("S05 프로젝트 대시보드 로딩 상태", () => {
  it("데이터를 불러오는 동안 로딩 표시를 보여준다", () => {
    render(<Loading />);
    expect(screen.getByText("프로젝트 정보를 불러오는 중...")).not.toBeNull();
  });
});
