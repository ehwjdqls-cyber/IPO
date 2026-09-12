"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

type Step = "account" | "organization" | "security";

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
      <ol className="flex justify-between text-xs font-medium text-muted-foreground">
        {STEPS.map((s) => (
          <li key={s.key} className={s.key === step ? "text-foreground" : ""}>
            {s.label}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent>
          {step === "account" && (
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="displayName">이름</Label>
                <Input
                  id="displayName"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">업무 이메일</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Label htmlFor="agreed" className="items-start font-normal text-muted-foreground">
                <Checkbox
                  id="agreed"
                  checked={agreed}
                  onCheckedChange={(checked) => setAgreed(checked === true)}
                />
                이용약관 및 개인정보처리방침에 동의합니다.
              </Label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "처리 중..." : "다음"}
              </Button>
            </form>
          )}

          {step === "organization" && (
            <form onSubmit={handleOrganizationSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="orgName">조직명</Label>
                <Input
                  id="orgName"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "생성 중..." : "조직 생성"}
              </Button>
            </form>
          )}

          {step === "security" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                MFA(다단계 인증) 설정은 추후 제공됩니다. 이메일로 전송된 인증 링크를 확인하면 가입이 완료됩니다.
              </p>
              <Button type="button" onClick={() => router.push("/projects")} className="w-full">
                시작하기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {step === "account" && (
        <p className="text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <a href="/login" className="font-medium text-foreground">
            로그인
          </a>
        </p>
      )}
    </div>
  );
}
