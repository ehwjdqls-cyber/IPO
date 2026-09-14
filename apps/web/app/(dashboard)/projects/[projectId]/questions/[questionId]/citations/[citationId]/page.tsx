import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../../../../lib/auth";
import { findProjectById } from "../../../../../../../../lib/queries/projects";
import { getMembership } from "../../../../../../../../lib/membership";
import {
  findCitationDetail,
  listCitationIdsForQuestion,
} from "../../../../../../../../lib/queries/citations";
import { createPresignedDownloadUrl } from "../../../../../../../../lib/storage";
import { Badge } from "../../../../../../../../components/ui/badge";
import { Card } from "../../../../../../../../components/ui/card";
import { CitationFeedbackForm } from "./citation-feedback-form";

const VERDICT_LABEL: Record<string, string> = {
  SUPPORTS: "지지",
  PARTIAL: "일부 지지",
  CONFLICTS: "상충",
};

export default async function CitationViewerPage({
  params,
}: {
  params: Promise<{ projectId: string; questionId: string; citationId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const { projectId, questionId, citationId } = await params;
  const project = await findProjectById(user.id, projectId);
  if (!project) {
    notFound();
  }

  const membership = await getMembership(user.id, project.organizationId);
  if (!membership) {
    notFound();
  }

  const citation = await findCitationDetail(user.id, citationId);
  if (!citation || citation.organizationId !== project.organizationId) {
    notFound();
  }

  const citationIds = await listCitationIdsForQuestion(user.id, questionId);
  const currentIndex = citationIds.indexOf(citationId);
  const prevId = currentIndex > 0 ? citationIds[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 && currentIndex < citationIds.length - 1 ? citationIds[currentIndex + 1] : null;

  const isPdf = citation.document.mediaType === "application/pdf";
  const viewerUrl = isPdf ? await createPresignedDownloadUrl(citation.document.storageKey) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href={`/projects/${projectId}/questions/${questionId}`}
        className="text-sm text-muted-foreground underline"
      >
        워크스페이스로 돌아가기
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{citation.document.filename}</h1>
          <p className="text-sm text-muted-foreground">
            v{citation.document.version} · {citation.pageNumber}쪽
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-3">
          {viewerUrl ? (
            <iframe
              src={`${viewerUrl}#page=${citation.pageNumber}`}
              title={citation.document.filename}
              className="h-[75vh] w-full rounded-md border border-border"
            />
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              이 파일 형식은 화면 내 미리보기를 지원하지 않습니다.
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-2 p-3">
            <h2 className="text-sm font-medium text-foreground">연결된 주장</h2>
            <p className="text-sm text-muted-foreground">{citation.claim.claimText}</p>
          </Card>

          <Card className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">인용문</h2>
              <Badge
                variant={
                  citation.verdict === "CONFLICTS"
                    ? "destructive"
                    : citation.verdict === "PARTIAL"
                      ? "secondary"
                      : "default"
                }
              >
                {VERDICT_LABEL[citation.verdict] ?? citation.verdict}
              </Badge>
            </div>
            <p className="text-sm text-foreground">&quot;{citation.quoteText}&quot;</p>
          </Card>

          <CitationFeedbackForm citationId={citationId} />
        </div>
      </div>

      <Card className="flex items-center justify-between p-3 text-sm">
        <Link
          href={
            prevId
              ? `/projects/${projectId}/questions/${questionId}/citations/${prevId}`
              : "#"
          }
          aria-disabled={!prevId}
          className={prevId ? "underline" : "pointer-events-none text-muted-foreground/50"}
        >
          이전 citation
        </Link>
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {citationIds.length}
        </span>
        <Link
          href={
            nextId
              ? `/projects/${projectId}/questions/${questionId}/citations/${nextId}`
              : "#"
          }
          aria-disabled={!nextId}
          className={nextId ? "underline" : "pointer-events-none text-muted-foreground/50"}
        >
          다음 citation
        </Link>
      </Card>
    </div>
  );
}
