import { notFound } from "next/navigation";
import { can } from "@ipo/contracts";
import { getAuthenticatedUser } from "../../../../../../lib/auth";
import { findProjectById } from "../../../../../../lib/queries/projects";
import { getMembership } from "../../../../../../lib/membership";
import { listDocuments } from "../../../../../../lib/queries/documents";
import { AccessDenied } from "../../../../../../components/access-denied";
import { GenerateQuestionsForm } from "./generate-questions-form";

export default async function GenerateQuestionsPage({
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

  const membership = await getMembership(user.id, project.organizationId);
  if (!membership) {
    notFound();
  }

  if (!can(membership.role, "job.manage")) {
    return <AccessDenied message="질문을 생성할 권한이 없습니다. EDITOR 이상의 역할이 필요합니다." />;
  }

  const documents = await listDocuments(user.id, project.organizationId, projectId);
  const readyDocuments = documents
    .filter((d) => d.status === "READY")
    .map((d) => ({ id: d.id, originalFilename: d.originalFilename }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">질문 생성 설정</h1>
        <p className="text-sm text-muted-foreground">{project.companyNameKo}</p>
      </div>
      <GenerateQuestionsForm projectId={projectId} readyDocuments={readyDocuments} />
    </div>
  );
}
