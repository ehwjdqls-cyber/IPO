"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../../components/ui/button";

export function GenerateAnswerButton({
  projectId,
  questionId,
}: {
  projectId: string;
  questionId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    const response = await fetch(
      `/api/v1/projects/${projectId}/questions/${questionId}/answer-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({}),
      }
    );
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "답변 생성 작업을 시작하지 못했습니다.");
      return;
    }
    const body = await response.json();
    router.push(`/projects/${projectId}/jobs/${body.data.id}`);
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleGenerate} disabled={loading}>
        {loading ? "생성 시작 중..." : "답변 생성"}
      </Button>
    </div>
  );
}
