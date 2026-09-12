import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../lib/db";
import { getMembership } from "../../../../../../lib/membership";
import { findProjectById } from "../../../../../../lib/queries/projects";
import { DOCUMENT_COLUMNS, toDocumentDto, type DocumentRow } from "../../../../../../lib/documents";
import { apiError, apiOk } from "../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { projectId } = await params;
  const project = await findProjectById(user.id, projectId);
  if (!project) {
    return apiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, project.organizationId);
  if (!membership) {
    return apiError("FORBIDDEN", "해당 프로젝트에 접근할 권한이 없습니다.");
  }

  const rows = await withRequestScope(
    { userId: user.id, organizationId: project.organizationId },
    (client) =>
      client.query<DocumentRow>(
        `select ${DOCUMENT_COLUMNS} from documents
         where project_id = $1 and deleted_at is null
         order by created_at desc`,
        [projectId]
      )
  );

  return apiOk({ documents: rows.rows.map(toDocumentDto) });
}
