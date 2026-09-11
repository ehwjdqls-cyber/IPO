-- Runtime role used by the API layer for every tenant-scoped request. It is
-- never the table owner, so Postgres enforces RLS against it without needing
-- FORCE ROW LEVEL SECURITY. The service-role client (worker/admin jobs) keeps
-- using the migration owner role and bypasses RLS by design (see packages/db
-- README once written).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end
$$;

grant usage on schema public to app_user;

-- Request-scoped identity is passed in via `set local` GUCs by the API layer
-- (see apps/web/lib/db). This keeps the RLS design portable across Auth
-- providers: whatever provider verifies the session, the API sets these two
-- values from the verified session before running any query.
create function app_current_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.current_user_id', true), '')::uuid $$;

create function app_current_org_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.current_org_id', true), '')::uuid $$;

create function member_role_rank(r member_role) returns int
  language sql immutable
  as $$
    select case r
      when 'VIEWER' then 1
      when 'REVIEWER' then 2
      when 'EDITOR' then 3
      when 'ADMIN' then 4
      when 'OWNER' then 5
    end
  $$;

-- SECURITY DEFINER is required here: organization_members' own RLS policies
-- call these two functions, so if they ran as the caller (app_user) their
-- internal SELECT on organization_members would in turn be subject to that
-- same policy -- a self-referential check that can never resolve true.
-- Running as the (RLS-bypassing) migration owner breaks that cycle. Both
-- functions only ever return a boolean, never row data, so this cannot leak
-- other tenants' rows.
create function is_active_member(p_org_id uuid, p_user_id uuid) returns boolean
  language sql stable
  security definer
  set search_path = public
  as $$
    select exists (
      select 1 from organization_members m
      where m.organization_id = p_org_id
        and m.user_id = p_user_id
        and m.status = 'ACTIVE'
    )
  $$;

create function has_min_role(p_org_id uuid, p_user_id uuid, p_min member_role) returns boolean
  language sql stable
  security definer
  set search_path = public
  as $$
    select exists (
      select 1 from organization_members m
      where m.organization_id = p_org_id
        and m.user_id = p_user_id
        and m.status = 'ACTIVE'
        and member_role_rank(m.role) >= member_role_rank(p_min)
    )
  $$;

-- organizations ---------------------------------------------------------

alter table organizations enable row level security;
grant select, update on organizations to app_user;

create policy organizations_select on organizations
  for select
  using (is_active_member(id, app_current_user_id()));

create policy organizations_update on organizations
  for update
  using (has_min_role(id, app_current_user_id(), 'OWNER'))
  with check (has_min_role(id, app_current_user_id(), 'OWNER'));

-- No INSERT/DELETE policy: organizations are only ever created through
-- create_organization_with_owner() below, and deletion is out of Milestone 1
-- scope, so both remain denied for app_user by default.

-- profiles ----------------------------------------------------------------

-- Same self-reference hazard as is_active_member/has_min_role: this reads
-- organization_members from inside a policy on a different table, but stays
-- SECURITY DEFINER for consistency and to avoid ever tripping the same bug
-- if organization_members' policies change later.
create function shares_active_org(p_user_a uuid, p_user_b uuid) returns boolean
  language sql stable
  security definer
  set search_path = public
  as $$
    select exists (
      select 1
      from organization_members a
      join organization_members b on b.organization_id = a.organization_id
      where a.user_id = p_user_a
        and a.status = 'ACTIVE'
        and b.user_id = p_user_b
        and b.status = 'ACTIVE'
    )
  $$;

alter table profiles enable row level security;
grant select, insert, update on profiles to app_user;

create policy profiles_select on profiles
  for select
  using (
    id = app_current_user_id()
    or shares_active_org(app_current_user_id(), id)
  );

create policy profiles_insert on profiles
  for insert
  with check (id = app_current_user_id());

create policy profiles_update on profiles
  for update
  using (id = app_current_user_id())
  with check (id = app_current_user_id());

-- organization_members -----------------------------------------------------

alter table organization_members enable row level security;
grant select, insert, update, delete on organization_members to app_user;

create policy organization_members_select on organization_members
  for select
  using (is_active_member(organization_id, app_current_user_id()));

create policy organization_members_insert on organization_members
  for insert
  with check (has_min_role(organization_id, app_current_user_id(), 'ADMIN'));

create policy organization_members_update on organization_members
  for update
  using (has_min_role(organization_id, app_current_user_id(), 'ADMIN'))
  with check (has_min_role(organization_id, app_current_user_id(), 'ADMIN'));

create policy organization_members_delete on organization_members
  for delete
  using (has_min_role(organization_id, app_current_user_id(), 'ADMIN'));

-- projects ------------------------------------------------------------------

alter table projects enable row level security;
grant select, insert, update, delete on projects to app_user;

create policy projects_select on projects
  for select
  using (is_active_member(organization_id, app_current_user_id()));

create policy projects_insert on projects
  for insert
  with check (
    has_min_role(organization_id, app_current_user_id(), 'EDITOR')
    and created_by = app_current_user_id()
  );

create policy projects_update on projects
  for update
  using (has_min_role(organization_id, app_current_user_id(), 'EDITOR'))
  with check (has_min_role(organization_id, app_current_user_id(), 'EDITOR'));

create policy projects_delete on projects
  for delete
  using (has_min_role(organization_id, app_current_user_id(), 'ADMIN'));

-- Atomic organization + first OWNER creation --------------------------------
-- Runs as the migration owner (SECURITY DEFINER), so it bypasses the RLS
-- policies above by design -- this is the one deliberate, narrow exception,
-- used only at signup (US-01/S02) to solve the "no membership row yet exists
-- to satisfy organization_members_insert" bootstrap problem.

create function create_organization_with_owner(
  p_org_name text,
  p_owner_user_id uuid,
  p_owner_display_name text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if p_owner_user_id is distinct from app_current_user_id() then
    raise exception 'owner must be the requesting user' using errcode = '42501';
  end if;

  insert into organizations (name) values (p_org_name) returning id into v_org_id;

  insert into profiles (id, display_name)
  values (p_owner_user_id, p_owner_display_name)
  on conflict (id) do nothing;

  insert into organization_members (organization_id, user_id, role, status)
  values (v_org_id, p_owner_user_id, 'OWNER', 'ACTIVE');

  return v_org_id;
end;
$$;

revoke all on function create_organization_with_owner(text, uuid, text) from public;
grant execute on function create_organization_with_owner(text, uuid, text) to app_user;
