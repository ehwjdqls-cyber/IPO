import "server-only";
import { withRequestScope } from "../db";
import { JOB_COLUMNS, toJobDto, type JobDto, type JobRow } from "../jobs";

interface JobWithOrgRow extends JobRow {
  organization_id: string;
}

/** Same read path as GET /api/v1/projects/{projectId}/jobs/{jobId} -- kept
 * here so the S09 Server Component page can call it directly. */
export async function findJobById(
  userId: string,
  jobId: string
): Promise<(JobDto & { organizationId: string }) | null> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<JobWithOrgRow>(
      `select id, organization_id, type, status, progress, error_code, error_message,
              started_at, finished_at, created_at
       from jobs where id = $1`,
      [jobId]
    )
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...toJobDto(row), organizationId: row.organization_id };
}

/** Same read path as GET .../documents/{documentId}/jobs (S07 처리 로그) --
 * kept here so the S07 Server Component page can call it directly. */
export async function listDocumentJobs(userId: string, documentId: string): Promise<JobDto[]> {
  const result = await withRequestScope({ userId }, (client) =>
    client.query<JobRow>(
      `select ${JOB_COLUMNS} from jobs
       where type = 'DOCUMENT_PROCESS' and input->>'documentId' = $1
       order by created_at desc`,
      [documentId]
    )
  );
  return result.rows.map(toJobDto);
}
