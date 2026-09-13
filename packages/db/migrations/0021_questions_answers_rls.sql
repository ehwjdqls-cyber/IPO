-- questions -----------------------------------------------------------
-- Direct organization_id/project_id columns, same pattern as projects/
-- documents (0006/0011): RLS reads them straight off the row.

alter table questions enable row level security;
grant select, insert, update on questions to app_user;

create policy questions_select on questions
  for select
  using (is_active_member(organization_id, app_current_user_id()));

create policy questions_insert on questions
  for insert
  with check (
    has_min_role(organization_id, app_current_user_id(), 'EDITOR')
    and created_by = app_current_user_id()
  );

create policy questions_update on questions
  for update
  using (has_min_role(organization_id, app_current_user_id(), 'EDITOR'))
  with check (has_min_role(organization_id, app_current_user_id(), 'EDITOR'));

-- No DELETE policy for app_user: no spec requirement to hard-delete
-- questions yet: out of Milestone 3 scope.

-- answer_versions ---------------------------------------------------------
-- No organization_id/project_id column (per spec DDL) -- RLS joins through
-- questions, same "join through the parent" pattern as document_pages
-- (0011). Answer bodies are edited by inserting a new version row, never
-- by UPDATE -- spec's "REVIEWER는 answer body 수정 불가" maps directly to
-- the EDITOR+ threshold on INSERT (REVIEWER's rank is below EDITOR's).

alter table answer_versions enable row level security;
grant select, insert on answer_versions to app_user;

create policy answer_versions_select on answer_versions
  for select
  using (
    exists (
      select 1 from questions q
      where q.id = answer_versions.question_id
        and is_active_member(q.organization_id, app_current_user_id())
    )
  );

create policy answer_versions_insert on answer_versions
  for insert
  with check (
    created_by = app_current_user_id()
    and exists (
      select 1 from questions q
      where q.id = answer_versions.question_id
        and has_min_role(q.organization_id, app_current_user_id(), 'EDITOR')
    )
  );

-- No UPDATE/DELETE policy for app_user: answer_versions rows are
-- immutable once written (edits create a new version).

-- claims / citations --------------------------------------------------------
-- AI-generated during answer generation, written only by the service-role
-- client (same reasoning as document_pages/document_chunks in 0011) --
-- app_user only ever reads them, joined through the parent chain up to
-- questions for the organization check.

alter table claims enable row level security;
grant select on claims to app_user;

create policy claims_select on claims
  for select
  using (
    exists (
      select 1 from answer_versions av
      join questions q on q.id = av.question_id
      where av.id = claims.answer_version_id
        and is_active_member(q.organization_id, app_current_user_id())
    )
  );

alter table citations enable row level security;
grant select on citations to app_user;

create policy citations_select on citations
  for select
  using (
    exists (
      select 1 from claims c
      join answer_versions av on av.id = c.answer_version_id
      join questions q on q.id = av.question_id
      where c.id = citations.claim_id
        and is_active_member(q.organization_id, app_current_user_id())
    )
  );

-- reviews ---------------------------------------------------------------
-- spec 17절 RLS 요구사항: "REVIEWER는 ... reviews INSERT만 가능" -- a floor,
-- not an exact-role match, so EDITOR/ADMIN/OWNER can review too.

alter table reviews enable row level security;
grant select, insert on reviews to app_user;

create policy reviews_select on reviews
  for select
  using (
    exists (
      select 1 from answer_versions av
      join questions q on q.id = av.question_id
      where av.id = reviews.answer_version_id
        and is_active_member(q.organization_id, app_current_user_id())
    )
  );

create policy reviews_insert on reviews
  for insert
  with check (
    reviewer_id = app_current_user_id()
    and exists (
      select 1 from answer_versions av
      join questions q on q.id = av.question_id
      where av.id = reviews.answer_version_id
        and has_min_role(q.organization_id, app_current_user_id(), 'REVIEWER')
    )
  );

-- No UPDATE/DELETE policy for app_user: review decisions are an immutable
-- audit trail once recorded.
