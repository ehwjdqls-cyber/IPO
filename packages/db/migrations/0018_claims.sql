create table claims (
  id uuid primary key default gen_random_uuid(),
  answer_version_id uuid not null references answer_versions(id) on delete cascade,
  claim_index integer not null,
  claim_text text not null,
  is_factual boolean not null,
  evidence_status evidence_status not null,
  created_at timestamptz not null default now(),
  unique (answer_version_id, claim_index)
);
