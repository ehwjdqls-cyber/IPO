import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../lib/membership";
import {
  DOCUMENT_COLUMNS,
  toDocumentDto,
  type DocumentRow,
} from "../../../../../../../../lib/documents";
import { apiError, apiOk } from "../../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; documentId: string }> };

async function findDocument(userId: string, documentId: string): Promise<DocumentRow | null> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<DocumentRow>(`select ${DOCUMENT_COLUMNS} from documents where id = $1`, [
      documentId,
    ])
  );
  return result.rows[0] ?? null;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { documentId } = await params;
  const document = await findDocument(user.id, documentId);
  if (!document) {
    return apiError("NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, document.organization_id);
  if (!membership || !can(membership.role, "document.manage")) {
    return apiError("FORBIDDEN", "문서를 재처리할 권한이 없습니다.");
  }

  const { updatedDocument, job } = await withRequestScope(
    { userId: user.id, organizationId: document.organization_id },
    async (client) => {
      const updated = await client.query<DocumentRow>(
        `update documents
         set status = 'SCANNING', failure_code = null, failure_message = null, updated_at = now()
         where id = $1
         returning ${DOCUMENT_COLUMNS}`,
        [documentId]
      );
      const createdJob = await client.query<{ id: string; status: string }>(
        `insert into jobs (organization_id, project_id, type, idempotency_key, input, created_by)
         values ($1, $2, 'DOCUMENT_PROCESS', $3, $4, $5)
         returning id, status`,
        [
          document.organization_id,
          document.project_id,
          `document-reprocess-${documentId}-${Date.now()}`,
          JSON.stringify({ documentId }),
          user.id,
        ]
      );
      return { updatedDocument: updated.rows[0]!, job: createdJob.rows[0]! };
    }
  );

  return apiOk({
    document: toDocumentDto(updatedDocument),
    job: { id: job.id, status: job.status },
  });
}
