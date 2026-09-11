import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/auth";
import { listMemberships } from "../../../../lib/queries/organizations";
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

  return <NewProjectForm organizationId={organization.id} />;
}
