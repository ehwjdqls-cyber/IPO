create type document_status as enum ('UPLOADED','SCANNING','EXTRACTING','INDEXING','READY','FAILED','DELETING','DELETED');

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  original_filename text not null,
  storage_key text not null unique,
  media_type text not null,
  byte_size bigint not null check (byte_size between 1 and 52428800),
  sha256 char(64) not null,
  version integer not null default 1 check (version > 0),
  page_count integer check (page_count >= 0),
  status document_status not null default 'UPLOADED',
  failure_code text,
  failure_message text,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, sha256, version)
);
