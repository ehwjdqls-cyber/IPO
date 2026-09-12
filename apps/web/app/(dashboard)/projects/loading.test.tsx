// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("S03 프로젝트 목록 로딩 상태", () => {
  it("데이터를 불러오는 동안 로딩 표시를 보여준다", () => {
    render(<Loading />);
    expect(screen.getByText("프로젝트 목록을 불러오는 중...")).not.toBeNull();
  });
});
