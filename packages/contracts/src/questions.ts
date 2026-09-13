import { z } from "zod";

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
