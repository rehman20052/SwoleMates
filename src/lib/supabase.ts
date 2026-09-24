import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseClientKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseClientKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL and either EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

const globalClient = globalThis as typeof globalThis & {
  __swolematesSupabase?: SupabaseClient;
};

// Reuse one client across refreshes. A second client on the same browser
// session makes sign-in fail or hang.
export const supabase =
  globalClient.__swolematesSupabase ??
  createClient(supabaseUrl, supabaseClientKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

globalClient.__swolematesSupabase = supabase;
