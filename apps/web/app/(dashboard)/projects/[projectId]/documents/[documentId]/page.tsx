import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { findProjectById } from "../../../../../../lib/queries/projects";
import { getMembership } from "../../../../../../lib/membership";
import { findDocumentById } from "../../../../../../lib/queries/documents";
import { listDocumentPages } from "../../../../../../lib/queries/document-pages";
import { listDocumentJobs } from "../../../../../../lib/queries/jobs";
import { createPresignedDownloadUrl } from "../../../../../../lib/storage";
import { Badge } from "../../../../../../components/ui/badge";
import { Card } from "../../../../../../components/ui/card";
import { AutoRefresh } from "../../../../../../components/auto-refresh";
import { PageSearch } from "./page-search";
import { ExcludePageToggle } from "./exclude-page-toggle";
import { ReprocessButton } from "./reprocess-button";

const PROCESSING_STATUSES = new Set(["UPLOADED", "SCANNING", "EXTRACTING", "INDEXING"]);

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

const JOB_STATUS_LABEL: Record<string, string> = {
  QUEUED: "대기 중",
  RUNNING: "진행 중",
  SUCCEEDED: "성공",
  FAILED: "실패",
  CANCELLED: "취소됨",
};

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const { projectId, documentId } = await params;
  const project = await findProjectById(user.id, projectId);
  if (!project) {
    notFound();
  }

  const document = await findDocumentById(user.id, documentId);
  if (!document) {
    notFound();
  }

  const membership = await getMembership(user.id, document.organizationId);
  if (!membership) {
    notFound();
  }

  const [pages, jobs] = await Promise.all([
    listDocumentPages(user.id, documentId),
    listDocumentJobs(user.id, documentId),
  ]);
  const canManage = can(membership.role, "document.manage");
  const previewUrl =
    document.mediaType === "application/pdf"
      ? await createPresignedDownloadUrl(document.storageKey)
      : null;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <AutoRefresh active={PROCESSING_STATUSES.has(document.status)} />
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/projects/${projectId}/documents`}
            className="text-sm text-muted-foreground underline"
          >
            문서 센터로 돌아가기
          </Link>
          <h1 className="text-lg font-semibold text-foreground">{document.originalFilename}</h1>
        </div>
        {canManage && <ReprocessButton projectId={projectId} documentId={documentId} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr_360px]">
        <Card className="p-3">
          <h2 className="mb-2 text-sm font-medium text-foreground">페이지</h2>
          <PageSearch
            pages={pages.map((p) => ({
              id: p.id,
              pageNumber: p.pageNumber,
              excluded: p.excluded,
              preview: p.extractedText.slice(0, 80),
            }))}
          />
        </Card>

        <Card className="p-3">
          <h2 className="mb-2 text-sm font-medium text-foreground">원문</h2>
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title={document.originalFilename}
              className="h-[70vh] w-full rounded-md border border-border"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              이 파일 형식은 화면 내 미리보기를 지원하지 않습니다. 문서 센터의 &quot;다운로드&quot;를
              이용해주세요.
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-3">
            <h2 className="mb-2 text-sm font-medium text-foreground">메타데이터</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">상태</dt>
                <dd>
                  <Badge>{STATUS_LABEL[document.status] ?? document.status}</Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">버전</dt>
                <dd className="text-foreground">v{document.version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">페이지 수</dt>
                <dd className="text-foreground">{document.pageCount ?? "-"}</dd>
              </div>
              {document.status === "FAILED" && document.failureMessage && (
                <p className="mt-1 text-xs text-destructive">{document.failureMessage}</p>
              )}
            </dl>
          </Card>

          <Card className="p-3">
            <h2 className="mb-2 text-sm font-medium text-foreground">표 목록</h2>
            <p className="text-sm text-muted-foreground">
              표 구조 추출 기능은 아직 지원되지 않습니다.
            </p>
          </Card>

          <Card className="p-3">
            <h2 className="mb-2 text-sm font-medium text-foreground">처리 로그</h2>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 처리 이력이 없습니다.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {jobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between">
                    <Link
                      href={`/projects/${projectId}/jobs/${job.id}`}
                      className="text-foreground underline"
                    >
                      {JOB_STATUS_LABEL[job.status] ?? job.status}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-3">
            <h2 className="mb-2 text-sm font-medium text-foreground">추출 텍스트</h2>
            {pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 추출된 페이지가 없습니다.</p>
            ) : (
              <ul className="space-y-4">
                {pages.map((page) => (
                  <li key={page.id} id={`page-${page.pageNumber}`} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {page.pageNumber}쪽
                      </span>
                      {canManage && (
                        <ExcludePageToggle
                          projectId={projectId}
                          documentId={documentId}
                          pageId={page.id}
                          excluded={page.excluded}
                        />
                      )}
                    </div>
                    <p
                      className={`whitespace-pre-wrap text-sm ${
                        page.excluded ? "text-muted-foreground line-through" : "text-foreground"
                      }`}
                    >
                      {page.extractedText || "(추출된 텍스트 없음)"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
