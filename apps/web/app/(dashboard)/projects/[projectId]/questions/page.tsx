import Link from "next/link";
import { notFound } from "next/navigation";
import { listQuestionsQuerySchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../lib/auth";
import { findProjectById } from "../../../../../lib/queries/projects";
import { getMembership } from "../../../../../lib/membership";
import { listQuestionsWithKpi } from "../../../../../lib/queries/questions";
import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../../components/ui/table";
import { QuestionsFilterToolbar } from "./questions-filter-toolbar";

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

const REVIEW_STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안",
  NEEDS_REVIEW: "검토 대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

export default async function QuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const rawSearchParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawSearchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ])
  );
  const parsedFilters = listQuestionsQuerySchema.safeParse(flatParams);
  const filters = parsedFilters.success ? parsedFilters.data : {};

  const { kpi, questions } = await listQuestionsWithKpi(
    user.id,
    project.organizationId,
    projectId,
    filters
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Q&amp;A 목록</h1>
          <p className="text-sm text-muted-foreground">{project.companyNameKo}</p>
        </div>
        <Button asChild>
          <Link href={`/projects/${projectId}/questions/generate`}>질문 생성</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "전체", value: kpi.total },
          { label: "미작성", value: kpi.unanswered },
          { label: "근거 부족", value: kpi.needsEvidence },
          { label: "충돌", value: kpi.conflict, emphasize: true },
          { label: "검토 대기", value: kpi.needsReview },
          { label: "승인", value: kpi.approved },
        ].map((item) => (
          <Card key={item.label} className="p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p
              className={`text-xl font-semibold ${
                item.emphasize && item.value > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {item.value}
            </p>
          </Card>
        ))}
      </div>

      <QuestionsFilterToolbar projectId={projectId} initialFilters={flatParams} />

      {questions.length === 0 ? (
        <Card className="border-dashed">
          <p className="p-12 text-center text-sm text-muted-foreground">
            조건에 맞는 질문이 없습니다. 아직 질문을 생성하지 않았다면 위의 &quot;질문 생성&quot;
            버튼을 이용해주세요.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">번호</TableHead>
                <TableHead>질문</TableHead>
                <TableHead>카테고리</TableHead>
                <TableHead>중요도</TableHead>
                <TableHead>근거상태</TableHead>
                <TableHead>담당자</TableHead>
                <TableHead>검토상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((question, index) => (
                <TableRow key={question.id}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="max-w-md font-medium text-foreground">
                    <Link
                      href={`/projects/${projectId}/questions/${question.id}`}
                      className="hover:underline"
                    >
                      {question.questionText}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {CATEGORY_LABEL[question.category] ?? question.category}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {PRIORITY_LABEL[question.priority] ?? question.priority}
                  </TableCell>
                  <TableCell>
                    <Badge variant={EVIDENCE_STATUS_VARIANT[question.evidenceStatus] ?? "outline"}>
                      {EVIDENCE_STATUS_LABEL[question.evidenceStatus] ?? question.evidenceStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {question.assigneeDisplayName ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {question.reviewStatus ? REVIEW_STATUS_LABEL[question.reviewStatus] ?? question.reviewStatus : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
