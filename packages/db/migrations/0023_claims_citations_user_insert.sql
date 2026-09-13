-- spec 20.5 "답변 편집본 저장"(POST .../answer-versions)은 사용자가 claims를
-- 직접 정의하고 기존 citation을 참조해 새 citation row를 만들어야 하는데,
-- 0021은 claims/citations INSERT를 전부 service-role(워커) 전용으로 잠갔다
-- (AI 생성 데이터만 염두에 뒀던 설계 -- 0022의 review_status 누락과 같은
-- 종류의 간극). AI가 생성한 answer_versions(source='AI')의 claims/citations는
-- 여전히 worker 전용으로 남기고, source='USER'인 answer_version에 한해서만
-- EDITOR+가 claims/citations를 직접 쓸 수 있도록 좁게 연다.

grant insert on claims to app_user;

create policy claims_insert_user_version on claims
  for insert
  with check (
    exists (
      select 1 from answer_versions av
      join questions q on q.id = av.question_id
      where av.id = claims.answer_version_id
        and av.source = 'USER'
        and has_min_role(q.organization_id, app_current_user_id(), 'EDITOR')
    )
  );

grant insert on citations to app_user;

create policy citations_insert_user_version on citations
  for insert
  with check (
    exists (
      select 1 from claims c
      join answer_versions av on av.id = c.answer_version_id
      join questions q on q.id = av.question_id
      where c.id = citations.claim_id
        and av.source = 'USER'
        and has_min_role(q.organization_id, app_current_user_id(), 'EDITOR')
    )
  );
