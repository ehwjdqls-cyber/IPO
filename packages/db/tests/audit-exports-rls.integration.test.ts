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

describe("tenant isolation (audit_events)", () => {
  it("다른 조직 멤버는 audit_events row를 조회할 수 없다 (ADMIN이어도)", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("admin-b", "ADMIN");
    const eventId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into audit_events (organization_id, actor_user_id, action, resource_type)
           values ($1, $2, 'review.decide', 'answer_version') returning id`,
          [orgA.orgId, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from audit_events where id = $1", [eventId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("EDITOR/VIEWER는 다른 사람이 남긴 감사로그는 조회할 수 없다 (ADMIN+ 전용, 자기 행동은 예외)", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const otherUserId = randomUUID();
    await asOwner(db, (tx) =>
      tx.query("insert into profiles (id, display_name) values ($1, '다른 사용자')", [otherUserId])
    );
    await asOwner(db, (tx) =>
      tx.query(
        "insert into organization_members (organization_id, user_id, role, status) values ($1, $2, 'OWNER', 'ACTIVE')",
        [orgA.orgId, otherUserId]
      )
    );
    const eventId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into audit_events (organization_id, actor_user_id, action, resource_type)
           values ($1, $2, 'review.decide', 'answer_version') returning id`,
          [orgA.orgId, otherUserId]
        )
        .then((r) => r.rows[0]!.id)
    );

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from audit_events where id = $1", [eventId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("ADMIN/OWNER는 자기 조직의 audit_events를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const eventId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into audit_events (organization_id, actor_user_id, action, resource_type)
           values ($1, $2, 'review.decide', 'answer_version') returning id`,
          [orgA.orgId, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from audit_events where id = $1", [eventId])
    );

    expect(rows.rows).toHaveLength(1);
  });

  it("누구나(역할 무관) 자기 자신의 행동은 기록할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        `insert into audit_events (organization_id, actor_user_id, action, resource_type)
         values ($1, $2, 'citation.feedback', 'citation') returning id`,
        [orgA.orgId, orgA.userId]
      )
    );

    expect(result.rows).toHaveLength(1);
  });

  it("다른 사용자 명의로는 audit_events를 기록할 수 없다 (actor_user_id 위조 방지)", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const orgAOther = await seedOrgWithMemberAndProject("editor-a2", "EDITOR");

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into audit_events (organization_id, actor_user_id, action, resource_type)
           values ($1, $2, 'review.decide', 'answer_version')`,
          [orgA.orgId, orgAOther.userId]
        )
      )
    ).rejects.toThrow();
  });
});

describe("tenant isolation (exports)", () => {
  it("다른 조직 멤버는 exports row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const exportId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into exports (organization_id, project_id, format, created_by)
           values ($1, $2, 'XLSX', $3) returning id`,
          [orgA.orgId, orgA.projectId, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from exports where id = $1", [exportId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직의 VIEWER도 exports 목록을 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");
    const exportId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into exports (organization_id, project_id, format, created_by)
           values ($1, $2, 'XLSX', $3) returning id`,
          [orgA.orgId, orgA.projectId, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from exports where id = $1", [exportId])
    );

    expect(rows.rows).toHaveLength(1);
  });

  it("VIEWER는 exports를 생성할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into exports (organization_id, project_id, format, created_by)
           values ($1, $2, 'XLSX', $3)`,
          [orgA.orgId, orgA.projectId, orgA.userId]
        )
      )
    ).rejects.toThrow();
  });

  it("EDITOR는 exports를 생성할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        `insert into exports (organization_id, project_id, format, created_by)
         values ($1, $2, 'XLSX', $3) returning id`,
        [orgA.orgId, orgA.projectId, orgA.userId]
      )
    );

    expect(result.rows).toHaveLength(1);
  });
});

describe("answer_versions review_requested_by/review_requested_at (spec S13)", () => {
  async function insertQuestionAsOwner(orgId: string, projectId: string, createdBy: string) {
    const res = await asOwner(db, (tx) =>
      tx.query<{ id: string }>(
        `insert into questions (organization_id, project_id, category, question_text, rationale, created_by)
         values ($1, $2, 'FINANCE', '질문 내용', '근거', $3) returning id`,
        [orgId, projectId, createdBy]
      )
    );
    return res.rows[0]!.id;
  }

  async function insertAnswerVersionAsOwner(questionId: string, createdBy: string) {
    const res = await asOwner(db, (tx) =>
      tx.query<{ id: string }>(
        `insert into answer_versions (question_id, version, body_markdown, source, evidence_status, created_by)
         values ($1, 1, '답변 내용', 'AI', 'SUPPORTED', $2) returning id`,
        [questionId, createdBy]
      )
    );
    return res.rows[0]!.id;
  }

  it("EDITOR는 검토 요청 시 review_requested_by/at을 review_status와 함께 갱신할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query<{ review_requested_by: string; review_requested_at: string }>(
        `update answer_versions
         set review_status = 'NEEDS_REVIEW', review_requested_by = $1, review_requested_at = now()
         where id = $2
         returning review_requested_by, review_requested_at`,
        [orgA.userId, answerId]
      )
    );

    expect(result.rows[0]!.review_requested_by).toBe(orgA.userId);
    expect(result.rows[0]!.review_requested_at).not.toBeNull();
  });
});
