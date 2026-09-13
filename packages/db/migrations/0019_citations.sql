create table citations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  chunk_id uuid not null references document_chunks(id) on delete restrict,
  quote_text text not null,
  page_number integer not null check (page_number > 0),
  relevance_score numeric(5,4) not null check (relevance_score between 0 and 1),
  verdict text not null check (verdict in ('SUPPORTS','PARTIAL','CONFLICTS')),
  created_at timestamptz not null default now()
);
