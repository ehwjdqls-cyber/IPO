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

describe("tenant isolation (questions)", () => {
  it("다른 조직 멤버는 questions row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from questions where id = $1", [questionId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직의 ACTIVE 멤버는 questions row를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from questions where id = $1", [questionId])
    );

    expect(rows.rows).toHaveLength(1);
  });

  it("VIEWER role은 questions INSERT가 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into questions (organization_id, project_id, category, question_text, rationale, created_by)
           values ($1, $2, 'RISK', 'q', 'r', $3)`,
          [orgA.orgId, orgA.projectId, orgA.userId]
        )
      )
    ).rejects.toThrow();
  });

  it("REVIEWER role은 questions INSERT가 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("reviewer-a", "REVIEWER");

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into questions (organization_id, project_id, category, question_text, rationale, created_by)
           values ($1, $2, 'RISK', 'q', 'r', $3)`,
          [orgA.orgId, orgA.projectId, orgA.userId]
        )
      )
    ).rejects.toThrow();
  });

  it("EDITOR role은 questions INSERT가 허용된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        `insert into questions (organization_id, project_id, category, question_text, rationale, created_by)
         values ($1, $2, 'RISK', 'q', 'r', $3) returning id`,
        [orgA.orgId, orgA.projectId, orgA.userId]
      )
    );

    expect(result.rows).toHaveLength(1);
  });
});

describe("tenant isolation (answer_versions)", () => {
  it("다른 조직 멤버는 answer_versions row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from answer_versions where id = $1", [answerId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직 멤버는 answer_versions row를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from answer_versions where id = $1", [answerId])
    );

    expect(rows.rows).toHaveLength(1);
  });

  it("REVIEWER role은 answer_versions INSERT가 거부된다 (answer body 수정 불가)", async () => {
    const orgA = await seedOrgWithMemberAndProject("reviewer-a", "REVIEWER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into answer_versions (question_id, version, body_markdown, source, evidence_status, created_by)
           values ($1, 1, 'body', 'USER', 'SUPPORTED', $2)`,
          [questionId, orgA.userId]
        )
      )
    ).rejects.toThrow();
  });

  it("EDITOR role은 answer_versions INSERT가 허용된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        `insert into answer_versions (question_id, version, body_markdown, source, evidence_status, created_by)
         values ($1, 1, 'body', 'USER', 'SUPPORTED', $2) returning id`,
        [questionId, orgA.userId]
      )
    );

    expect(result.rows).toHaveLength(1);
  });
});

describe("tenant isolation (claims / citations)", () => {
  it("다른 조직 멤버는 claims row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);
    const claimId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into claims (answer_version_id, claim_index, claim_text, is_factual, evidence_status)
           values ($1, 0, 'claim', true, 'SUPPORTED') returning id`,
          [answerId]
        )
        .then((r) => r.rows[0]!.id)
    );

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from claims where id = $1", [claimId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직 멤버는 claims row를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);
    const claimId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into claims (answer_version_id, claim_index, claim_text, is_factual, evidence_status)
           values ($1, 0, 'claim', true, 'SUPPORTED') returning id`,
          [answerId]
        )
        .then((r) => r.rows[0]!.id)
    );

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from claims where id = $1", [claimId])
    );

    expect(rows.rows).toHaveLength(1);
  });

  it("EDITOR role도 AI 생성 answer_version(source='AI')에는 claims INSERT가 거부된다 (worker 전용)", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into claims (answer_version_id, claim_index, claim_text, is_factual, evidence_status)
           values ($1, 1, 'claim', true, 'SUPPORTED')`,
          [answerId]
        )
      )
    ).rejects.toThrow();
  });

  it("EDITOR role은 자신이 저장한 USER 편집본(source='USER')에는 claims/citations INSERT가 허용된다 (spec 20.5)", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    const userAnswerId = await withScope(
      db,
      { userId: orgA.userId, organizationId: orgA.orgId },
      (tx) =>
        tx
          .query<{ id: string }>(
            `insert into answer_versions (question_id, version, body_markdown, source, evidence_status, created_by)
             values ($1, 1, 'body', 'USER', 'SUPPORTED', $2) returning id`,
            [questionId, orgA.userId]
          )
          .then((r) => r.rows[0]!.id)
    );

    const claimId = await withScope(
      db,
      { userId: orgA.userId, organizationId: orgA.orgId },
      (tx) =>
        tx
          .query<{ id: string }>(
            `insert into claims (answer_version_id, claim_index, claim_text, is_factual, evidence_status)
             values ($1, 0, 'claim', true, 'SUPPORTED') returning id`,
            [userAnswerId]
          )
          .then((r) => r.rows[0]!.id)
    );

    const documentId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into documents
             (organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, uploaded_by)
           values ($1, $2, '감사보고서.pdf', $3, 'application/pdf', 1024, $4, $5)
           returning id`,
          [orgA.orgId, orgA.projectId, `${orgA.orgId}/${orgA.projectId}/${randomUUID()}`, "a".repeat(64), orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );
    const pageId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into document_pages (document_id, page_number, extracted_text) values ($1, 1, '본문') returning id`,
          [documentId]
        )
        .then((r) => r.rows[0]!.id)
    );
    const chunkId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into document_chunks
             (organization_id, project_id, document_id, page_id, chunk_index, content, content_sha256, token_count)
           values ($1, $2, $3, $4, 0, '청크 내용', $5, 10)
           returning id`,
          [orgA.orgId, orgA.projectId, documentId, pageId, "b".repeat(64)]
        )
        .then((r) => r.rows[0]!.id)
    );

    const result = await withScope(
      db,
      { userId: orgA.userId, organizationId: orgA.orgId },
      (tx) =>
        tx.query(
          `insert into citations (claim_id, chunk_id, quote_text, page_number, relevance_score, verdict)
           values ($1, $2, '인용', 1, 0.9, 'SUPPORTS') returning id`,
          [claimId, chunkId]
        )
    );

    expect(result.rows).toHaveLength(1);
  });
});

describe("tenant isolation (reviews)", () => {
  it("다른 조직 멤버는 reviews row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);
    const reviewId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into reviews (answer_version_id, reviewer_id, decision) values ($1, $2, 'APPROVED') returning id`,
          [answerId, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from reviews where id = $1", [reviewId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("VIEWER role은 reviews INSERT가 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");
    const questionId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into questions (organization_id, project_id, category, question_text, rationale, created_by)
           values ($1, $2, 'RISK', 'q', 'r', $3) returning id`,
          [orgA.orgId, orgA.projectId, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into reviews (answer_version_id, reviewer_id, decision) values ($1, $2, 'APPROVED')`,
          [answerId, orgA.userId]
        )
      )
    ).rejects.toThrow();
  });

  it("REVIEWER role은 reviews INSERT가 허용된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("reviewer-a", "REVIEWER");
    const questionId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into questions (organization_id, project_id, category, question_text, rationale, created_by)
           values ($1, $2, 'RISK', 'q', 'r', $3) returning id`,
          [orgA.orgId, orgA.projectId, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        `insert into reviews (answer_version_id, reviewer_id, decision) values ($1, $2, 'APPROVED') returning id`,
        [answerId, orgA.userId]
      )
    );

    expect(result.rows).toHaveLength(1);
  });

  it("다른 사용자를 reviewer_id로 지정하려 하면 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("reviewer-a", "REVIEWER");
    const someoneElse = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into reviews (answer_version_id, reviewer_id, decision) values ($1, $2, 'APPROVED')`,
          [answerId, someoneElse.userId]
        )
      )
    ).rejects.toThrow();
  });
});

