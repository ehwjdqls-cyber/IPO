import "server-only";
import { withRequestScope } from "../db";
import { DOCUMENT_COLUMNS, toDocumentDto, type DocumentDto, type DocumentRow } from "../documents";

/** Same read path as GET /api/v1/projects/{projectId}/documents -- kept
 * here so the S06 Server Component page can call it directly instead of
 * self-fetching the API route. */
export async function listDocuments(
  userId: string,
  organizationId: string,
  projectId: string
): Promise<DocumentDto[]> {
  const result = await withRequestScope({ userId, organizationId }, (client) =>
    client.query<DocumentRow>(
      `select ${DOCUMENT_COLUMNS} from documents
       where project_id = $1 and deleted_at is null
       order by created_at desc`,
      [projectId]
    )
  );
  return result.rows.map(toDocumentDto);
}

/** Same read path as GET /api/v1/projects/{projectId}/documents/{documentId}
 * -- kept here so the S07 Server Component page can call it directly. */
export async function findDocumentById(userId: string, documentId: string): Promise<DocumentDto | null> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<DocumentRow>(`select ${DOCUMENT_COLUMNS} from documents where id = $1`, [
      documentId,
    ])
  );
  return result.rows[0] ? toDocumentDto(result.rows[0]) : null;
}
