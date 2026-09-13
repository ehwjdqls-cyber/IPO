import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../lib/membership";
import type { DocumentRow } from "../../../../../../../../lib/documents";
import {
  DOCUMENT_PAGE_COLUMNS,
  toDocumentPageDto,
  type DocumentPageRow,
} from "../../../../../../../../lib/document-pages";
import { apiError, apiOk } from "../../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; documentId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { documentId } = await params;

  const { document, pages } = await withRequestScope({ userId: user.id }, async (client) => {
    const documentResult = await client.query<DocumentRow>(
      "select id, organization_id, project_id from documents where id = $1",
      [documentId]
    );
    const foundDocument = documentResult.rows[0] ?? null;
    if (!foundDocument) {
      return { document: null, pages: [] as DocumentPageRow[] };
    }
    const pagesResult = await client.query<DocumentPageRow>(
      `select ${DOCUMENT_PAGE_COLUMNS} from document_pages
       where document_id = $1
       order by page_number asc`,
      [documentId]
    );
    return { document: foundDocument, pages: pagesResult.rows };
  });

  if (!document) {
    return apiError("NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, document.organization_id);
  if (!membership) {
    return apiError("FORBIDDEN", "해당 문서에 접근할 권한이 없습니다.");
  }

  return apiOk(pages.map(toDocumentPageDto));
}
