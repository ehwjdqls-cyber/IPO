import { can } from "@ipo/contracts";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/auth";
import { listMemberships } from "../../../../lib/queries/organizations";
import { AccessDenied } from "../../../../components/access-denied";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const memberships = await listMemberships(user.id);
  const organization = memberships[0];
  if (!organization) {
    redirect("/projects");
  }

  if (!can(organization.role, "project.create")) {
    return <AccessDenied message="프로젝트를 생성할 권한이 없습니다. EDITOR 이상의 역할이 필요합니다." />;
  }

  return <NewProjectForm organizationId={organization.id} />;
}
