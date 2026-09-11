import "server-only";
import { withRequestScope } from "../db";
import { PROJECT_COLUMNS, toProjectDto, type ProjectDto, type ProjectRow } from "../projects";

/** Same read path as GET /api/v1/projects -- kept here so Server Component
 * pages can call it directly instead of self-fetching the API route. */
export async function listProjects(userId: string, organizationId: string): Promise<ProjectDto[]> {
  const result = await withRequestScope({ userId, organizationId }, (client) =>
    client.query<ProjectRow>(
      `select ${PROJECT_COLUMNS} from projects where organization_id = $1 order by created_at desc`,
      [organizationId]
    )
  );
  return result.rows.map(toProjectDto);
}

/** Same read path as GET /api/v1/projects/{projectId} -- see that route for
 * why this is safe to scope by userId alone (no organizationId GUC). */
export async function findProjectById(userId: string, projectId: string): Promise<ProjectDto | null> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<ProjectRow>(`select ${PROJECT_COLUMNS} from projects where id = $1`, [projectId])
  );
  return result.rows[0] ? toProjectDto(result.rows[0]) : null;
}
