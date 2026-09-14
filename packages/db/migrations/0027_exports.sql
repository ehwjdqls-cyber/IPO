-- spec 17절 DDL 원문 그대로. S14 탭1(내보내기)/spec 20절
-- "POST /projects/{projectId}/exports | EDITOR+"의 기반 테이블.
-- status는 jobs와 같은 job_status enum을 재사용한다(0012에서 이미 정의됨).

create table exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  format text not null check (format in ('DOCX', 'XLSX')),
  storage_key text,
  status job_status not null default 'QUEUED',
  filters jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table exports enable row level security;
grant select, insert on exports to app_user;

-- SELECT: 같은 조직 활성 멤버라면 누구나 (문서/질문 조회와 같은 패턴).
create policy exports_select on exports
  for select
  using (is_active_member(organization_id, app_current_user_id()));

-- INSERT: EDITOR+ (spec 20절 접근표), created_by 위조 방지.
create policy exports_insert on exports
  for insert
  with check (
    created_by = app_current_user_id()
    and has_min_role(organization_id, app_current_user_id(), 'EDITOR')
  );

-- UPDATE 정책 없음: 이번 구현은 요청 핸들러 안에서 동기적으로 생성까지
-- 끝내고 완료 상태로 INSERT하므로(실시간 job 진행 갱신이 필요 없음),
-- status를 나중에 바꿀 경로가 없다. 비동기 처리로 바뀌면 jobs 테이블처럼
-- worker(서비스 롤)가 갱신하도록 확장하면 된다.
