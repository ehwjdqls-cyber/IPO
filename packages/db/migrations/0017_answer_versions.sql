create type review_status as enum ('DRAFT','NEEDS_REVIEW','APPROVED','REJECTED');
create type evidence_status as enum ('SUPPORTED','PARTIAL','NEEDS_EVIDENCE','CONFLICT');

create table answer_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  version integer not null,
  body_markdown text not null,
  source text not null check (source in ('AI','USER')),
  evidence_status evidence_status not null,
  review_status review_status not null default 'DRAFT',
  model_snapshot text,
  prompt_version text,
  retrieval_set_hash char(64),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (question_id, version)
);

create index answer_versions_question_version_idx on answer_versions (question_id, version desc);
