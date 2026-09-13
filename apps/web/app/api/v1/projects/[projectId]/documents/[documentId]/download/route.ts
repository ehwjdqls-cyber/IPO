import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../lib/membership";
import type { DocumentRow } from "../../../../../../../../lib/documents";
import { createPresignedDownloadUrl } from "../../../../../../../../lib/storage";
import { apiError, apiOk } from "../../../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string; documentId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { documentId } = await params;

  const document = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<DocumentRow>(
      "select id, organization_id, project_id, storage_key, original_filename from documents where id = $1",
      [documentId]
    );
    return result.rows[0] ?? null;
  });
  if (!document) {
    return apiError("NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, document.organization_id);
  if (!membership) {
    return apiError("FORBIDDEN", "해당 문서에 접근할 권한이 없습니다.");
  }

  const url = await createPresignedDownloadUrl(document.storage_key);
  return apiOk({ url, filename: document.original_filename });
}
