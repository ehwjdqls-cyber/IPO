import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asOwner, createTestDb, withScope } from "./pglite-harness";
import { hybridSearch } from "../src/retrieval";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.close();
});

const EMBEDDING_DIMENSIONS = 1536; // document_chunks.embedding is vector(1536); pgvector rejects any other width

function makeEmbedding(seed: number): number[] {
  // Only the first two dimensions carry signal; the rest are zero-padded
  // to satisfy the fixed vector(1536) column width. seed controls
  // direction so cosine similarity between fixtures is predictable.
  const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
  vector[0] = seed;
  vector[1] = 1 - seed;
  return vector;
}

async function seedOrgProjectDocument(displayName: string, role: "OWNER" = "OWNER") {
  const userId = randomUUID();
  const { orgId, projectId, documentId, pageId } = await asOwner(db, async (tx) => {
    const orgRes = await tx.query<{ id: string }>(
      "insert into organizations (name) values ($1) returning id",
      [`${displayName}-org-${randomUUID()}`]
    );
    const orgId = orgRes.rows[0]!.id;
    await tx.query("insert into profiles (id, display_name) values ($1, $2)", [
      userId,
      displayName,
    ]);
    await tx.query(
      "insert into organization_members (organization_id, user_id, role, status) values ($1, $2, $3, 'ACTIVE')",
      [orgId, userId, role]
    );
    const projectRes = await tx.query<{ id: string }>(
      `insert into projects (organization_id, name, company_name_ko, industry, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [orgId, `${displayName}-project`, "테스트社", "B2B SaaS", userId]
    );
    const projectId = projectRes.rows[0]!.id;
    const documentId = randomUUID();
    await tx.query(
      `insert into documents
         (id, organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, uploaded_by)
       values ($1, $2, $3, 'f.pdf', $4, 'application/pdf', 100, $5, $6)`,
      [documentId, orgId, projectId, `${orgId}/${projectId}/${documentId}/f.pdf`, "a".repeat(64), userId]
    );
    const pageRes = await tx.query<{ id: string }>(
      `insert into document_pages (document_id, page_number, extracted_text) values ($1, 1, 'x') returning id`,
      [documentId]
    );
    const pageId = pageRes.rows[0]!.id;
    return { orgId, projectId, documentId, pageId };
  });
  return { orgId, projectId, documentId, pageId, userId };
}

async function insertChunk(
  orgId: string,
  projectId: string,
  documentId: string,
  pageId: string,
  chunkIndex: number,
  content: string,
  embedding: number[]
) {
  const embeddingLiteral = `[${embedding.join(",")}]`;
  const res = await asOwner(db, (tx) =>
    tx.query<{ id: string }>(
      `insert into document_chunks
         (organization_id, project_id, document_id, page_id, chunk_index, content, content_sha256, token_count, embedding)
       values ($1, $2, $3, $4, $5, $6, $7, 5, $8::vector)
       returning id`,
      [orgId, projectId, documentId, pageId, chunkIndex, content, randomUUID().replace(/-/g, "").padEnd(64, "0"), embeddingLiteral]
    )
  );
  return res.rows[0]!.id;
}

describe("hybridSearch", () => {
  it("쿼리 임베딩과 코사인 유사도가 가장 높은 청크를 먼저 반환한다", async () => {
    const org = await seedOrgProjectDocument("owner-a");
    const closeId = await insertChunk(
      org.orgId,
      org.projectId,
      org.documentId,
      org.pageId,
      0,
      "매출 성장에 대한 내용",
      makeEmbedding(1)
    );
    const farId = await insertChunk(
      org.orgId,
      org.projectId,
      org.documentId,
      org.pageId,
      1,
      "완전히 다른 주제",
      makeEmbedding(0)
    );

    const results = await withScope(db, { userId: org.userId, organizationId: org.orgId }, (tx) =>
      hybridSearch(tx, {
        organizationId: org.orgId,
        projectId: org.projectId,
        queryEmbedding: makeEmbedding(1),
        queryText: "매출 성장",
      })
    );

    expect(results[0]!.chunkId).toBe(closeId);
    expect(results.map((r) => r.chunkId)).toContain(farId);
  });

  it("키워드가 일치하는 청크를 sparse 검색으로도 찾는다", async () => {
    const org = await seedOrgProjectDocument("owner-b");
    const matchId = await insertChunk(
      org.orgId,
      org.projectId,
      org.documentId,
      org.pageId,
      0,
      "특수관계자 거래 내역 공시",
      makeEmbedding(0.5)
    );
    await insertChunk(
      org.orgId,
      org.projectId,
      org.documentId,
      org.pageId,
      1,
      "전혀 관련 없는 내용",
      makeEmbedding(0.5)
    );

    const results = await withScope(db, { userId: org.userId, organizationId: org.orgId }, (tx) =>
      hybridSearch(tx, {
        organizationId: org.orgId,
        projectId: org.projectId,
        queryEmbedding: makeEmbedding(0.5),
        queryText: "특수관계자 거래",
      })
    );

    const matched = results.find((r) => r.chunkId === matchId);
    expect(matched).toBeDefined();
    expect(matched!.sparseScore).toBeGreaterThan(0);
  });

  it("다른 조직의 청크는 절대 결과에 포함되지 않는다 (핵심 불변조건, spec 23절)", async () => {
    const orgA = await seedOrgProjectDocument("owner-c");
    const orgB = await seedOrgProjectDocument("owner-d");
    await insertChunk(
      orgA.orgId,
      orgA.projectId,
      orgA.documentId,
      orgA.pageId,
      0,
      "조직 A 문서 내용",
      makeEmbedding(1)
    );
    const otherOrgChunkId = await insertChunk(
      orgB.orgId,
      orgB.projectId,
      orgB.documentId,
      orgB.pageId,
      0,
      "조직 B 문서 내용",
      makeEmbedding(1)
    );

    const results = await withScope(db, { userId: orgA.userId, organizationId: orgA.orgId }, (tx) =>
      hybridSearch(tx, {
        organizationId: orgA.orgId,
        projectId: orgA.projectId,
        queryEmbedding: makeEmbedding(1),
        queryText: "문서 내용",
      })
    );

    expect(results.map((r) => r.chunkId)).not.toContain(otherOrgChunkId);
  });

  it("limit을 넘는 결과는 잘라낸다", async () => {
    const org = await seedOrgProjectDocument("owner-e");
    for (let i = 0; i < 5; i++) {
      await insertChunk(
        org.orgId,
        org.projectId,
        org.documentId,
        org.pageId,
        i,
        `본문 ${i}`,
        makeEmbedding(i / 5)
      );
    }

    const results = await withScope(db, { userId: org.userId, organizationId: org.orgId }, (tx) =>
      hybridSearch(tx, {
        organizationId: org.orgId,
        projectId: org.projectId,
        queryEmbedding: makeEmbedding(1),
        queryText: "본문",
        limit: 2,
      })
    );

    expect(results).toHaveLength(2);
  });
});
