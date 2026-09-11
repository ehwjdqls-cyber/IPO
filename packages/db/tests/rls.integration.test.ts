import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asOwner, createTestDb, withScope } from "./pglite-harness";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.close();
});

async function seedOrgWithMember(
  displayName: string,
  role: "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER",
  status: "ACTIVE" | "INVITED" | "SUSPENDED" = "ACTIVE"
) {
  const userId = randomUUID();
  const orgId = await asOwner(db, async (tx) => {
    const orgRes = await tx.query<{ id: string }>(
      "insert into organizations (name) values ($1) returning id",
      [`${displayName}-org-${randomUUID()}`]
    );
    const id = orgRes.rows[0]!.id;
    await tx.query("insert into profiles (id, display_name) values ($1, $2)", [
      userId,
      displayName,
    ]);
    await tx.query(
      "insert into organization_members (organization_id, user_id, role, status) values ($1, $2, $3, $4)",
      [id, userId, role, status]
    );
    return id;
  });
  return { orgId, userId };
}

async function insertProjectAsOwner(orgId: string, createdBy: string, name: string) {
  const res = await asOwner(db, (tx) =>
    tx.query<{ id: string }>(
      `insert into projects (organization_id, name, company_name_ko, industry, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [orgId, name, "테스트社", "B2B SaaS", createdBy]
    )
  );
  return res.rows[0]!.id;
}

describe("tenant isolation (projects)", () => {
  it("다른 조직 멤버는 projects row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMember("owner-a", "OWNER");
    const orgB = await seedOrgWithMember("owner-b", "OWNER");
    const projectId = await insertProjectAsOwner(orgA.orgId, orgA.userId, "프로젝트A");

    const rows = await withScope(
      db,
      { userId: orgB.userId, organizationId: orgA.orgId },
      (tx) => tx.query("select * from projects where id = $1", [projectId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직의 ACTIVE 멤버는 projects row를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMember("owner-a", "OWNER");
    const projectId = await insertProjectAsOwner(orgA.orgId, orgA.userId, "프로젝트A");

    const rows = await withScope(
      db,
      { userId: orgA.userId, organizationId: orgA.orgId },
      (tx) => tx.query("select * from projects where id = $1", [projectId])
    );

    expect(rows.rows).toHaveLength(1);
  });

  it("VIEWER role은 projects INSERT가 거부된다", async () => {
    const orgA = await seedOrgWithMember("viewer-a", "VIEWER");

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into projects (organization_id, name, company_name_ko, industry, created_by)
           values ($1, $2, $3, $4, $5)`,
          [orgA.orgId, "무단생성", "테스트社", "B2B SaaS", orgA.userId]
        )
      )
    ).rejects.toThrow();
  });

  it("EDITOR role은 projects INSERT가 허용된다", async () => {
    const orgA = await seedOrgWithMember("editor-a", "EDITOR");

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        `insert into projects (organization_id, name, company_name_ko, industry, created_by)
         values ($1, $2, $3, $4, $5) returning id`,
        [orgA.orgId, "정상생성", "테스트社", "B2B SaaS", orgA.userId]
      )
    );

    expect(result.rows).toHaveLength(1);
  });

  it("EDITOR role은 projects DELETE가 거부된다 (ADMIN 이상만 허용)", async () => {
    const orgA = await seedOrgWithMember("editor-a", "EDITOR");
    const projectId = await insertProjectAsOwner(orgA.orgId, orgA.userId, "삭제대상");

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("delete from projects where id = $1", [projectId])
    );

    expect(result.affectedRows ?? 0).toBe(0);
  });
});

describe("organization membership status", () => {
  it("INVITED 상태 멤버는 organization row에 접근할 수 없다", async () => {
    const invited = await seedOrgWithMember("invited-a", "EDITOR", "INVITED");

    const rows = await withScope(
      db,
      { userId: invited.userId, organizationId: invited.orgId },
      (tx) => tx.query("select * from organizations where id = $1", [invited.orgId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("ACTIVE 상태 멤버는 organization row에 접근할 수 있다", async () => {
    const active = await seedOrgWithMember("active-a", "EDITOR", "ACTIVE");

    const rows = await withScope(
      db,
      { userId: active.userId, organizationId: active.orgId },
      (tx) => tx.query("select * from organizations where id = $1", [active.orgId])
    );

    expect(rows.rows).toHaveLength(1);
  });
});

describe("create_organization_with_owner (signup bootstrap)", () => {
  it("호출한 사용자를 OWNER로 하는 조직을 원자적으로 생성한다", async () => {
    const userId = randomUUID();

    const orgId = await withScope(db, { userId }, async (tx) => {
      const res = await tx.query<{ create_organization_with_owner: string }>(
        "select create_organization_with_owner($1, $2, $3) as create_organization_with_owner",
        ["새로운 IPO 프로젝트社", userId, "홍길동"]
      );
      return res.rows[0]!.create_organization_with_owner;
    });

    const membership = await withScope(db, { userId, organizationId: orgId }, (tx) =>
      tx.query<{ role: string; status: string }>(
        "select role, status from organization_members where organization_id = $1 and user_id = $2",
        [orgId, userId]
      )
    );

    expect(membership.rows[0]).toEqual({ role: "OWNER", status: "ACTIVE" });
  });

  it("다른 사용자를 owner로 지정하려 하면 거부된다", async () => {
    const requester = randomUUID();
    const someoneElse = randomUUID();

    await expect(
      withScope(db, { userId: requester }, (tx) =>
        tx.query("select create_organization_with_owner($1, $2, $3)", [
          "탈취시도社",
          someoneElse,
          "가짜소유자",
        ])
      )
    ).rejects.toThrow();
  });
});
