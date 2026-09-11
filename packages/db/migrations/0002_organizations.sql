create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  retention_days integer not null default 365 check (retention_days between 30 and 3650),
  legal_hold boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
