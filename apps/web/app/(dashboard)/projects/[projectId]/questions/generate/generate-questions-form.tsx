"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../../components/ui/button";
import { Card, CardContent } from "../../../../../../components/ui/card";
import { Checkbox } from "../../../../../../components/ui/checkbox";
import { Label } from "../../../../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../../components/ui/select";

const CATEGORIES = [
  { code: "BUSINESS", label: "사업모델·성장성" },
  { code: "FINANCE", label: "재무·수익성" },
  { code: "CUSTOMER", label: "고객·거래처" },
  { code: "GOVERNANCE", label: "지배구조" },
  { code: "INTERNAL_CONTROL", label: "내부통제" },
  { code: "RISK", label: "주요 위험" },
];

const DEPTH_LABEL: Record<string, string> = {
  QUICK: "빠른 검토",
  STANDARD: "표준",
  DEEP: "심층",
};

interface ReadyDocument {
  id: string;
  originalFilename: string;
}

export function GenerateQuestionsForm({
  projectId,
  readyDocuments,
}: {
  projectId: string;
  readyDocuments: ReadyDocument[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>(CATEGORIES.map((c) => c.code));
  const [questionCount, setQuestionCount] = useState("20");
  const [depth, setDepth] = useState("STANDARD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const documentCount = scope === "all" ? readyDocuments.length : selectedDocumentIds.length;
  const estimatedMinutes = useMemo(
    () => Math.max(1, Math.ceil((Number(questionCount) * (depth === "DEEP" ? 1.5 : 1)) / 10)),
    [questionCount, depth]
  );

  function toggleCategory(code: string) {
    setCategories((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function toggleDocument(id: string) {
    setSelectedDocumentIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function handleGenerate() {
    setError(null);
    if (categories.length === 0) {
      setError("카테고리를 최소 1개 선택해주세요.");
      return;
    }
    if (scope === "selected" && selectedDocumentIds.length === 0) {
      setError("문서를 최소 1개 선택해주세요.");
      return;
    }
    setLoading(true);
    const response = await fetch(`/api/v1/projects/${projectId}/question-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        documentIds: scope === "selected" ? selectedDocumentIds : undefined,
        categories,
        questionCount: Number(questionCount),
        depth,
      }),
    });
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "질문 생성 작업을 시작하지 못했습니다.");
      return;
    }
    const body = await response.json();
    router.push(`/projects/${projectId}/jobs/${body.data.id}`);
  }

  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>자료 범위</Label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                  />
                  READY 문서 전체 ({readyDocuments.length}건)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scope === "selected"}
                    onChange={() => setScope("selected")}
                  />
                  선택 문서
                </label>
              </div>
              {scope === "selected" && (
                <div className="space-y-1 rounded-md border border-border p-2">
                  {readyDocuments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">준비된(READY) 문서가 없습니다.</p>
                  ) : (
                    readyDocuments.map((doc) => (
                      <label key={doc.id} className="flex items-center gap-2 text-sm font-normal">
                        <Checkbox
                          checked={selectedDocumentIds.includes(doc.id)}
                          onCheckedChange={() => toggleDocument(doc.id)}
                        />
                        {doc.originalFilename}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>카테고리</Label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <label key={c.code} className="flex items-center gap-2 text-sm font-normal">
                    <Checkbox
                      checked={categories.includes(c.code)}
                      onCheckedChange={() => toggleCategory(c.code)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="questionCount">질문 수</Label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger id="questionCount" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="depth">심층도</Label>
              <Select value={depth} onValueChange={setDepth}>
                <SelectTrigger id="depth" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QUICK">빠른 검토</SelectItem>
                  <SelectItem value="STANDARD">표준</SelectItem>
                  <SelectItem value="DEEP">심층</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? "생성 시작 중..." : "생성"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardContent className="space-y-2 text-sm">
          <h2 className="font-medium text-foreground">미리보기</h2>
          <dl className="space-y-1 text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>대상 문서</dt>
              <dd className="text-foreground">{documentCount}건</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>예상 질문 수</dt>
              <dd className="text-foreground">약 {questionCount}개</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>심층도</dt>
              <dd className="text-foreground">{DEPTH_LABEL[depth]}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>예상 소요 시간</dt>
              <dd className="text-foreground">약 {estimatedMinutes}분</dd>
            </div>
          </dl>
          <p className="pt-2 text-xs text-muted-foreground">
            실제 비용·시간은 문서 분량과 AI 제공자 응답 속도에 따라 달라질 수 있습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
