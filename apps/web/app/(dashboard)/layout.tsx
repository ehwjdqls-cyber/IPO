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
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <header className="border-b border-border bg-background px-6 py-4">
        <Link href="/projects" className="text-sm font-semibold text-foreground">
          IPO Proof
        </Link>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
