"use client";

import { useState } from "react";
import { Button } from "../../../../../../../../components/ui/button";
import { Card } from "../../../../../../../../components/ui/card";

const OPTIONS: { value: "ACCURATE" | "INACCURATE" | "INSUFFICIENT"; label: string }[] = [
  { value: "ACCURATE", label: "정확함" },
  { value: "INACCURATE", label: "부정확함" },
  { value: "INSUFFICIENT", label: "불충분함" },
];

export function CitationFeedbackForm({ citationId }: { citationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  async function submit(feedback: "ACCURATE" | "INACCURATE" | "INSUFFICIENT") {
    setError(null);
    setLoading(true);
    const response = await fetch(`/api/v1/citations/${citationId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "피드백을 저장하지 못했습니다.");
      return;
    }
    setSubmitted(feedback);
  }

  return (
    <Card className="space-y-2 p-3">
      <h2 className="text-sm font-medium text-foreground">근거 적합성 피드백</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {submitted ? (
        <p className="text-sm text-muted-foreground">
          피드백이 저장되었습니다 ({OPTIONS.find((o) => o.value === submitted)?.label}).
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((o) => (
            <Button
              key={o.value}
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => submit(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
