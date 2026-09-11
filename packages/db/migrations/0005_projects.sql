create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  company_name_ko text not null,
  company_name_en text,
  industry text not null,
  website_url text,
  target_market market_type not null default 'UNDECIDED',
  target_filing_date date,
  lead_underwriter text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED','DELETING')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
