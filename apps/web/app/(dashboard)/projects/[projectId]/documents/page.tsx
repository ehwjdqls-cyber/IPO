import { notFound } from "next/navigation";
import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../lib/auth";
import { findProjectById } from "../../../../../lib/queries/projects";
import { getMembership } from "../../../../../lib/membership";
import { listDocuments } from "../../../../../lib/queries/documents";
import { Badge } from "../../../../../components/ui/badge";
import { Card } from "../../../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../../components/ui/table";
import { UploadForm } from "./upload-form";
import { DocumentRowActions } from "./document-row-actions";

const STATUS_LABEL: Record<string, string> = {
  UPLOADED: "업로드됨",
  SCANNING: "검사 중",
  EXTRACTING: "추출 중",
  INDEXING: "색인 중",
  READY: "준비됨",
  FAILED: "실패",
  DELETING: "삭제 중",
  DELETED: "삭제됨",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  READY: "default",
  FAILED: "destructive",
  UPLOADED: "outline",
  SCANNING: "secondary",
  EXTRACTING: "secondary",
  INDEXING: "secondary",
  DELETING: "outline",
  DELETED: "outline",
};

const MEDIA_TYPE_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const { projectId } = await params;
  const project = await findProjectById(user.id, projectId);
  if (!project) {
    notFound();
  }

  const membership = await getMembership(user.id, project.organizationId);
  if (!membership) {
    notFound();
  }

  const documents = await listDocuments(user.id, project.organizationId, projectId);
  const canManage = can(membership.role, "document.manage");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">문서 센터</h1>
          <p className="text-sm text-muted-foreground">{project.companyNameKo}</p>
        </div>
        {canManage && <UploadForm projectId={projectId} />}
      </div>

      {documents.length === 0 ? (
        <Card className="border-dashed">
          <p className="p-12 text-center text-sm text-muted-foreground">
            아직 업로드된 문서가 없습니다. PDF, DOCX, XLSX 파일을 업로드해주세요 (파일당 최대
            50MB).
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>파일명</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>버전</TableHead>
                <TableHead>페이지</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>업로드 시각</TableHead>
                {canManage && <TableHead className="text-right">작업</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium text-foreground">
                    {doc.originalFilename}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {MEDIA_TYPE_LABEL[doc.mediaType] ?? doc.mediaType}
                  </TableCell>
                  <TableCell className="text-muted-foreground">v{doc.version}</TableCell>
                  <TableCell className="text-muted-foreground">{doc.pageCount ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[doc.status] ?? "outline"}>
                      {STATUS_LABEL[doc.status] ?? doc.status}
                    </Badge>
                    {doc.status === "FAILED" && doc.failureMessage && (
                      <p className="mt-1 text-xs text-destructive">{doc.failureMessage}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <DocumentRowActions projectId={projectId} documentId={doc.id} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
