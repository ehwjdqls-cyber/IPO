create table reviews (
  id uuid primary key default gen_random_uuid(),
  answer_version_id uuid not null references answer_versions(id) on delete cascade,
  reviewer_id uuid not null references profiles(id),
  decision text not null check (decision in ('APPROVED','REJECTED')),
  comment text,
  created_at timestamptz not null default now()
);
