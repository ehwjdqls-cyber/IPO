"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";

type Market = "KOSPI" | "KOSDAQ" | "KONEX" | "UNDECIDED";
type Step = "basic" | "listing" | "scope" | "confirm";

// spec 5절 질문 카테고리 6개와 정확히 일치해야 한다 (DB question_category
// enum과 동일한 코드) -- 이전에는 GOVERNANCE/LEGAL로 잘못 나뉘어 있었음.
const CATEGORIES = [
  { code: "BUSINESS", label: "사업모델·성장성" },
  { code: "FINANCE", label: "재무·수익성" },
  { code: "CUSTOMER", label: "고객·거래처" },
  { code: "GOVERNANCE", label: "지배구조" },
  { code: "INTERNAL_CONTROL", label: "내부통제" },
  { code: "RISK", label: "주요 위험" },
];

const STEPS: { key: Step; label: string }[] = [
  { key: "basic", label: "1. 기본정보" },
  { key: "listing", label: "2. 상장계획" },
  { key: "scope", label: "3. 분석범위" },
  { key: "confirm", label: "4. 확인" },
];

export function NewProjectForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("basic");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [companyNameKo, setCompanyNameKo] = useState("");
  const [companyNameEn, setCompanyNameEn] = useState("");
  const [industry, setIndustry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const [targetMarket, setTargetMarket] = useState<Market>("UNDECIDED");
  const [targetFilingDate, setTargetFilingDate] = useState("");
  const [leadUnderwriter, setLeadUnderwriter] = useState("");

  const [categories, setCategories] = useState<string[]>(CATEGORIES.map((c) => c.code));
  const [questionCount, setQuestionCount] = useState("20");

  function toggleCategory(code: string) {
    setCategories((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function handleCreate() {
    setError(null);
    setLoading(true);
    const response = await fetch(`/api/v1/projects?organizationId=${organizationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        companyNameKo,
        companyNameEn: companyNameEn || undefined,
        industry,
        websiteUrl: websiteUrl || undefined,
        targetMarket,
        targetFilingDate: targetFilingDate || undefined,
        leadUnderwriter: leadUnderwriter || undefined,
      }),
    });
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "프로젝트 생성에 실패했습니다.");
      return;
    }
    const body = await response.json();
    router.push(`/projects/${body.data.id}`);
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <ol className="flex gap-4 text-xs font-medium text-muted-foreground">
          {STEPS.map((s) => (
            <li key={s.key} className={s.key === step ? "text-foreground" : ""}>
              {s.label}
            </li>
          ))}
        </ol>

        <Card>
          <CardContent className="space-y-4">
            {step === "basic" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">프로젝트명</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyNameKo">회사명</Label>
                  <Input
                    id="companyNameKo"
                    value={companyNameKo}
                    onChange={(e) => setCompanyNameKo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyNameEn">영문명 (선택)</Label>
                  <Input
                    id="companyNameEn"
                    value={companyNameEn}
                    onChange={(e) => setCompanyNameEn(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="industry">업종</Label>
                  <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="websiteUrl">홈페이지 (선택)</Label>
                  <Input
                    id="websiteUrl"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://"
                  />
                </div>
                <Button
                  onClick={() => setStep("listing")}
                  disabled={!name || !companyNameKo || !industry}
                >
                  다음
                </Button>
              </div>
            )}

            {step === "listing" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="targetMarket">목표시장</Label>
                  <Select value={targetMarket} onValueChange={(v) => setTargetMarket(v as Market)}>
                    <SelectTrigger id="targetMarket" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNDECIDED">미정</SelectItem>
                      <SelectItem value="KOSPI">KOSPI</SelectItem>
                      <SelectItem value="KOSDAQ">KOSDAQ</SelectItem>
                      <SelectItem value="KONEX">KONEX</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="targetFilingDate">목표 청구일 (선택)</Label>
                  <Input
                    id="targetFilingDate"
                    type="date"
                    value={targetFilingDate}
                    onChange={(e) => setTargetFilingDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="leadUnderwriter">주관사 (선택)</Label>
                  <Input
                    id="leadUnderwriter"
                    value={leadUnderwriter}
                    onChange={(e) => setLeadUnderwriter(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("basic")}>
                    이전
                  </Button>
                  <Button onClick={() => setStep("scope")}>다음</Button>
                </div>
              </div>
            )}

            {step === "scope" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">질문 생성 단계에서 다시 조정할 수 있습니다.</p>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((c) => (
                    <Label key={c.code} htmlFor={`category-${c.code}`} className="font-normal">
                      <Checkbox
                        id={`category-${c.code}`}
                        checked={categories.includes(c.code)}
                        onCheckedChange={() => toggleCategory(c.code)}
                      />
                      {c.label}
                    </Label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="questionCount">기본 질문 수</Label>
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
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("listing")}>
                    이전
                  </Button>
                  <Button onClick={() => setStep("confirm")}>다음</Button>
                </div>
              </div>
            )}

            {step === "confirm" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  업로드하는 문서와 생성되는 답변에는 회사의 민감한 재무·영업 정보가 포함될 수 있습니다. 접근 권한이
                  있는 팀원만 이 프로젝트를 조회할 수 있습니다.
                </p>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("scope")}>
                    이전
                  </Button>
                  <Button onClick={handleCreate} disabled={loading}>
                    {loading ? "생성 중..." : "프로젝트 생성"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardContent className="space-y-3 text-sm">
          <h2 className="font-medium text-foreground">입력 요약</h2>
          <dl className="space-y-1 text-muted-foreground">
            <SummaryRow label="프로젝트명" value={name} />
            <SummaryRow label="회사명" value={companyNameKo} />
            <SummaryRow label="업종" value={industry} />
            <SummaryRow label="목표시장" value={targetMarket} />
            <SummaryRow label="목표 청구일" value={targetFilingDate} />
            <SummaryRow label="질문 수" value={questionCount} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="text-right text-foreground">{value || "-"}</dd>
    </div>
  );
}
