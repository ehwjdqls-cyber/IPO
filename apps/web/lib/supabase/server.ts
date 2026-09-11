import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "../env";

/**
 * Per-request Supabase client bound to the incoming request's cookies. Used
 * only to verify the caller's session (supabase.auth.getUser()) -- never to
 * read tenant data directly, since RLS in Postgres (packages/db) is the
 * actual data boundary, not this client.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render (no response to attach
          // cookies to) -- middleware.ts refreshes the session instead.
        }
      },
    },
  });
}
