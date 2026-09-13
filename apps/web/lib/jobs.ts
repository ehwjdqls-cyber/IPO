import "server-only";

export interface JobRow {
  id: string;
  type: string;
  status: string;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface JobDto {
  id: string;
  type: string;
  status: string;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export function toJobDto(row: JobRow): JobDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

export const JOB_COLUMNS =
  "id, type, status, progress, error_code, error_message, started_at, finished_at, created_at";
