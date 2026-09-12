create table document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  extracted_text text not null default '',
  extraction_confidence numeric(5,4),
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (document_id, page_number)
);
