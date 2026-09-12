create type job_type as enum ('DOCUMENT_PROCESS','QUESTION_GENERATE','ANSWER_GENERATE','EXPORT');
create type job_status as enum ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  type job_type not null,
  status job_status not null default 'QUEUED',
  progress integer not null default 0 check (progress between 0 and 100),
  idempotency_key text not null,
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error_code text,
  error_message text,
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
