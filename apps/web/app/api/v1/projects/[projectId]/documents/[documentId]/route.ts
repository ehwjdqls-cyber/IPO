import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../lib/db";
import { getMembership } from "../../../../../../../lib/membership";
import { DOCUMENT_COLUMNS, toDocumentDto, type DocumentRow } from "../../../../../../../lib/documents";
import { apiError, apiOk } from "../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; documentId: string }> };

async function findDocument(userId: string, documentId: string): Promise<DocumentRow | null> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<DocumentRow>(`select ${DOCUMENT_COLUMNS} from documents where id = $1`, [
      documentId,
    ])
  );
  return result.rows[0] ?? null;
}

export async function GET(_request: Request, { params }: RouteContext) {
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
  if (!membership) {
    return apiError("FORBIDDEN", "해당 문서에 접근할 권한이 없습니다.");
  }

  return apiOk(toDocumentDto(document));
}

/**
 * "삭제"는 spec 19절의 삭제 *요청* -- projects_delete/documents 패턴과 동일하게
 * status를 DELETING으로 바꾸는 UPDATE다. 실제 storage/벡터 인덱스 purge
 * orchestration은 Milestone 4 범위.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
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
    return apiError("FORBIDDEN", "문서를 삭제할 권한이 없습니다.");
  }

  const result = await withRequestScope(
    { userId: user.id, organizationId: document.organization_id },
    (client) =>
      client.query<DocumentRow>(
        `update documents set status = 'DELETING', deleted_at = now(), updated_at = now()
         where id = $1
         returning ${DOCUMENT_COLUMNS}`,
        [documentId]
      )
  );

  if (result.rows.length === 0) {
    return apiError("FORBIDDEN", "문서를 삭제할 권한이 없습니다.");
  }

  return apiOk(toDocumentDto(result.rows[0]!));
}
