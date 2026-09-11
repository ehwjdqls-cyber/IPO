import { z } from "zod";

const nonEmpty = () => z.string().min(1);

export const serverEnvSchema = z.object({
  APP_URL: z.url(),
  DATABASE_URL: z.url().refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
    message: "DATABASE_URL must be a postgres connection string",
  }),
  AUTH_SECRET: z.string().min(32),

  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty(),

  OBJECT_STORAGE_ENDPOINT: z.url(),
  OBJECT_STORAGE_REGION: nonEmpty(),
  OBJECT_STORAGE_BUCKET: nonEmpty(),
  OBJECT_STORAGE_ACCESS_KEY_ID: nonEmpty(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: nonEmpty(),
  OBJECT_STORAGE_KMS_KEY_ID: nonEmpty(),

  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: nonEmpty(),
  QSTASH_TOKEN: nonEmpty(),
  QSTASH_CURRENT_SIGNING_KEY: nonEmpty(),
  QSTASH_NEXT_SIGNING_KEY: nonEmpty(),

  AI_API_KEY: nonEmpty(),
  AI_GENERATION_MODEL_SNAPSHOT: nonEmpty(),
  AI_EMBEDDING_MODEL_SNAPSHOT: nonEmpty(),

  SENTRY_DSN: z.url(),
  AUDIT_HASH_PEPPER: z.string().min(32),
});

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty(),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server environment variables: ${formatIssues(result.error)}`);
  }
  return result.data;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid public environment variables: ${formatIssues(result.error)}`);
  }
  return result.data;
}
