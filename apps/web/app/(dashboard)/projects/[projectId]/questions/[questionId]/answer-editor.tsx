"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../../components/ui/button";
import { Card } from "../../../../../../components/ui/card";
import { Textarea } from "../../../../../../components/ui/textarea";

interface ClaimForEditor {
  claimIndex: number;
  claimText: string;
  isFactual: boolean;
  evidenceStatus: string;
  citations: { id: string }[];
}

export function AnswerEditor({
  projectId,
  questionId,
  baseVersion,
  initialBodyMarkdown,
  claims,
  canEdit,
}: {
  projectId: string;
  questionId: string;
  baseVersion: number;
  initialBodyMarkdown: string;
  claims: ClaimForEditor[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [bodyMarkdown, setBodyMarkdown] = useState(initialBodyMarkdown);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setError(null);
    setSaved(false);
    setLoading(true);
    const response = await fetch(
      `/api/v1/projects/${projectId}/questions/${questionId}/answer-versions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersion,
          bodyMarkdown,
          claims: claims.map((claim) => ({
            claimIndex: claim.claimIndex,
            claimText: claim.claimText,
            isFactual: claim.isFactual,
            citationIds: claim.citations.map((c) => c.id),
            ...(claim.citations.length === 0 && claim.isFactual
              ? { evidenceStatus: "NEEDS_EVIDENCE" as const }
              : {}),
          })),
        }),
      }
    );
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        setError(
          `다른 사용자가 먼저 저장했습니다 (최신 버전: v${body?.error?.details?.latestVersion ?? "?"}). 새로고침 후 다시 시도해주세요.`
        );
      } else {
        setError(body?.error?.message ?? "저장하지 못했습니다.");
      }
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card className="space-y-2 p-4">
      <h2 className="text-sm font-medium text-foreground">답변</h2>
      <Textarea
        value={bodyMarkdown}
        onChange={(e) => {
          setBodyMarkdown(e.target.value);
          setSaved(false);
        }}
        disabled={!canEdit}
        rows={8}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-muted-foreground">저장되었습니다.</p>}
      {canEdit && (
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "저장 중..." : "저장"}
        </Button>
      )}
    </Card>
  );
}
