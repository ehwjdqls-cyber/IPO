import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/auth";
import { findProjectById } from "../../../../lib/queries/projects";

const MARKET_LABEL: Record<string, string> = {
  KOSPI: "KOSPI",
  KOSDAQ: "KOSDAQ",
  KONEX: "KONEX",
  UNDECIDED: "미정",
};

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const { projectId } = await params;
  const project = await findProjectById(user.id, projectId);
  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{project.companyNameKo}</h1>
        <p className="text-sm text-zinc-500">
          {MARKET_LABEL[project.targetMarket]} · 목표 청구일 {project.targetFilingDate ?? "미정"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="문서 준비도" value="0/0" />
        <Kpi label="Q&A 완료율" value="0/0" />
        <Kpi label="근거 확인률" value="0/0" />
        <Kpi label="충돌 건수" value="0" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">다음 행동</h2>
          <p className="mt-2 text-sm text-zinc-500">문서를 업로드하면 다음 행동이 표시됩니다.</p>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">최근 활동</h2>
          <p className="mt-2 text-sm text-zinc-500">아직 활동이 없습니다.</p>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
