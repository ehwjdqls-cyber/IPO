import { z } from "zod";

/** spec S12: "정확함/부정확함/불충분함" 근거 적합성 피드백. */
export const CITATION_FEEDBACK_VALUES = ["ACCURATE", "INACCURATE", "INSUFFICIENT"] as const;
export type CitationFeedbackValue = (typeof CITATION_FEEDBACK_VALUES)[number];

export const createCitationFeedbackRequestSchema = z.object({
  feedback: z.enum(CITATION_FEEDBACK_VALUES),
  comment: z.string().trim().min(1).max(2000).optional(),
});
export type CreateCitationFeedbackRequest = z.infer<typeof createCitationFeedbackRequestSchema>;
