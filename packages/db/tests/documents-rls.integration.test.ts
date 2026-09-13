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

async function insertDocumentAsOwner(orgId: string, projectId: string, uploadedBy: string) {
  const res = await asOwner(db, (tx) =>
    tx.query<{ id: string }>(
      `insert into documents
         (organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, uploaded_by)
       values ($1, $2, '감사보고서.pdf', $3, 'application/pdf', 1024, $4, $5)
       returning id`,
      [
        orgId,
        projectId,
        `${orgId}/${projectId}/${randomUUID()}`,
        "a".repeat(64),
        uploadedBy,
      ]
    )
  );
  return res.rows[0]!.id;
}

async function insertPageAsOwner(documentId: string) {
  const res = await asOwner(db, (tx) =>
    tx.query<{ id: string }>(
      `insert into document_pages (document_id, page_number, extracted_text) values ($1, 1, '본문') returning id`,
      [documentId]
    )
  );
  return res.rows[0]!.id;
}

async function insertChunkAsOwner(
  orgId: string,
  projectId: string,
  documentId: string,
  pageId: string
) {
  const res = await asOwner(db, (tx) =>
    tx.query<{ id: string }>(
      `insert into document_chunks
         (organization_id, project_id, document_id, page_id, chunk_index, content, content_sha256, token_count)
       values ($1, $2, $3, $4, 0, '청크 내용', $5, 10)
       returning id`,
      [orgId, projectId, documentId, pageId, "b".repeat(64)]
    )
  );
  return res.rows[0]!.id;
}

describe("tenant isolation (documents)", () => {
  it("다른 조직 멤버는 documents row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from documents where id = $1", [documentId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직의 ACTIVE 멤버는 documents row를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from documents where id = $1", [documentId])
    );

    expect(rows.rows).toHaveLength(1);
  });

  it("VIEWER role은 documents INSERT가 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");

    await expect(
      withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
        tx.query(
          `insert into documents
             (organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, uploaded_by)
           values ($1, $2, 'x.pdf', $3, 'application/pdf', 10, $4, $5)`,
          [orgA.orgId, orgA.projectId, randomUUID(), "c".repeat(64), orgA.userId]
        )
      )
    ).rejects.toThrow();
  });

  it("EDITOR role은 documents INSERT가 허용된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");

    const result = await withScope(
      db,
      { userId: orgA.userId, organizationId: orgA.orgId },
      (tx) =>
        tx.query(
          `insert into documents
             (organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, uploaded_by)
           values ($1, $2, 'x.pdf', $3, 'application/pdf', 10, $4, $5) returning id`,
          [orgA.orgId, orgA.projectId, randomUUID(), "d".repeat(64), orgA.userId]
        )
    );

    expect(result.rows).toHaveLength(1);
  });
});

describe("tenant isolation (document_pages)", () => {
  it("다른 조직 멤버는 document_pages row를 조회할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const pageId = await insertPageAsOwner(documentId);

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from document_pages where id = $1", [pageId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직 멤버는 document_pages row를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const pageId = await insertPageAsOwner(documentId);

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from document_pages where id = $1", [pageId])
    );

    expect(rows.rows).toHaveLength(1);
  });
});

describe("document_pages UPDATE (S07 페이지 제외)", () => {
  it("VIEWER role은 document_pages.excluded 변경이 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("viewer-a", "VIEWER");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const pageId = await insertPageAsOwner(documentId);

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("update document_pages set excluded = true where id = $1 returning id", [pageId])
    );

    expect(result.rows).toHaveLength(0);
  });

  it("EDITOR role은 같은 조직의 document_pages.excluded를 변경할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("editor-a", "EDITOR");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const pageId = await insertPageAsOwner(documentId);

    const result = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("update document_pages set excluded = true where id = $1 returning id", [pageId])
    );

    expect(result.rows).toHaveLength(1);
  });

  it("다른 조직의 EDITOR는 document_pages.excluded를 변경할 수 없다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("editor-b", "EDITOR");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const pageId = await insertPageAsOwner(documentId);

    const result = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("update document_pages set excluded = true where id = $1 returning id", [pageId])
    );

    expect(result.rows).toHaveLength(0);
  });
});

describe("tenant isolation (document_chunks)", () => {
  it("다른 조직 멤버는 document_chunks row를 조회할 수 없다 (retrieval 오염 방지 핵심 불변조건)", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const orgB = await seedOrgWithMemberAndProject("owner-b", "OWNER");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const pageId = await insertPageAsOwner(documentId);
    const chunkId = await insertChunkAsOwner(orgA.orgId, orgA.projectId, documentId, pageId);

    const rows = await withScope(db, { userId: orgB.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from document_chunks where id = $1", [chunkId])
    );

    expect(rows.rows).toHaveLength(0);
  });

  it("같은 조직 멤버는 document_chunks row를 조회할 수 있다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const documentId = await insertDocumentAsOwner(orgA.orgId, orgA.projectId, orgA.userId);
    const pageId = await insertPageAsOwner(documentId);
    const chunkId = await insertChunkAsOwner(orgA.orgId, orgA.projectId, documentId, pageId);

    const rows = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      tx.query("select * from document_chunks where id = $1", [chunkId])
    );

    expect(rows.rows).toHaveLength(1);
  });
});

describe("documents unique(project_id, sha256, version) -- 소프트 삭제 예외", () => {
  it("소프트 삭제된 문서와 같은 sha256/version이어도 재업로드가 허용된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const sha256 = "c".repeat(64);

    const firstId = await asOwner(db, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into documents
             (organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, version, uploaded_by)
           values ($1, $2, 'a.pdf', $3, 'application/pdf', 1024, $4, 1, $5)
           returning id`,
          [orgA.orgId, orgA.projectId, `${orgA.orgId}/${orgA.projectId}/${randomUUID()}`, sha256, orgA.userId]
        )
        .then((r) => r.rows[0]!.id)
    );

    await asOwner(db, (tx) =>
      tx.query("update documents set status = 'DELETING', deleted_at = now() where id = $1", [firstId])
    );

    await expect(
      asOwner(db, (tx) =>
        tx.query(
          `insert into documents
             (organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, version, uploaded_by)
           values ($1, $2, 'a.pdf', $3, 'application/pdf', 1024, $4, 1, $5)`,
          [orgA.orgId, orgA.projectId, `${orgA.orgId}/${orgA.projectId}/${randomUUID()}`, sha256, orgA.userId]
        )
      )
    ).resolves.not.toThrow();
  });

  it("소프트 삭제되지 않은 문서와 같은 sha256/version은 여전히 거부된다", async () => {
    const orgA = await seedOrgWithMemberAndProject("owner-a", "OWNER");
    const sha256 = "d".repeat(64);

    await asOwner(db, (tx) =>
      tx.query(
        `insert into documents
           (organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, version, uploaded_by)
         values ($1, $2, 'a.pdf', $3, 'application/pdf', 1024, $4, 1, $5)`,
        [orgA.orgId, orgA.projectId, `${orgA.orgId}/${orgA.projectId}/${randomUUID()}`, sha256, orgA.userId]
      )
    );

    await expect(
      asOwner(db, (tx) =>
        tx.query(
          `insert into documents
             (organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, version, uploaded_by)
           values ($1, $2, 'a.pdf', $3, 'application/pdf', 1024, $4, 1, $5)`,
          [orgA.orgId, orgA.projectId, `${orgA.orgId}/${orgA.projectId}/${randomUUID()}`, sha256, orgA.userId]
        )
      )
    ).rejects.toThrow();
  });
});
