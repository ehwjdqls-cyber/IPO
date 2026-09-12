-- documents ------------------------------------------------------------

alter table documents enable row level security;
grant select, insert, update on documents to app_user;

create policy documents_select on documents
  for select
  using (is_active_member(organization_id, app_current_user_id()));

create policy documents_insert on documents
  for insert
  with check (
    has_min_role(organization_id, app_current_user_id(), 'EDITOR')
    and uploaded_by = app_current_user_id()
  );

create policy documents_update on documents
  for update
  using (has_min_role(organization_id, app_current_user_id(), 'EDITOR'))
  with check (has_min_role(organization_id, app_current_user_id(), 'EDITOR'));

-- No DELETE policy for app_user: documents.status already carries DELETING
-- and DELETED values, and documents.deleted_at records when -- deletion
-- here is an UPDATE (status/deleted_at), not a real DELETE, unlike
-- projects_delete in 0006 (which does grant app_user a real ADMIN+ DELETE,
-- even though the app layer currently soft-deletes there too). Real
-- storage/DB purge orchestration is Milestone 4 scope.

-- document_pages ---------------------------------------------------------
-- No organization_id/project_id columns here (see spec DDL) -- RLS joins
-- through documents, whose own SELECT policy already gates the join. This
-- is not the organization_members self-reference hazard (0006): document_
-- pages and documents are different tables, so no circular policy
-- evaluation, and no SECURITY DEFINER helper is needed.

alter table document_pages enable row level security;
grant select on document_pages to app_user;

create policy document_pages_select on document_pages
  for select
  using (
    exists (
      select 1 from documents d
      where d.id = document_pages.document_id
        and is_active_member(d.organization_id, app_current_user_id())
    )
  );

-- No INSERT/UPDATE/DELETE policy for app_user: pages are only ever written
-- by the extraction worker, which uses the service-role client and bypasses
-- RLS by design (see packages/db/README.md).

-- document_chunks ---------------------------------------------------------
-- Unlike document_pages, this table denormalizes organization_id and
-- project_id directly (see spec DDL) specifically so retrieval queries can
-- be scoped without a join -- RLS follows the same direct-column pattern
-- as projects (0006), not the document_pages join pattern above.

alter table document_chunks enable row level security;
grant select on document_chunks to app_user;

create policy document_chunks_select on document_chunks
  for select
  using (is_active_member(organization_id, app_current_user_id()));

-- No INSERT/UPDATE/DELETE policy for app_user: chunks are only ever written
-- by the extraction/embedding worker via the service-role client.
