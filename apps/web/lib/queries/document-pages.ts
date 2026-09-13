import "server-only";
import { withRequestScope } from "../db";
import {
  DOCUMENT_PAGE_COLUMNS,
  toDocumentPageDto,
  type DocumentPageDto,
  type DocumentPageRow,
} from "../document-pages";

/** Same read path as GET .../documents/{documentId}/pages -- kept here so
 * the S07 Server Component page can call it directly. */
export async function listDocumentPages(userId: string, documentId: string): Promise<DocumentPageDto[]> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<DocumentPageRow>(
      `select ${DOCUMENT_PAGE_COLUMNS} from document_pages
       where document_id = $1
       order by page_number asc`,
      [documentId]
    )
  );
  return result.rows.map(toDocumentPageDto);
}
