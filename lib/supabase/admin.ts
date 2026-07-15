import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client using the service role key. Server-only —
 * never import this from a Client Component. Used for admin operations
 * like creating a teammate's auth user directly (Team -> Create user).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
