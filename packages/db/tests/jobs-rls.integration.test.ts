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

async function seedOrgWithMemberAndProject(
  displayName: string,
  role: "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"
) {
  const userId = randomUUID();
  const { orgId, projectId } = await asOwner(db, async (tx) => {
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
      "insert into organization_members (organization_id, user_id, role, status) values ($1, $2, $3, 'ACTIVE')",
      [id, userId, role]
    );
    const projectRes = await tx.query<{ id: string }>(
      `insert into projects (organization_id, name, company_name_ko, industry, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [id, `${displayName}-project`, "테스트社", "B2B SaaS", userId]
    );
    return { orgId: id, projectId: projectRes.rows[0]!.id };
  });
  return { orgId, projectId, userId };
}

async function insertJobAsOwner(
  orgId: string,
  projectId: string,
  createdBy: string,
  idempotencyKey = randomUUID()
) {
  const res = await asOwner(db, (tx) =>
    tx.query<{ id: string }>(
      `insert into jobs (organization_id, project_id, type, idempotency_key, created_by)
       values ($1, $2, 'DOCUMENT_PROCESS', $3, $4) returning id`,
      [orgId, projectId, idempotencyKey, createdBy]
    )
  );
  return res.rows[0]!.id;
}

describe("tenant isolation (jobs)", () => {
  it("다른 조직 멤버는 jobs row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const jobId = await insertJobAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from jobs where id = $1", [jobId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직의 ACTIVE 멤버는 jobs row를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const jobId = await insertJobAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from jobs where id = $1", [jobId])
    );

    expect(rows.rows).toHaveLength(1);
  });

  it("VIEWER role은 jobs INSERT가 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into jobs (organization_id, project_id, type, idempotency_key, created_by)
           values ($1, $2, 'DOCUMENT_PROCESS', $3, $4)`,
          [orgA.orgId, orgA.projectId, randomUUID(), orgA.userId]
        )
      )
    ).rejects.toThrow();
  });

  it("EDITOR role은 jobs INSERT가 허용된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");

    const result = await withScope(
      db,
      { userId: orgA.userId, organizationId: orgA.orgId },
      (tx) =>
        tx.query(
          `insert into jobs (organization_id, project_id, type, idempotency_key, created_by)
           values ($1, $2, 'DOCUMENT_PROCESS', $3, $4) returning id`,
          [orgA.orgId, orgA.projectId, randomUUID(), orgA.userId]
        )
    );

    expect(result.rows).toHaveLength(1);
  });

  it("동일 조직 내 동일 idempotency_key는 중복 삽입이 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const key = randomUUID();
    await insertJobAsOwner(orgA.orgId, orgA.projectId, orgA.userId, key);

    await expect(insertJobAsOwner(orgA.orgId, orgA.projectId, orgA.userId, key)).rejects.toThrow();
  });
});
