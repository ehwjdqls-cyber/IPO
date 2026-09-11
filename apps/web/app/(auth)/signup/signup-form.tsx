"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";

type Step = "account" | "organization" | "security";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

const STEPS: { key: Step; label: string }[] = [
  { key: "account", label: "1. 계정" },
  { key: "organization", label: "2. 조직" },
  { key: "security", label: "3. 보안" },
];

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [orgName, setOrgName] = useState("");

  async function handleAccountSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!agreed) {
      setError("이용약관 및 개인정보처리방침에 동의해야 가입할 수 있습니다.");
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setStep("organization");
  }

  async function handleOrganizationSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const response = await fetch("/api/v1/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName, displayName }),
    });
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "조직 생성에 실패했습니다.");
      return;
    }
    setStep("security");
  }

  return (
    <div className="space-y-6">
      <ol className="flex justify-between text-xs font-medium text-zinc-400">
        {STEPS.map((s) => (
          <li key={s.key} className={s.key === step ? "text-zinc-900 dark:text-zinc-50" : ""}>
            {s.label}
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {step === "account" && (
          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                이름
              </label>
              <input
                id="displayName"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                업무 이메일
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <label htmlFor="agreed" className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                id="agreed"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              이용약관 및 개인정보처리방침에 동의합니다.
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {loading ? "처리 중..." : "다음"}
            </button>
          </form>
        )}

        {step === "organization" && (
          <form onSubmit={handleOrganizationSubmit} className="space-y-4">
            <div>
              <label htmlFor="orgName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                조직명
              </label>
              <input
                id="orgName"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className={inputClass}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {loading ? "생성 중..." : "조직 생성"}
            </button>
          </form>
        )}

        {step === "security" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              MFA(다단계 인증) 설정은 추후 제공됩니다. 이메일로 전송된 인증 링크를 확인하면 가입이 완료됩니다.
            </p>
            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              시작하기
            </button>
          </div>
        )}
      </div>

      {step === "account" && (
        <p className="text-center text-sm text-zinc-500">
          이미 계정이 있으신가요?{" "}
          <a href="/login" className="font-medium text-zinc-900 dark:text-zinc-50">
            로그인
          </a>
        </p>
      )}
    </div>
  );
}
