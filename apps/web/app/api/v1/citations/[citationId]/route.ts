import { getAuthenticatedUser } from "../../../../../lib/auth";
import { withRequestScope } from "../../../../../lib/db";
import { getMembership } from "../../../../../lib/membership";
import { createPresignedDownloadUrl } from "../../../../../lib/storage";
import { apiError, apiOk } from "../../../../../lib/api/response";

type RouteContext = { params: Promise<{ citationId: string }> };

interface CitationJoinRow {
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
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { citationId } = await params;

  const citation = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<CitationJoinRow>(
      `select
         c.id, q.organization_id, c.page_number, c.quote_text, c.verdict,
         dc.bbox, d.id as document_id, d.original_filename, d.version, d.storage_key
       from citations c
       join claims cl on cl.id = c.claim_id
       join answer_versions av on av.id = cl.answer_version_id
       join questions q on q.id = av.question_id
       join document_chunks dc on dc.id = c.chunk_id
       join documents d on d.id = dc.document_id
       where c.id = $1`,
      [citationId]
    );
    return result.rows[0] ?? null;
  });
  if (!citation) {
    return apiError("NOT_FOUND", "인용을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, citation.organization_id);
  if (!membership) {
    return apiError("FORBIDDEN", "해당 인용에 접근할 권한이 없습니다.");
  }

  const viewerUrl = await createPresignedDownloadUrl(citation.storage_key);

  return apiOk({
    id: citation.id,
    document: {
      id: citation.document_id,
      filename: citation.original_filename,
      version: citation.version,
    },
    pageNumber: citation.page_number,
    quoteText: citation.quote_text,
    bbox: citation.bbox,
    verdict: citation.verdict,
    viewerUrl,
  });
}
