-- spec 17절 DDL 원문 그대로. S13/S14가 요구하는 감사로그의 기반 테이블 --
-- "근거 충돌 상태에서 승인 시 예외 승인을 감사로그에 기록한다"(S13),
-- "감사로그: 사용자, 행동, 대상, 시각, IP 마스킹값"(S14 탭3).

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  actor_user_id uuid references profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  ip_hash char(64),
  user_agent_hash char(64),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_scope_time_idx on audit_events (organization_id, created_at desc);

alter table audit_events enable row level security;
grant select, insert on audit_events to app_user;

-- INSERT: 자기 자신의 행동만 자기 이름으로 기록할 수 있다(actor_user_id
-- 위조 방지). 조직 활성 멤버라면 role 무관하게 자신의 행동을 기록할 수
-- 있어야 한다 -- 감사로그는 "무엇을 했는지"를 남기는 것이지 role로
-- 제한할 기능이 아니다.
create policy audit_events_insert on audit_events
  for insert
  with check (
    actor_user_id = app_current_user_id()
    and is_active_member(organization_id, app_current_user_id())
  );

-- SELECT: S14 탭3(감사로그) 전체 조회는 조직 운영 정보라 ADMIN+로 제한하되,
-- 자신이 직접 기록한 이벤트는 role과 무관하게 볼 수 있다 -- 이게 없으면
-- "INSERT ... RETURNING"이 삽입 직후 그 행을 SELECT 정책으로도 재확인하는
-- Postgres RLS 동작 때문에, ADMIN 미만 사용자의 정상적인 자기 행동 기록
-- INSERT조차 RETURNING 단계에서 막혀버린다(직접 재현해서 확인함).
create policy audit_events_select on audit_events
  for select
  using (
    actor_user_id = app_current_user_id()
    or has_min_role(organization_id, app_current_user_id(), 'ADMIN')
  );
