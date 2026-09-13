import { z } from "zod";

export const ANSWER_STYLES = ["CFO_CONCISE"] as const;
export type AnswerStyle = (typeof ANSWER_STYLES)[number];

export const EVIDENCE_STATUSES = ["SUPPORTED", "PARTIAL", "NEEDS_EVIDENCE", "CONFLICT"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const REVIEW_STATUSES = ["DRAFT", "NEEDS_REVIEW", "APPROVED", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** spec 20.4: documentIds absent means the same "READY 문서 전체" default
 * as question-jobs. maxClaims defaults to 12 per spec's own example body. */
export const createAnswerJobRequestSchema = z.object({
  documentIds: z.array(z.string().uuid()).optional(),
  style: z.enum(ANSWER_STYLES).default("CFO_CONCISE"),
  maxClaims: z.number().int().min(1).max(50).default(12),
});
export type CreateAnswerJobRequest = z.infer<typeof createAnswerJobRequestSchema>;
