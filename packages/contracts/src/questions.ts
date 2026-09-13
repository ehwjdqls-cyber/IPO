import { z } from "zod";
import { EVIDENCE_STATUSES, REVIEW_STATUSES } from "./answers";

export const QUESTION_CATEGORIES = [
  "BUSINESS",
  "FINANCE",
  "CUSTOMER",
  "GOVERNANCE",
  "INTERNAL_CONTROL",
  "RISK",
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const PRIORITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const QUESTION_DEPTHS = ["QUICK", "STANDARD", "DEEP"] as const;
export type QuestionDepth = (typeof QUESTION_DEPTHS)[number];

/** spec S08: 자료 범위(문서 선택)·카테고리·질문 수·심층도. documentIds
 * absent/omitted means "READY 문서 전체" per spec's "자료 범위" field. */
export const createQuestionJobRequestSchema = z.object({
  documentIds: z.array(z.string().uuid()).optional(),
  categories: z.array(z.enum(QUESTION_CATEGORIES)).min(1),
  questionCount: z.union([z.literal(10), z.literal(20), z.literal(30)]).default(20),
  depth: z.enum(QUESTION_DEPTHS).default("STANDARD"),
});
export type CreateQuestionJobRequest = z.infer<typeof createQuestionJobRequestSchema>;

/** spec S10 도구막대: 검색/카테고리/중요도/상태/담당자 필터. "상태"는
 * evidenceStatus(근거 상태)와 reviewStatus(검토 상태) 두 축으로 분리했다
 * -- KPI("미작성/근거 부족/충돌"과 "검토 대기/승인")가 이미 서로 다른 두
 * 축을 섞어 보여주므로, 필터도 두 개의 명확한 파라미터가 더 정확하다.
 * evidenceStatus="UNANSWERED"는 DB의 evidence_status enum에는 없는 값으로,
 * "아직 답변 버전이 없음"을 뜻한다(질문 생성 직후, 답변 생성 전 상태). */
export const listQuestionsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.enum(QUESTION_CATEGORIES).optional(),
  priority: z.enum(PRIORITY_LEVELS).optional(),
  evidenceStatus: z.enum([...EVIDENCE_STATUSES, "UNANSWERED"]).optional(),
  reviewStatus: z.enum(REVIEW_STATUSES).optional(),
  assignedTo: z.string().uuid().optional(),
});
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;

/** spec 19절: GET/PATCH .../questions/{questionId}. Only assignedTo and
 * priority are user-editable here -- question_text/rationale/category are
 * AI-generated content, spec doesn't describe an edit path for them. */
export const updateQuestionRequestSchema = z
  .object({
    assignedTo: z.string().uuid().nullable().optional(),
    priority: z.enum(PRIORITY_LEVELS).optional(),
  })
  .refine((data) => data.assignedTo !== undefined || data.priority !== undefined, {
    message: "수정할 필드(assignedTo 또는 priority)가 없습니다.",
  });
export type UpdateQuestionRequest = z.infer<typeof updateQuestionRequestSchema>;
