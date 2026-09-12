alter table jobs enable row level security;
grant select, insert, update on jobs to app_user;

create policy jobs_select on jobs
  for select
  using (is_active_member(organization_id, app_current_user_id()));

create policy jobs_insert on jobs
  for insert
  with check (
    has_min_role(organization_id, app_current_user_id(), 'EDITOR')
    and created_by = app_current_user_id()
  );

-- Covers the cancel action (POST /jobs/{jobId}/cancel, EDITOR+ per spec
-- section 19). The worker's own QUEUED->RUNNING->SUCCEEDED/FAILED
-- transitions go through the service-role client and bypass RLS, so this
-- policy only ever gates the interactive cancel path.
create policy jobs_update on jobs
  for update
  using (has_min_role(organization_id, app_current_user_id(), 'EDITOR'))
  with check (has_min_role(organization_id, app_current_user_id(), 'EDITOR'));
