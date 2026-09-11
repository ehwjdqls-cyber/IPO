import { describe, expect, it } from "vitest";
import { can, assertCan, ForbiddenError, type MemberRole, type Action } from "./rbac";

describe("can", () => {
  it.each<[MemberRole, Action, boolean]>([
    ["OWNER", "project.create", true],
    ["OWNER", "project.read", true],
    ["OWNER", "project.update", true],
    ["OWNER", "project.delete", true],
    ["OWNER", "member.manage", true],
    ["OWNER", "org.update", true],

    ["ADMIN", "project.create", true],
    ["ADMIN", "project.read", true],
    ["ADMIN", "project.update", true],
    ["ADMIN", "project.delete", true],
    ["ADMIN", "member.manage", true],
    ["ADMIN", "org.update", false],

    ["EDITOR", "project.create", true],
    ["EDITOR", "project.read", true],
    ["EDITOR", "project.update", true],
    ["EDITOR", "project.delete", false],
    ["EDITOR", "member.manage", false],
    ["EDITOR", "org.update", false],

    ["REVIEWER", "project.create", false],
    ["REVIEWER", "project.read", true],
    ["REVIEWER", "project.update", false],
    ["REVIEWER", "project.delete", false],
    ["REVIEWER", "member.manage", false],
    ["REVIEWER", "org.update", false],

    ["VIEWER", "project.create", false],
    ["VIEWER", "project.read", true],
    ["VIEWER", "project.update", false],
    ["VIEWER", "project.delete", false],
    ["VIEWER", "member.manage", false],
    ["VIEWER", "org.update", false],
  ])("%s가 %s를 수행할 수 있는지 = %s", (role, action, expected) => {
    expect(can(role, action)).toBe(expected);
  });
});

describe("assertCan", () => {
  it("권한이 있으면 아무것도 던지지 않는다", () => {
    expect(() => assertCan("OWNER", "project.delete")).not.toThrow();
  });

  it("권한이 없으면 ForbiddenError를 던진다", () => {
    expect(() => assertCan("VIEWER", "project.delete")).toThrow(ForbiddenError);
  });
});
