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

export const REVIEW_DECISIONS = ["APPROVED", "REJECTED"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** spec 20.5: 사용자 편집본 저장. citationIds는 이미 존재하는 citation row의
 * id를 참조한다(같은 질문의 이전 답변 버전들에서 검증된 근거를 재사용) --
 * 사용자가 새 인용문/청크를 임의로 만들 수는 없다. citationIds가 비어 있는
 * 사실(factual) claim은 evidenceStatus를 명시적으로 "NEEDS_EVIDENCE"로
 * 지정해야만 저장할 수 있다("citation이 없는 사실 claim은 422로 거부하거나
 * 사용자가 명시적으로 NEEDS_EVIDENCE로 저장해야 한다"). */
export const answerVersionClaimInputSchema = z
  .object({
    claimIndex: z.number().int().min(0),
    claimText: z.string().trim().min(1),
    isFactual: z.boolean(),
    citationIds: z.array(z.string().uuid()).default([]),
    evidenceStatus: z.literal("NEEDS_EVIDENCE").optional(),
  })
  .refine((claim) => !claim.isFactual || claim.citationIds.length > 0 || claim.evidenceStatus === "NEEDS_EVIDENCE", {
    message: "근거(citation)가 없는 사실 claim은 evidenceStatus를 NEEDS_EVIDENCE로 명시해야 합니다.",
    path: ["citationIds"],
  });
export type AnswerVersionClaimInput = z.infer<typeof answerVersionClaimInputSchema>;

/** claims can be empty -- a legitimate case when no evidence was found at
 * all for the question (the AI/mock answer itself may have zero claims),
 * not just "user hasn't filled anything in yet". */
export const createAnswerVersionRequestSchema = z.object({
  baseVersion: z.number().int().min(0),
  bodyMarkdown: z.string().trim().min(1),
  claims: z.array(answerVersionClaimInputSchema),
});
export type CreateAnswerVersionRequest = z.infer<typeof createAnswerVersionRequestSchema>;

/** spec 20.6: POST /answer-versions/{answerVersionId}/reviews. comment는
 * REJECTED일 때 사유를 남기는 용도로 흔히 쓰이지만 스펙 예시가 필수라고
 * 못박지 않아 선택값으로 둔다. */
export const createReviewRequestSchema = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  comment: z.string().trim().min(1).max(2000).optional(),
});
export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;
