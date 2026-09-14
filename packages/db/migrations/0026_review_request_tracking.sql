-- S13 검토함 목록 컬럼("질문, 답변 변경요약, 근거상태, 요청자, 요청시각")이
-- "요청자/요청시각"을 요구하는데, 0022의 review_status 컬럼만으로는
-- NEEDS_REVIEW로 바뀐 시점/누가 요청했는지 알 수 없다 -- 검토 요청 시점에
-- 같이 기록해둔다.

alter table answer_versions add column review_requested_by uuid references profiles(id);
alter table answer_versions add column review_requested_at timestamptz;

-- review-request 엔드포인트(EDITOR+)가 review_status와 함께 이 두 컬럼도
-- 갱신해야 하므로, 0022가 review_status에 연 것과 같은 컬럼 단위 GRANT를
-- 추가한다(같은 REVIEWER+ 하한선 정책을 그대로 재사용 -- 0022의
-- answer_versions_update_review_status 정책은 "review_status 컬럼"이
-- 아니라 "이 행을 이 조건으로 UPDATE할 수 있는지"만 판단하므로, 컬럼
-- GRANT만 넓히면 정책 재작성 없이 적용된다).
grant update (review_requested_by, review_requested_at) on answer_versions to app_user;
