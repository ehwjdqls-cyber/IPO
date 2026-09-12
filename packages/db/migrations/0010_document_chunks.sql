-- Milestone 1's 0001 deferred this extension until a table actually needed
-- it (see that file's comment); document_chunks.embedding is that table.
create extension if not exists vector;

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  page_id uuid not null references document_pages(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  content_sha256 char(64) not null,
  token_count integer not null check (token_count > 0),
  bbox jsonb,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (page_id, chunk_index)
);

create index document_chunks_scope_idx on document_chunks (organization_id, project_id, document_id);
create index document_chunks_embedding_idx on document_chunks using hnsw (embedding vector_cosine_ops);
create index document_chunks_fts_idx on document_chunks using gin (to_tsvector('simple', content));
