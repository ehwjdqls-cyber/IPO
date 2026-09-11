import { createBrowserClient } from "@supabase/ssr";

/**
 * Next.js inlines `NEXT_PUBLIC_*` vars into the browser bundle at build time,
 * so this reads `process.env` directly rather than via lib/env.ts -- that
 * module imports "server-only" and cannot be pulled into client code.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
  }
  return createBrowserClient(url, anonKey);
}
