import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

// Reusable browser-side Supabase client singleton
let supabaseBrowser: SupabaseClient | null = null;

const env = getEnv();
const supabaseUrl = env.SUPABASE_URL;
const supabaseAnonKey = env.SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseAnonKey) {
  /**
   * Browser/client Supabase instance.
   * Uses the public SUPABASE_URL and SUPABASE_ANON_KEY.
   * Safe to use on the client/frontend.
   */
  supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
} else {
  // Output a helpful console warning during local development instead of throwing
  // immediately, allowing the application to load even if environment variables are not yet set.
  if (typeof window !== "undefined") {
    console.warn(
      "[Supabase Client] Warning: SUPABASE_URL or SUPABASE_ANON_KEY is missing. " +
        "Please check your .env.local configuration.",
    );
  }
}

export { supabaseBrowser };
