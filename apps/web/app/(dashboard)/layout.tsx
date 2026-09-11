import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/projects" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          IPO Proof
        </Link>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
