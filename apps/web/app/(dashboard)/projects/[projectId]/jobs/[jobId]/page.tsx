import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { findProjectById } from "../../../../../../lib/queries/projects";
import { getMembership } from "../../../../../../lib/membership";
import { findJobById } from "../../../../../../lib/queries/jobs";
import { Card } from "../../../../../../components/ui/card";
import { JobProgressView } from "./job-progress-view";

const JOB_TYPE_LABEL: Record<string, string> = {
  DOCUMENT_PROCESS: "문서 처리",
  QUESTION_GENERATE: "질문 생성",
  ANSWER_GENERATE: "답변 생성",
  EXPORT: "내보내기",
};

export default async function JobProgressPage({
  params,
}: {
  params: Promise<{ projectId: string; jobId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const { projectId, jobId } = await params;
  const project = await findProjectById(user.id, projectId);
  if (!project) {
    notFound();
  }

  const job = await findJobById(user.id, jobId);
  if (!job) {
    notFound();
  }

  const membership = await getMembership(user.id, job.organizationId);
  if (!membership) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground underline">
          프로젝트로 돌아가기
        </Link>
        <h1 className="text-lg font-semibold text-foreground">
          {JOB_TYPE_LABEL[job.type] ?? job.type} 진행 상황
        </h1>
      </div>

      <Card className="p-4">
        <JobProgressView
          projectId={projectId}
          initialJob={job}
          canManage={can(membership.role, "job.manage")}
        />
      </Card>
    </div>
  );
}
