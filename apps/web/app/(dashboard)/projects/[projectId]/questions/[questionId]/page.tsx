import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { findProjectById } from "../../../../../../lib/queries/projects";
import { getMembership } from "../../../../../../lib/membership";
import {
  findQuestionWorkspaceData,
  listQuestionsForWorkspaceNav,
} from "../../../../../../lib/queries/questions";
import { Badge } from "../../../../../../components/ui/badge";
import { Card } from "../../../../../../components/ui/card";
import { AnswerEditor } from "./answer-editor";
import { GenerateAnswerButton } from "./generate-answer-button";
import { ReviewActions } from "./review-actions";

const CATEGORY_LABEL: Record<string, string> = {
  BUSINESS: "사업모델·성장성",
  FINANCE: "재무·수익성",
  CUSTOMER: "고객·거래처",
  GOVERNANCE: "지배구조",
  INTERNAL_CONTROL: "내부통제",
  RISK: "주요 위험",
};

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: "긴급",
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  UNANSWERED: "미작성",
  SUPPORTED: "지원됨",
  PARTIAL: "일부 지원",
  NEEDS_EVIDENCE: "근거 부족",
  CONFLICT: "충돌",
};

const EVIDENCE_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  UNANSWERED: "outline",
  SUPPORTED: "default",
  PARTIAL: "secondary",
  NEEDS_EVIDENCE: "secondary",
  CONFLICT: "destructive",
};

const VERDICT_LABEL: Record<string, string> = {
  SUPPORTS: "지지",
  PARTIAL: "일부 지지",
  CONFLICTS: "상충",
};

export default async function QuestionWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string; questionId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const { projectId, questionId } = await params;
  const project = await findProjectById(user.id, projectId);
  if (!project) {
    notFound();
  }

  const membership = await getMembership(user.id, project.organizationId);
  if (!membership) {
    notFound();
  }

  const data = await findQuestionWorkspaceData(user.id, project.organizationId, questionId);
  if (!data || data.question.projectId !== projectId) {
    notFound();
  }

  const { question, answerVersion } = data;
  const siblings = await listQuestionsForWorkspaceNav(user.id, project.organizationId, projectId);
  const currentIndex = siblings.findIndex((q) => q.id === questionId);
  const prevQuestion = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextQuestion =
    currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  const canEdit = can(membership.role, "job.manage");
  const allCitations = answerVersion?.claims.flatMap((c) => c.citations) ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Link
        href={`/projects/${projectId}/questions`}
        className="text-sm text-muted-foreground underline"
      >
        Q&amp;A 목록으로 돌아가기
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_400px]">
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <Link
              href={prevQuestion ? `/projects/${projectId}/questions/${prevQuestion.id}` : "#"}
              aria-disabled={!prevQuestion}
              className={prevQuestion ? "underline" : "pointer-events-none text-muted-foreground/50"}
            >
              이전
            </Link>
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {siblings.length}
            </span>
            <Link
              href={nextQuestion ? `/projects/${projectId}/questions/${nextQuestion.id}` : "#"}
              aria-disabled={!nextQuestion}
              className={nextQuestion ? "underline" : "pointer-events-none text-muted-foreground/50"}
            >
              다음
            </Link>
          </div>
          <ul className="space-y-1 text-sm">
            {siblings.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/projects/${projectId}/questions/${s.id}`}
                  className={`block truncate rounded-md px-2 py-1 ${
                    s.id === questionId ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.questionText}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline">{CATEGORY_LABEL[question.category] ?? question.category}</Badge>
              <Badge>{PRIORITY_LABEL[question.priority] ?? question.priority}</Badge>
            </div>
            <h1 className="text-lg font-semibold text-foreground">{question.questionText}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{question.rationale}</p>
            {question.followUpQuestions.length > 0 && (
              <div className="mt-3">
                <h2 className="text-xs font-medium text-muted-foreground">꼬리질문</h2>
                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                  {question.followUpQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {answerVersion ? (
            <>
              <AnswerEditor
                projectId={projectId}
                questionId={questionId}
                baseVersion={answerVersion.version}
                initialBodyMarkdown={answerVersion.bodyMarkdown}
                claims={answerVersion.claims}
                canEdit={canEdit}
              />
              <Card className="p-4">
                <h2 className="mb-2 text-sm font-medium text-foreground">주장별 근거</h2>
                <ul className="space-y-3">
                  {answerVersion.claims.map((claim) => (
                    <li key={claim.id} className="text-sm">
                      <p className="text-foreground">{claim.claimText}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {claim.citations.length === 0 ? (
                          <span className="text-xs text-muted-foreground">근거 없음</span>
                        ) : (
                          claim.citations.map((citation, i) => (
                            <Link
                              key={citation.id}
                              href={`/projects/${projectId}/questions/${questionId}/citations/${citation.id}`}
                            >
                              <Badge variant="outline">C{i + 1}</Badge>
                            </Link>
                          ))
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
              <ReviewActions
                projectId={projectId}
                questionId={questionId}
                answerVersionId={answerVersion.id}
                reviewStatus={answerVersion.reviewStatus}
                canRequestReview={canEdit}
                canReview={membership.role === "REVIEWER" || membership.role === "ADMIN" || membership.role === "OWNER"}
              />
            </>
          ) : (
            <Card className="border-dashed p-8 text-center">
              <p className="mb-3 text-sm text-muted-foreground">아직 생성된 답변이 없습니다.</p>
              {canEdit && <GenerateAnswerButton projectId={projectId} questionId={questionId} />}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {answerVersion && answerVersion.evidenceStatus !== "SUPPORTED" && (
            <Card
              className={`p-3 text-sm ${
                answerVersion.evidenceStatus === "CONFLICT"
                  ? "border-destructive/50 text-destructive"
                  : "border-amber-500/50 text-amber-600 dark:text-amber-400"
              }`}
            >
              <Badge variant={EVIDENCE_STATUS_VARIANT[answerVersion.evidenceStatus] ?? "outline"}>
                {EVIDENCE_STATUS_LABEL[answerVersion.evidenceStatus] ?? answerVersion.evidenceStatus}
              </Badge>
              <p className="mt-1">
                {answerVersion.evidenceStatus === "CONFLICT"
                  ? "문서 간 근거가 서로 상충합니다. 검토가 필요합니다."
                  : "일부 주장에 대한 근거가 부족합니다."}
              </p>
            </Card>
          )}

          <Card className="p-3">
            <h2 className="mb-2 text-sm font-medium text-foreground">근거 카드</h2>
            {allCitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 근거가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {allCitations.map((citation) => (
                  <li key={citation.id}>
                    <Link
                      href={`/projects/${projectId}/questions/${questionId}/citations/${citation.id}`}
                      className="block"
                    >
                      <Card className="space-y-1 p-2 text-sm hover:bg-muted">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{citation.pageNumber}쪽</Badge>
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
                        <p className="line-clamp-2 text-muted-foreground">{citation.quoteText}</p>
                      </Card>
                    </Link>
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
