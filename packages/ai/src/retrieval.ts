/**
 * Hybrid retrieval (spec section 23), scoped to the subset that doesn't
 * need a real AI call: dense (pgvector cosine) + sparse (Postgres FTS)
 * fused with Reciprocal Rank Fusion. The full algorithm's steps 2
 * (entity/date/amount extraction), 6 (exact-match boost) and 7 (semantic
 * rerank) all require an LLM/NLP call and are deferred to Milestone 3,
 * where they'll run alongside the actual question/answer generation that
 * consumes this retrieval.
 *
 * Takes an already RLS-scoped query client (whatever `withRequestScope`'s
 * callback receives) rather than owning a pool/scope itself, so it works
 * identically against the real pg.Pool in production and a PGlite
 * transaction in tests -- both expose `query<T>(sql, params)`.
 *
 * Security invariant (spec 23절: "타 organization/project 청크가 한 건이라도
 * 포함되면 전체 요청을 실패시킨다"): organization_id/project_id are always
 * included in both queries' WHERE clauses, on top of (not instead of) the
 * document_chunks RLS policy (0011_documents_rls.sql) -- the same
 * app-layer + RLS double enforcement used everywhere else in this
 * codebase (spec section 30).
 */

export interface QueryableClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface HybridSearchParams {
  organizationId: string;
  projectId: string;
  queryEmbedding: number[];
  queryText: string;
  documentIds?: string[];
  denseTopK?: number;
  sparseTopK?: number;
  limit?: number;
  /** Reciprocal Rank Fusion constant (spec 23절 step 5: k=60). */
  rrfK?: number;
}

export interface RetrievalCandidate {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  content: string;
  contentSha256: string;
  bbox: unknown;
  denseScore: number | null;
  sparseScore: number | null;
  fusedScore: number;
}

interface CandidateRow {
  chunk_id: string;
  document_id: string;
  page_number: number;
  content: string;
  content_sha256: string;
  bbox: unknown;
  score: number;
}

function toEmbeddingLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

async function denseSearch(
  client: QueryableClient,
  params: HybridSearchParams,
  topK: number
): Promise<CandidateRow[]> {
  const result = await client.query<CandidateRow>(
    `select
       dc.id as chunk_id,
       dc.document_id,
       dp.page_number,
       dc.content,
       dc.content_sha256,
       dc.bbox,
       1 - (dc.embedding <=> $1::vector) as score
     from document_chunks dc
     join document_pages dp on dp.id = dc.page_id
     where dc.organization_id = $2
       and dc.project_id = $3
       and dc.embedding is not null
       and ($4::uuid[] is null or dc.document_id = any($4::uuid[]))
     order by dc.embedding <=> $1::vector
     limit $5`,
    [
      toEmbeddingLiteral(params.queryEmbedding),
      params.organizationId,
      params.projectId,
      params.documentIds ?? null,
      topK,
    ]
  );
  return result.rows;
}

async function sparseSearch(
  client: QueryableClient,
  params: HybridSearchParams,
  topK: number
): Promise<CandidateRow[]> {
  const result = await client.query<CandidateRow>(
    `select
       dc.id as chunk_id,
       dc.document_id,
       dp.page_number,
       dc.content,
       dc.content_sha256,
       dc.bbox,
       ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', $1)) as score
     from document_chunks dc
     join document_pages dp on dp.id = dc.page_id
     where dc.organization_id = $2
       and dc.project_id = $3
       and ($4::uuid[] is null or dc.document_id = any($4::uuid[]))
       and to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', $1)
     order by score desc
     limit $5`,
    [params.queryText, params.organizationId, params.projectId, params.documentIds ?? null, topK]
  );
  return result.rows;
}

export async function hybridSearch(
  client: QueryableClient,
  params: HybridSearchParams
): Promise<RetrievalCandidate[]> {
  const denseTopK = params.denseTopK ?? 30;
  const sparseTopK = params.sparseTopK ?? 30;
  const limit = params.limit ?? 12;
  const rrfK = params.rrfK ?? 60;

  const [dense, sparse] = await Promise.all([
    denseSearch(client, params, denseTopK),
    sparseSearch(client, params, sparseTopK),
  ]);

  const byId = new Map<string, RetrievalCandidate>();

  function upsert(row: CandidateRow, rank: number, kind: "dense" | "sparse") {
    const existing = byId.get(row.chunk_id);
    const rrfContribution = 1 / (rrfK + rank);
    if (existing) {
      existing.fusedScore += rrfContribution;
      if (kind === "dense") existing.denseScore = row.score;
      if (kind === "sparse") existing.sparseScore = row.score;
      return;
    }
    byId.set(row.chunk_id, {
      chunkId: row.chunk_id,
      documentId: row.document_id,
      pageNumber: row.page_number,
      content: row.content,
      contentSha256: row.content_sha256,
      bbox: row.bbox,
      denseScore: kind === "dense" ? row.score : null,
      sparseScore: kind === "sparse" ? row.score : null,
      fusedScore: rrfContribution,
    });
  }

  dense.forEach((row, index) => upsert(row, index + 1, "dense"));
  sparse.forEach((row, index) => upsert(row, index + 1, "sparse"));

  return Array.from(byId.values())
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, limit);
}
