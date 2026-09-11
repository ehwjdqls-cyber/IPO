import "server-only";
import { createSupabaseServerClient } from "./supabase/server";

export interface AuthenticatedUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Verifies the caller's session against Supabase Auth (never trusts an
 * unverified cookie value). Returns null for anonymous/expired sessions --
 * callers are responsible for turning that into a 401 UNAUTHENTICATED.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_confirmed_at != null,
  };
}
