import { can, completeUploadRequestSchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { withRequestScope } from "../../../../../../../../lib/db";
import { getMembership } from "../../../../../../../../lib/membership";
import {
  DOCUMENT_COLUMNS,
  toDocumentDto,
  type DocumentRow,
} from "../../../../../../../../lib/documents";
import { apiError, apiOk } from "../../../../../../../../lib/api/response";
import { getIdempotencyKey } from "../../../../../../../../lib/api/idempotency";
import { isUniqueViolation } from "../../../../../../../../lib/api/postgres-errors";

type RouteContext = { params: Promise<{ projectId: string; uploadId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  const { uploadId } = await params;

  const document = await withRequestScope({ userId: user.id }, async (client) => {
    const result = await client.query<DocumentRow>(
      `select ${DOCUMENT_COLUMNS} from documents where id = $1`,
      [uploadId]
    );
    return result.rows[0] ?? null;
  });
  if (!document) {
    return apiError("NOT_FOUND", "업로드 세션을 찾을 수 없습니다.");
  }

  const membership = await getMembership(user.id, document.organization_id);
  if (!membership || !can(membership.role, "document.manage")) {
    return apiError("FORBIDDEN", "업로드를 완료할 권한이 없습니다.");
  }

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return apiError("VALIDATION_ERROR", "Idempotency-Key 헤더가 필요합니다.");
  }

  const body = await request.json().catch(() => null);
  const parsed = completeUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "입력값을 확인해주세요.", { issues: parsed.error.issues });
  }

  if (parsed.data.sha256.toLowerCase() !== document.sha256.toLowerCase()) {
    return apiError("VALIDATION_ERROR", "업로드된 파일의 SHA-256이 기록된 값과 일치하지 않습니다.");
  }
  if (parsed.data.byteSize !== Number(document.byte_size)) {
    return apiError("VALIDATION_ERROR", "업로드된 파일 크기가 기록된 값과 일치하지 않습니다.");
  }

  const { updatedDocument, job } = await withRequestScope(
    { userId: user.id, organizationId: document.organization_id },
    async (client) => {
      const updated = await client.query<DocumentRow>(
        `update documents set status = 'SCANNING', updated_at = now()
         where id = $1
         returning ${DOCUMENT_COLUMNS}`,
        [uploadId]
      );

      let createdJob: { id: string; status: string };
      try {
        const inserted = await client.query<{ id: string; status: string }>(
          `insert into jobs (organization_id, project_id, type, idempotency_key, input, created_by)
           values ($1, $2, 'DOCUMENT_PROCESS', $3, $4, $5)
           returning id, status`,
          [
            document.organization_id,
            document.project_id,
            idempotencyKey,
            JSON.stringify({ documentId: uploadId }),
            user.id,
          ]
        );
        createdJob = inserted.rows[0]!;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await client.query<{ id: string; status: string }>(
          `select id, status from jobs where organization_id = $1 and idempotency_key = $2`,
          [document.organization_id, idempotencyKey]
        );
        createdJob = existing.rows[0]!;
      }

      return { updatedDocument: updated.rows[0]!, job: createdJob };
    }
  );

  return apiOk({
    document: toDocumentDto(updatedDocument),
    job: { id: job.id, status: job.status },
  });
}

