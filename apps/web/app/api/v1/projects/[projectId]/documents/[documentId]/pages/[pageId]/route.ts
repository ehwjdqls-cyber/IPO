import { can, updateDocumentPageRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../../lib/membership";
import type { DocumentRow } from "../../../../../../../../../lib/documents";
import {
  DOCUMENT_PAGE_COLUMNS,
  toDocumentPageDto,
  type DocumentPageRow,
} from "../../../../../../../../../lib/document-pages";
import { apiError, apiOk } from "../../../../../../../../../lib/api/response";

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string; pageId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { documentId, pageId } = await params;

  const document = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<DocumentRow>(
      "select id, organization_id, project_id from documents where id = $1",
      [documentId]
    );
    return result.rows[0] ?? null;
  });
  if (!document) {
    return apiError("NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, document.organization_id);
  if (!membership || !can(membership.role, "document.manage")) {
    return apiError("FORBIDDEN", "페이지를 변경할 권한이 없습니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = updateDocumentPageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }

  const page = await withRequestScope(
    { userId: user.id, organizationId: document.organization_id },
    async (client) => {
      const result = await client.query<DocumentPageRow>(
        `update document_pages set excluded = $1
         where id = $2 and document_id = $3
         returning ${DOCUMENT_PAGE_COLUMNS}`,
        [parsed.data.excluded, pageId, documentId]
      );
      return result.rows[0] ?? null;
    }
  );

  if (!page) {
    return apiError("NOT_FOUND", "페이지를 찾을 수 없습니다.");
  }

  return apiOk(toDocumentPageDto(page));
}
