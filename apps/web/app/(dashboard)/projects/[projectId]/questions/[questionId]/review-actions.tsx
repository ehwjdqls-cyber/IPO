"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "../../../../../../components/ui/badge";
import { Button } from "../../../../../../components/ui/button";
import { Card } from "../../../../../../components/ui/card";
import { Input } from "../../../../../../components/ui/input";

const REVIEW_STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안",
  NEEDS_REVIEW: "검토 대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

export function ReviewActions({
  answerVersionId,
  reviewStatus,
  canRequestReview,
  canReview,
}: {
  projectId: string;
  questionId: string;
  answerVersionId: string;
  reviewStatus: string;
  canRequestReview: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  async function requestReview() {
    setError(null);
    setLoading(true);
    const response = await fetch(`/api/v1/answer-versions/${answerVersionId}/review-request`, {
      method: "POST",
    });
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "검토를 요청하지 못했습니다.");
      return;
    }
    router.refresh();
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    setError(null);
    setLoading(true);
    const response = await fetch(`/api/v1/answer-versions/${answerVersionId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
    });
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "검토 결정을 저장하지 못했습니다.");
      return;
    }
    router.refresh();
  }

  return (
    <Card className="flex flex-wrap items-center gap-2 p-3">
      <span className="text-sm text-muted-foreground">검토 상태</span>
      <Badge>{REVIEW_STATUS_LABEL[reviewStatus] ?? reviewStatus}</Badge>

      {error && <p className="w-full text-sm text-destructive">{error}</p>}

      {canRequestReview && (reviewStatus === "DRAFT" || reviewStatus === "REJECTED") && (
        <Button size="sm" onClick={requestReview} disabled={loading}>
          검토 요청
        </Button>
      )}

      {canReview && reviewStatus === "NEEDS_REVIEW" && (
        <>
          <Input
            placeholder="반려 사유 (선택)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-48"
          />
          <Button size="sm" onClick={() => decide("APPROVED")} disabled={loading}>
            승인
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => decide("REJECTED")}
            disabled={loading}
          >
            반려
          </Button>
        </>
      )}
    </Card>
  );
}
