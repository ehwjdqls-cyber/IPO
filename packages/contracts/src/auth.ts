import { z } from "zod";

export const signupRequestSchema = z.object({
  orgName: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(120),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
