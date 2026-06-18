import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

// Reusable browser-side Supabase client singleton
let supabaseBrowser: SupabaseClient | null = null;

/**
 * Lazily retrieves or initializes the browser/client Supabase instance.
 * Ensures window.ENV is hydrated first.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (supabaseBrowser) return supabaseBrowser;

  const env = getEnv();
  const rawSupabaseUrl = env.SUPABASE_URL;
  const supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "") : "";
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

    // Synchronize auth state with request cookies on the client side
    if (typeof window !== "undefined") {
      supabaseBrowser.auth.onAuthStateChange((event, session) => {
        try {
          const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
          const cookieName = `sb-${projectRef}-auth-token`;

          if (session) {
            const maxAge = 60 * 60 * 24 * 7; // 7 days
            const value = encodeURIComponent(JSON.stringify(session));
            const isSecure = window.location.protocol === "https:";
            document.cookie = `${cookieName}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${isSecure ? "; secure" : ""}`;
          } else {
            document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
          }
        } catch (e) {
          console.error("[Supabase Client] Error setting auth cookie:", e);
        }
      });
    }
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

  return supabaseBrowser;
}
