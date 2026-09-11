"use client";

import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Market = "KOSPI" | "KOSDAQ" | "KONEX" | "UNDECIDED";
type Step = "basic" | "listing" | "scope" | "confirm";

const CATEGORIES = [
  { code: "BUSINESS", label: "사업모델·성장성" },
  { code: "FINANCE", label: "재무·수익성" },
  { code: "CUSTOMER", label: "고객·거래처" },
  { code: "GOVERNANCE", label: "지배구조·내부통제" },
  { code: "LEGAL", label: "법률·규제" },
  { code: "RISK", label: "리스크·기타" },
];

const STEPS: { key: Step; label: string }[] = [
  { key: "basic", label: "1. 기본정보" },
  { key: "listing", label: "2. 상장계획" },
  { key: "scope", label: "3. 분석범위" },
  { key: "confirm", label: "4. 확인" },
];

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

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
  const [questionCount, setQuestionCount] = useState(20);

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
        <ol className="flex gap-4 text-xs font-medium text-zinc-400">
          {STEPS.map((s) => (
            <li key={s.key} className={s.key === step ? "text-zinc-900 dark:text-zinc-50" : ""}>
              {s.label}
            </li>
          ))}
        </ol>

        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {step === "basic" && (
            <div className="space-y-4">
              <Field id="name" label="프로젝트명">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
              <Field id="companyNameKo" label="회사명">
                <input
                  value={companyNameKo}
                  onChange={(e) => setCompanyNameKo(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="companyNameEn" label="영문명 (선택)">
                <input
                  value={companyNameEn}
                  onChange={(e) => setCompanyNameEn(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="industry" label="업종">
                <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass} />
              </Field>
              <Field id="websiteUrl" label="홈페이지 (선택)">
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://"
                  className={inputClass}
                />
              </Field>
              <StepButton onClick={() => setStep("listing")} disabled={!name || !companyNameKo || !industry}>
                다음
              </StepButton>
            </div>
          )}

          {step === "listing" && (
            <div className="space-y-4">
              <Field id="targetMarket" label="목표시장">
                <select
                  value={targetMarket}
                  onChange={(e) => setTargetMarket(e.target.value as Market)}
                  className={inputClass}
                >
                  <option value="UNDECIDED">미정</option>
                  <option value="KOSPI">KOSPI</option>
                  <option value="KOSDAQ">KOSDAQ</option>
                  <option value="KONEX">KONEX</option>
                </select>
              </Field>
              <Field id="targetFilingDate" label="목표 청구일 (선택)">
                <input
                  type="date"
                  value={targetFilingDate}
                  onChange={(e) => setTargetFilingDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="leadUnderwriter" label="주관사 (선택)">
                <input
                  value={leadUnderwriter}
                  onChange={(e) => setLeadUnderwriter(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="flex gap-2">
                <StepButton variant="ghost" onClick={() => setStep("basic")}>
                  이전
                </StepButton>
                <StepButton onClick={() => setStep("scope")}>다음</StepButton>
              </div>
            </div>
          )}

          {step === "scope" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">질문 생성 단계에서 다시 조정할 수 있습니다.</p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <label key={c.code} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={categories.includes(c.code)}
                      onChange={() => toggleCategory(c.code)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <Field id="questionCount" label="기본 질문 수">
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </Field>
              <div className="flex gap-2">
                <StepButton variant="ghost" onClick={() => setStep("listing")}>
                  이전
                </StepButton>
                <StepButton onClick={() => setStep("confirm")}>다음</StepButton>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                업로드하는 문서와 생성되는 답변에는 회사의 민감한 재무·영업 정보가 포함될 수 있습니다. 접근 권한이
                있는 팀원만 이 프로젝트를 조회할 수 있습니다.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <StepButton variant="ghost" onClick={() => setStep("scope")}>
                  이전
                </StepButton>
                <StepButton onClick={handleCreate} disabled={loading}>
                  {loading ? "생성 중..." : "프로젝트 생성"}
                </StepButton>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="h-fit space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">입력 요약</h2>
        <dl className="space-y-1 text-zinc-500">
          <SummaryRow label="프로젝트명" value={name} />
          <SummaryRow label="회사명" value={companyNameKo} />
          <SummaryRow label="업종" value={industry} />
          <SummaryRow label="목표시장" value={targetMarket} />
          <SummaryRow label="목표 청구일" value={targetFilingDate} />
          <SummaryRow label="질문 수" value={String(questionCount)} />
        </dl>
      </aside>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactElement<{ id?: string }> }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {isValidElement(children) ? cloneElement(children, { id }) : children}
    </div>
  );
}

function StepButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        variant === "primary"
          ? "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          : "rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
      }
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="text-right text-zinc-700 dark:text-zinc-300">{value || "-"}</span>
    </div>
  );
}
