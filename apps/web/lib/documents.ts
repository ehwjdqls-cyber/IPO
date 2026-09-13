import "server-only";

export interface DocumentRow {
  id: string;
  organization_id: string;
  project_id: string;
  original_filename: string;
  storage_key: string;
  media_type: string;
  byte_size: string;
  sha256: string;
  version: number;
  page_count: number | null;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DocumentDto {
  id: string;
  organizationId: string;
  projectId: string;
  originalFilename: string;
  storageKey: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  version: number;
  pageCount: number | null;
  status: string;
  failureCode: string | null;
  failureMessage: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export function toDocumentDto(row: DocumentRow): DocumentDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    originalFilename: row.original_filename,
    storageKey: row.storage_key,
    mediaType: row.media_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    version: row.version,
    pageCount: row.page_count,
    status: row.status,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const DOCUMENT_COLUMNS =
  "id, organization_id, project_id, original_filename, storage_key, media_type, byte_size, sha256, version, page_count, status, failure_code, failure_message, uploaded_by, created_at, updated_at, deleted_at";
