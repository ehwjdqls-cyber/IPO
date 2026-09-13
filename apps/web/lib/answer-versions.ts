import "server-only";
import type { EvidenceStatus, ReviewStatus } from "@ipo/contracts";

export interface AnswerVersionRow {
  id: string;
  question_id: string;
  version: number;
  body_markdown: string;
  source: "AI" | "USER";
  evidence_status: EvidenceStatus;
  review_status: ReviewStatus;
  model_snapshot: string | null;
  prompt_version: string | null;
  retrieval_set_hash: string | null;
  created_by: string;
  created_at: string;
}

export interface AnswerVersionDto {
  id: string;
  questionId: string;
  version: number;
  bodyMarkdown: string;
  source: "AI" | "USER";
  evidenceStatus: EvidenceStatus;
  reviewStatus: ReviewStatus;
  modelSnapshot: string | null;
  promptVersion: string | null;
  createdBy: string;
  createdAt: string;
}

export function toAnswerVersionDto(row: AnswerVersionRow): AnswerVersionDto {
  return {
    id: row.id,
    questionId: row.question_id,
    version: row.version,
    bodyMarkdown: row.body_markdown,
    source: row.source,
    evidenceStatus: row.evidence_status,
    reviewStatus: row.review_status,
    modelSnapshot: row.model_snapshot,
    promptVersion: row.prompt_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const ANSWER_VERSION_COLUMNS =
  "id, question_id, version, body_markdown, source, evidence_status, review_status, model_snapshot, prompt_version, retrieval_set_hash, created_by, created_at";

export interface ClaimRow {
  id: string;
  answer_version_id: string;
  claim_index: number;
  claim_text: string;
  is_factual: boolean;
  evidence_status: EvidenceStatus;
}

export interface ClaimDto {
  id: string;
  claimIndex: number;
  claimText: string;
  isFactual: boolean;
  evidenceStatus: EvidenceStatus;
}

export function toClaimDto(row: ClaimRow): ClaimDto {
  return {
    id: row.id,
    claimIndex: row.claim_index,
    claimText: row.claim_text,
    isFactual: row.is_factual,
    evidenceStatus: row.evidence_status,
  };
}

export const CLAIM_COLUMNS = "id, answer_version_id, claim_index, claim_text, is_factual, evidence_status";

export interface CitationRow {
  id: string;
  claim_id: string;
  chunk_id: string;
  quote_text: string;
  page_number: number;
  relevance_score: string;
  verdict: "SUPPORTS" | "PARTIAL" | "CONFLICTS";
}

export interface CitationDto {
  id: string;
  claimId: string;
  chunkId: string;
  quoteText: string;
  pageNumber: number;
  relevanceScore: number;
  verdict: "SUPPORTS" | "PARTIAL" | "CONFLICTS";
}

export function toCitationDto(row: CitationRow): CitationDto {
  return {
    id: row.id,
    claimId: row.claim_id,
    chunkId: row.chunk_id,
    quoteText: row.quote_text,
    pageNumber: row.page_number,
    relevanceScore: Number(row.relevance_score),
    verdict: row.verdict,
  };
}

export const CITATION_COLUMNS = "id, claim_id, chunk_id, quote_text, page_number, relevance_score, verdict";
