import { describe, expect, it } from "vitest";
import { ProjectNav } from "./project-nav";

describe("ProjectLayout", () => {
  it("ProjectNav에 projectId를 전달한다", async () => {
    const { default: ProjectLayout } = await import("./layout");

    const result = await ProjectLayout({
      params: Promise.resolve({ projectId: "project-1" }),
      children: "children" as never,
    });

    const findNode = (
      node: unknown,
      predicate: (n: { type?: unknown; props?: Record<string, unknown> }) => boolean,
      seen = new WeakSet<object>()
    ): { type?: unknown; props?: Record<string, unknown> } | null => {
      if (node == null || typeof node !== "object") return null;
      if (seen.has(node as object)) return null;
      seen.add(node as object);
      const typed = node as { type?: unknown; props?: Record<string, unknown> };
      if (predicate(typed)) return typed;
      const children = typed.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findNode(child, predicate, seen);
          if (found) return found;
        }
        return null;
      }
      return findNode(children, predicate, seen);
    };

    const nav = findNode(result, (n) => n.type === ProjectNav);
    expect(nav?.props?.projectId).toBe("project-1");
  });
});
