-- profiles.id is the same id as the Auth provider's user id (e.g. Supabase
-- auth.users.id). No FK is declared here because auth.users only exists once
-- a real Supabase-provisioned Postgres is targeted; that FK is added in a
-- follow-up migration when the Auth integration (Milestone 1 Task 5/6) lands.
create table profiles (
  id uuid primary key,
  display_name text not null,
  locale text not null default 'ko-KR',
  timezone text not null default 'Asia/Seoul',
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
