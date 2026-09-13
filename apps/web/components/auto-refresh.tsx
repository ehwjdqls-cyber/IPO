"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3000;

/**
 * Documents processed by the (out-of-band) worker never trigger a Next.js
 * revalidation on their own, so a Server Component page rendered while
 * something was still processing stays stale until the user manually
 * reloads. Polls router.refresh() -- same pattern as S09's
 * job-progress-view.tsx -- only while `active` is true (e.g. at least one
 * document is non-terminal).
 */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, router]);

  return null;
}
