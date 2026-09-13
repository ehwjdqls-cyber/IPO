import { randomUUID } from "node:crypto";
import { can, createUploadRequestSchema, extensionForMediaType } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../lib/db";
import { getMembership } from "../../../../../../lib/membership";
import { findProjectById } from "../../../../../../lib/queries/projects";
import { createPresignedUploadUrl } from "../../../../../../lib/storage";
import { apiError, apiOk } from "../../../../../../lib/api/response";

type RouteContext = { params: Promise<{ projectId: string }> };

const UPLOAD_URL_TTL_SECONDS = 300; // 5분, spec 32절 threat model

export async function POST(request: Request, { params }: RouteContext) {
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
  if (!membership || !can(membership.role, "document.manage")) {
    return apiError("FORBIDDEN", "문서를 업로드할 권한이 없습니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }
  const { filename, mediaType, byteSize, sha256, allowDuplicate } = parsed.data;

  type UploadResult =
    | { duplicate: { id: string; version: number } }
    | { documentId: string; storageKey: string };

  const result = await withRequestScope<UploadResult>(
    { userId: user.id, organizationId: project.organizationId },
    async (client) => {
      const existing = await client.query<{ id: string; version: number }>(
        `select id, version from documents
         where project_id = $1 and sha256 = $2 and deleted_at is null
         order by version desc limit 1`,
        [projectId, sha256]
      );

      if (existing.rows.length > 0 && !allowDuplicate) {
        return { duplicate: existing.rows[0]! };
      }

      const documentId = randomUUID();
      const version = existing.rows.length > 0 ? existing.rows[0]!.version + 1 : 1;
      const storageKey = `${project.organizationId}/${projectId}/${documentId}${extensionForMediaType(mediaType)}`;

      const inserted = await client.query<{ id: string }>(
        `insert into documents
           (id, organization_id, project_id, original_filename, storage_key, media_type,
            byte_size, sha256, version, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          documentId,
          project.organizationId,
          projectId,
          filename,
          storageKey,
          mediaType,
          byteSize,
          sha256,
          version,
          user.id,
        ]
      );

      return { documentId: inserted.rows[0]!.id, storageKey };
    }
  );

  if ("duplicate" in result) {
    return apiError("CONFLICT", "동일한 내용의 파일이 이미 업로드되어 있습니다.", {
      duplicateDocumentId: result.duplicate.id,
    });
  }

  const putUrl = await createPresignedUploadUrl(result.storageKey, mediaType, UPLOAD_URL_TTL_SECONDS);

  return apiOk(
    {
      uploadId: result.documentId,
      documentId: result.documentId,
      putUrl,
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
      requiredHeaders: { "Content-Type": mediaType },
    },
    { status: 201 }
  );
}
