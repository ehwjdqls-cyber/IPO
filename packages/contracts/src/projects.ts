import { z } from "zod";

export const marketTypeSchema = z.enum(["KOSPI", "KOSDAQ", "KONEX", "UNDECIDED"]);
export type MarketType = z.infer<typeof marketTypeSchema>;

export const projectStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "DELETING"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.");

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  companyNameKo: z.string().trim().min(1).max(200),
  companyNameEn: z.string().trim().min(1).max(200).optional(),
  industry: z.string().trim().min(1).max(200),
  websiteUrl: z.url().optional(),
  targetMarket: marketTypeSchema.default("UNDECIDED"),
  targetFilingDate: isoDate.optional(),
  leadUnderwriter: z.string().trim().min(1).max(200).optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    companyNameKo: z.string().trim().min(1).max(200),
    companyNameEn: z.string().trim().min(1).max(200),
    industry: z.string().trim().min(1).max(200),
    websiteUrl: z.url(),
    targetMarket: marketTypeSchema,
    targetFilingDate: isoDate,
    leadUnderwriter: z.string().trim().min(1).max(200),
    status: projectStatusSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "수정할 값이 없습니다." });
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
