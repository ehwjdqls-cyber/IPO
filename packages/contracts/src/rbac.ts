export type MemberRole = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";

export type Action =
  | "project.create"
  | "project.read"
  | "project.update"
  | "project.delete"
  | "member.manage"
  | "org.update"
  | "document.manage"
  | "document.read"
  | "job.manage"
  | "job.read";

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
    "document.manage",
    "document.read",
    "job.manage",
    "job.read",
  ]),
  ADMIN: new Set<Action>([
    "project.create",
    "project.read",
    "project.update",
    "project.delete",
    "member.manage",
    "document.manage",
    "document.read",
    "job.manage",
    "job.read",
  ]),
  EDITOR: new Set<Action>([
    "project.create",
    "project.read",
    "project.update",
    "document.manage",
    "document.read",
    "job.manage",
    "job.read",
  ]),
  REVIEWER: new Set<Action>(["project.read", "document.read", "job.read"]),
  VIEWER: new Set<Action>(["project.read", "document.read", "job.read"]),
};

export function can(role: MemberRole, action: Action): boolean {
  return permissions[role].has(action);
}

export function assertCan(role: MemberRole, action: Action): void {
  if (!can(role, action)) {
    throw new ForbiddenError(role, action);
  }
}
