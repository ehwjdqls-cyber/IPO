import { describe, expect, it, vi, beforeEach } from "vitest";
import { AccessDenied } from "../../../../components/access-denied";
import { NewProjectForm } from "./new-project-form";

const getAuthenticatedUser = vi.fn();
const listMemberships = vi.fn();

vi.mock("../../../../lib/auth", () => ({ getAuthenticatedUser }));
vi.mock("../../../../lib/queries/organizations", () => ({ listMemberships }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("S04 프로젝트 생성 마법사 권한없음 상태", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    listMemberships.mockReset();
    getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  });

  it("VIEWER 역할은 프로젝트 생성 폼 대신 권한없음 화면을 본다", async () => {
    listMemberships.mockResolvedValue([{ id: "org-1", name: "예시조직", role: "VIEWER" }]);
    const { default: NewProjectPage } = await import("./page");

    const result = await NewProjectPage();

    expect(result.type).toBe(AccessDenied);
  });

  it("REVIEWER 역할도 권한없음 화면을 본다", async () => {
    listMemberships.mockResolvedValue([{ id: "org-1", name: "예시조직", role: "REVIEWER" }]);
    const { default: NewProjectPage } = await import("./page");

    const result = await NewProjectPage();

    expect(result.type).toBe(AccessDenied);
  });

  it("EDITOR 이상 역할은 프로젝트 생성 폼을 본다", async () => {
    listMemberships.mockResolvedValue([{ id: "org-1", name: "예시조직", role: "EDITOR" }]);
    const { default: NewProjectPage } = await import("./page");

    const result = await NewProjectPage();

    expect(result.type).toBe(NewProjectForm);
  });
});
