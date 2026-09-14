import "server-only";
import { withRequestScope } from "../db";

export interface CitationDetail {
  id: string;
  organizationId: string;
  pageNumber: number;
  quoteText: string;
  verdict: "SUPPORTS" | "PARTIAL" | "CONFLICTS";
  bbox: { x: number; y: number; width: number; height: number } | null;
  document: { id: string; filename: string; version: number; storageKey: string; mediaType: string };
  claim: { id: string; claimText: string };
}

/** Same read path as GET /api/v1/citations/{citationId} -- kept here so the
 * S12 Server Component page can call it directly. */
export async function findCitationDetail(
  userId: string,
  citationId: string
): Promise<CitationDetail | null> {
  const result = await withRequestScope({ userId }, async (client) => {
    const rows = await client.query<{
      id: string;
      organization_id: string;
      page_number: number;
      quote_text: string;
      verdict: "SUPPORTS" | "PARTIAL" | "CONFLICTS";
      bbox: { x: number; y: number; width: number; height: number } | null;
      document_id: string;
      original_filename: string;
      version: number;
      storage_key: string;
      media_type: string;
      claim_id: string;
      claim_text: string;
    }>(
      `select
         c.id, q.organization_id, c.page_number, c.quote_text, c.verdict,
         dc.bbox, d.id as document_id, d.original_filename, d.version, d.storage_key, d.media_type,
         cl.id as claim_id, cl.claim_text
       from citations c
       join claims cl on cl.id = c.claim_id
       join answer_versions av on av.id = cl.answer_version_id
       join questions q on q.id = av.question_id
       join document_chunks dc on dc.id = c.chunk_id
       join documents d on d.id = dc.document_id
       where c.id = $1`,
      [citationId]
    );
    return rows.rows[0] ?? null;
  });
  if (!result) return null;

  return {
    id: result.id,
    organizationId: result.organization_id,
    pageNumber: result.page_number,
    quoteText: result.quote_text,
    verdict: result.verdict,
    bbox: result.bbox,
    document: {
      id: result.document_id,
      filename: result.original_filename,
      version: result.version,
      storageKey: result.storage_key,
      mediaType: result.media_type,
    },
    claim: { id: result.claim_id, claimText: result.claim_text },
  };
}

/** Ordered citations for the question's latest answer version, used to
 * compute S12's 이전/다음 citation navigation. Same ordering as claims
 * (claim_index) then citation id, so the sequence is stable across
 * requests. */
export async function listCitationIdsForQuestion(
  userId: string,
  questionId: string
): Promise<string[]> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<{ id: string }>(
      `select c.id
       from citations c
       join claims cl on cl.id = c.claim_id
       join answer_versions av on av.id = cl.answer_version_id
       where av.question_id = $1
         and av.version = (select max(version) from answer_versions where question_id = $1)
       order by cl.claim_index, c.id`,
      [questionId]
    )
  );
  return result.rows.map((r) => r.id);
}
