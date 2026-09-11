export type MemberRole = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";

export type Action =
  | "project.create"
  | "project.read"
  | "project.update"
  | "project.delete"
  | "member.manage"
  | "org.update";

export class ForbiddenError extends Error {
  constructor(role: MemberRole, action: Action) {
    super(`Role ${role} is not permitted to perform ${action}`);
    this.name = "ForbiddenError";
  }
}

const permissions: Record<MemberRole, ReadonlySet<Action>> = {
  OWNER: new Set<Action>([
    "project.create",
    "project.read",
    "project.update",
    "project.delete",
    "member.manage",
    "org.update",
  ]),
  ADMIN: new Set<Action>([
    "project.create",
    "project.read",
    "project.update",
    "project.delete",
    "member.manage",
  ]),
  EDITOR: new Set<Action>(["project.create", "project.read", "project.update"]),
  REVIEWER: new Set<Action>(["project.read"]),
  VIEWER: new Set<Action>(["project.read"]),
};

export function can(role: MemberRole, action: Action): boolean {
  return permissions[role].has(action);
}

export function assertCan(role: MemberRole, action: Action): void {
  if (!can(role, action)) {
    throw new ForbiddenError(role, action);
  }
}
