-- S07 문서 상세·추출 검증: 사용자가 잘못 추출된 페이지를 제외할 수 있어야 한다.
-- 0011의 "pages는 워커 전용" 결정은 extracted_text/extraction_confidence 등
-- 추출 결과 자체에는 여전히 유효하므로, excluded 컬럼만 column-level GRANT로
-- 좁혀 app_user에게 연다 (다른 컬럼은 여전히 워커(service role)만 쓸 수 있다).

grant update (excluded) on document_pages to app_user;

create policy document_pages_update on document_pages
  for update
  using (
    exists (
      select 1 from documents d
      where d.id = document_pages.document_id
        and has_min_role(d.organization_id, app_current_user_id(), 'EDITOR')
    )
  )
  with check (
    exists (
      select 1 from documents d
      where d.id = document_pages.document_id
        and has_min_role(d.organization_id, app_current_user_id(), 'EDITOR')
    )
  );
