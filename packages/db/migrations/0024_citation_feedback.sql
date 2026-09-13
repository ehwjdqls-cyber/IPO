-- spec S12/20.7: "정확함/부정확함/불충분함" 근거 적합성 피드백. "이 피드백은
-- 모델 학습에 자동 사용하지 않고 평가 데이터셋 후보로 별도 보관한다" -- 별도
-- 테이블에 그냥 쌓아두기만 하면 되는 감사 로그 성격의 데이터라, claims/
-- citations처럼 불변으로 두고 UPDATE/DELETE 정책은 두지 않는다.

create table citation_feedback (
  id uuid primary key default gen_random_uuid(),
  citation_id uuid not null references citations(id) on delete cascade,
  user_id uuid not null references profiles(id),
  feedback text not null check (feedback in ('ACCURATE', 'INACCURATE', 'INSUFFICIENT')),
  comment text,
  created_at timestamptz not null default now()
);

create index citation_feedback_citation_id_idx on citation_feedback (citation_id);

alter table citation_feedback enable row level security;
grant select, insert on citation_feedback to app_user;

-- GET /citations/{id}와 마찬가지로 "전체"(role 무관, 조직 멤버라면 누구나)
-- 남길 수 있는 피드백이라 citations_select와 같은 is_active_member 하한선만
-- 사용한다 (job.manage 같은 role 임계값 없음).
create policy citation_feedback_select on citation_feedback
  for select
  using (
    exists (
      select 1 from citations c
      join claims cl on cl.id = c.claim_id
      join answer_versions av on av.id = cl.answer_version_id
      join questions q on q.id = av.question_id
      where c.id = citation_feedback.citation_id
        and is_active_member(q.organization_id, app_current_user_id())
    )
  );

create policy citation_feedback_insert on citation_feedback
  for insert
  with check (
    user_id = app_current_user_id()
    and exists (
      select 1 from citations c
      join claims cl on cl.id = c.claim_id
      join answer_versions av on av.id = cl.answer_version_id
      join questions q on q.id = av.question_id
      where c.id = citation_feedback.citation_id
        and is_active_member(q.organization_id, app_current_user_id())
    )
  );