describe("answer_versions.review_status UPDATE (S11/S13 검토 흐름)", () => {
  it("VIEWER role은 review_status 변경이 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");
    const questionId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into questions (organization_id, project_id, category, question_text, rationale, created_by)
           values ($1, $2, 'RISK', 'q', 'r', $3) returning id`,
          [orgA.orgId, orgA.projectId, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        "update answer_versions set review_status = 'NEEDS_REVIEW' where id = $1 returning id",
        [answerId]
      )
    );

    expect(result.rows).toHaveLength(0);
  });

  it("EDITOR role은 검토 요청(review_status -> NEEDS_REVIEW)을 할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        "update answer_versions set review_status = 'NEEDS_REVIEW' where id = $1 returning id",
        [answerId]
      )
    );

    expect(result.rows).toHaveLength(1);
  });

  it("REVIEWER role은 검토 결정(review_status -> APPROVED)을 반영할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("reviewer-a", "REVIEWER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        "update answer_versions set review_status = 'APPROVED' where id = $1 returning id",
        [answerId]
      )
    );

    expect(result.rows).toHaveLength(1);
  });

  it("다른 조직의 REVIEWER는 review_status를 변경할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("reviewer-b", "REVIEWER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    const result = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query(
        "update answer_versions set review_status = 'APPROVED' where id = $1 returning id",
        [answerId]
      )
    );

    expect(result.rows).toHaveLength(0);
  });

  it("review_status 이외의 컬럼(body_markdown)은 여전히 수정할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const questionId = await insertQuestionAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const answerId = await insertAnswerVersionAsOwner(questionId, orgA.userId);

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query("update answer_versions set body_markdown = '변조' where id = $1", [answerId])
      )
    ).rejects.toThrow();
  });
});
