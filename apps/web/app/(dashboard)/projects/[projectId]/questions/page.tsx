import Link from "next/link";
import { notFound } from "next/navigation";
import { can, listQuestionsQuerySchema } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../lib/auth";
import { findProjectById } from "../../../../../lib/queries/projects";
import { getMembership } from "../../../../../lib/membership";
import { listQuestionsWithKpi } from "../../../../../lib/queries/questions";
import { listActiveOrgMembers } from "../../../../../lib/queries/organizations";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { QuestionsFilterToolbar } from "./questions-filter-toolbar";
import { QuestionsTable } from "./questions-table";

export default async function QuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const membership = await getMembership(user.id, project.organizationId);
  if (!membership) {
    notFound();
  }

  const rawSearchParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawSearchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ])
  );
  const parsedFilters = listQuestionsQuerySchema.safeParse(flatParams);
  const filters = parsedFilters.success ? parsedFilters.data : {};

  const canManage = can(membership.role, "job.manage");

  const { kpi, questions } = await listQuestionsWithKpi(
    user.id,
    project.organizationId,
    projectId,
    filters
  );
  const orgMembers = canManage
    ? await listActiveOrgMembers(user.id, project.organizationId)
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Q&amp;A 목록</h1>
          <p className="text-sm text-muted-foreground">{project.companyNameKo}</p>
        </div>
        <Button asChild>
          <Link href={`/projects/${projectId}/questions/generate`}>질문 생성</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "전체", value: kpi.total },
          { label: "미작성", value: kpi.unanswered },
          { label: "근거 부족", value: kpi.needsEvidence },
          { label: "충돌", value: kpi.conflict, emphasize: true },
          { label: "검토 대기", value: kpi.needsReview },
          { label: "승인", value: kpi.approved },
        ].map((item) => (
          <Card key={item.label} className="p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p
              className={`text-xl font-semibold ${
                item.emphasize && item.value > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {item.value}
            </p>
          </Card>
        ))}
      </div>

      <QuestionsFilterToolbar projectId={projectId} initialFilters={flatParams} />

      {questions.length === 0 ? (
        <Card className="border-dashed">
          <p className="p-12 text-center text-sm text-muted-foreground">
            조건에 맞는 질문이 없습니다. 아직 질문을 생성하지 않았다면 위의 &quot;질문 생성&quot;
            버튼을 이용해주세요.
          </p>
        </Card>
      ) : (
        <QuestionsTable
          projectId={projectId}
          questions={questions}
          canManage={canManage}
          orgMembers={orgMembers}
        />
      )}
    </div>
  );
}
