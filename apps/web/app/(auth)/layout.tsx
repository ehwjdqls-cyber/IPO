import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">IPO Proof</h1>
          <p className="mt-1 text-sm text-zinc-500">모든 답변에 근거를.</p>
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-zinc-400">
          고객 자료는 AI 학습에 사용되지 않으며, 모든 접근은 기록·암호화됩니다.
        </p>
      </div>
    </div>
  );
}
