-- S11/S13 검토 흐름(review-request -> reviews)은 answer_versions.review_status
-- 를 DRAFT -> NEEDS_REVIEW -> APPROVED/REJECTED로 전이시켜야 하는데, 0021은
-- answer_versions를 "쓰면 끝, 불변" 테이블로 잘못 설계했다(spec DDL에
-- review_status 컬럼 자체가 answer_versions에 있다는 걸 놓침). column-level
-- GRANT로 review_status만 열어준다 -- body_markdown 등 답변 본문 컬럼은
-- 여전히 불변으로 남는다(수정은 새 버전 INSERT로만 가능, 0021의 원래 의도).
--
-- 임계값은 REVIEWER+(has_min_role 'REVIEWER')로 잡는다: review-request는
-- EDITOR+가, 실제 승인/반려는 REVIEWER+가 수행하는데 REVIEWER의 role rank가
-- EDITOR보다 낮으므로 REVIEWER+ 하나의 임계값이 두 그룹을 모두 포함한다.
-- 정확한 액션별 권한(review-request는 EDITOR+만, reviews는 REVIEWER+만)은
-- 앱 레이어의 can() 체크가 그 위에서 강제한다(RLS는 더 느슨한 하한선).

grant update (review_status) on answer_versions to app_user;

create policy answer_versions_update_review_status on answer_versions
  for update
  using (
    exists (
      select 1 from questions q
      where q.id = answer_versions.question_id
        and has_min_role(q.organization_id, app_current_user_id(), 'REVIEWER')
    )
  )
  with check (
    exists (
      select 1 from questions q
      where q.id = answer_versions.question_id
        and has_min_role(q.organization_id, app_current_user_id(), 'REVIEWER')
    )
  );
