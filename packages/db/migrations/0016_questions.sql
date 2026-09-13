create type question_category as enum ('BUSINESS','FINANCE','CUSTOMER','GOVERNANCE','INTERNAL_CONTROL','RISK');
create type priority_level as enum ('LOW','MEDIUM','HIGH','CRITICAL');

create table questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  category question_category not null,
  question_text text not null,
  rationale text not null,
  priority priority_level not null default 'MEDIUM',
  follow_up_questions jsonb not null default '[]'::jsonb,
  source_job_id uuid references jobs(id) on delete set null,
  assigned_to uuid references profiles(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_project_status_idx on questions (project_id, category, priority);
