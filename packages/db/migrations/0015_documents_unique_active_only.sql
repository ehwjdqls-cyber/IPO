-- Found via a real upload: the plain unique(project_id, sha256, version)
-- constraint from 0008 ignores deleted_at, so once a document is soft-
-- deleted its (project_id, sha256, version) slot stays permanently
-- occupied -- re-uploading the exact same file to the same project fails
-- with a 500 (duplicate key) forever, even though the row is no longer
-- "active" by any user-facing definition. Replaced with a partial unique
-- index scoped to deleted_at is null, matching the duplicate-check query
-- in POST /projects/{projectId}/uploads (which already filters the same
-- way) -- soft-deleted rows no longer block reuse of their sha256/version.

alter table documents drop constraint documents_project_id_sha256_version_key;

create unique index documents_project_id_sha256_version_active_key
  on documents (project_id, sha256, version)
  where deleted_at is null;
