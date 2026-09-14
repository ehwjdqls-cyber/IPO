"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Checkbox } from "../../../../../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../../components/ui/table";

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

export interface QuestionsTableRow {
  id: string;
  questionText: string;
  category: string;
  priority: string;
  evidenceStatus: string;
  reviewStatus: string | null;
  answerVersionId: string | null;
  assigneeDisplayName: string | null;
}

interface OrgMemberOption {
  userId: string;
  displayName: string;
}

export function QuestionsTable({
  projectId,
  questions,
  canManage,
  orgMembers,
}: {
  projectId: string;
  questions: QuestionsTableRow[];
  canManage: boolean;
  orgMembers: OrgMemberOption[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const allSelected = questions.length > 0 && selectedIds.size === questions.length;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(questions.map((q) => q.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulkAssign() {
    if (!assigneeId) return;
    setLoading(true);
    setMessage(null);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/v1/projects/${projectId}/questions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignedTo: assigneeId }),
        }).then((r) => {
          if (!r.ok) throw new Error();
        })
      )
    );
    finishBulk(results, "담당자 지정");
  }

  async function runBulkGenerateAnswers() {
    setLoading(true);
    setMessage(null);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/v1/projects/${projectId}/questions/${id}/answer-jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({}),
        }).then((r) => {
          if (!r.ok) throw new Error();
        })
      )
    );
    finishBulk(results, "답변 생성 작업 시작");
  }

  async function runBulkRequestReview() {
    setLoading(true);
    setMessage(null);
    const targets = questions.filter((q) => selectedIds.has(q.id) && q.answerVersionId);
    const skipped = selectedIds.size - targets.length;
    const results = await Promise.allSettled(
      targets.map((q) =>
        fetch(`/api/v1/answer-versions/${q.answerVersionId}/review-request`, {
          method: "POST",
        }).then((r) => {
          if (!r.ok) throw new Error();
        })
      )
    );
    finishBulk(
      results,
      "검토 요청",
      skipped > 0 ? `(답변이 없는 ${skipped}건은 제외됨)` : undefined
    );
  }

  function finishBulk(results: PromiseSettledResult<void>[], actionLabel: string, extra?: string) {
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    setLoading(false);
    setMessage(
      `${actionLabel}: 성공 ${succeeded}건${failed > 0 ? `, 실패 ${failed}건` : ""}${extra ? ` ${extra}` : ""}`
    );
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canManage && selectedIds.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-medium text-foreground">{selectedIds.size}건 선택됨</span>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="담당자 선택" />
            </SelectTrigger>
            <SelectContent>
              {orgMembers.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={runBulkAssign} disabled={loading || !assigneeId}>
            담당자 지정
          </Button>
          <Button size="sm" variant="outline" onClick={runBulkGenerateAnswers} disabled={loading}>
            답변 생성
          </Button>
          <Button size="sm" variant="outline" onClick={runBulkRequestReview} disabled={loading}>
            검토 요청
          </Button>
          <Button size="sm" variant="outline" disabled title="Milestone 4에서 제공 예정">
            내보내기
          </Button>
        </Card>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && (
                <TableHead className="w-8">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="전체 선택" />
                </TableHead>
              )}
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
                {canManage && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(question.id)}
                      onCheckedChange={() => toggleOne(question.id)}
                      aria-label={`${question.questionText} 선택`}
                    />
                  </TableCell>
                )}
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
    </div>
  );
}
