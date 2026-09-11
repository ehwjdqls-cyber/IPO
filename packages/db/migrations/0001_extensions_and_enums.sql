-- Milestone 1 does not create any document_chunks/vector column yet, so the
-- `vector` extension from the spec's full DDL (section 17) is deferred to the
-- Milestone 2 migration that introduces document_chunks.
create extension if not exists pgcrypto;

create type member_role as enum ('OWNER','ADMIN','EDITOR','REVIEWER','VIEWER');
create type market_type as enum ('KOSPI','KOSDAQ','KONEX','UNDECIDED');
