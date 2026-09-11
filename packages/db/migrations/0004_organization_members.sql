create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null,
  can_download_original boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('INVITED','ACTIVE','SUSPENDED')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
