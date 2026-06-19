import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";
import { getCookies, getRequestHeaders } from "@tanstack/react-start/server";

// Reusable server-side admin Supabase client singleton
let supabaseAdmin: SupabaseClient | null = null;

// Only execute server client initialization on the server
if (typeof window === "undefined") {
  try {
    const env = getEnv();
    const rawSupabaseUrl = env.SUPABASE_URL;
    const supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "") : "";
    const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceRoleKey) {
      /**
       * Server/admin Supabase instance.
       * Uses the secret SUPABASE_SERVICE_ROLE_KEY.
       * This client bypasses Row Level Security (RLS) policies.
       *
       * WARNING: Never import or use this file in client-side / browser components.
       * It must ONLY be used in server actions, loaders, or API routes.
       */
      supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    } else {
      console.warn(
        "[Supabase Admin Client] Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. " +
          "Please check your .env.local configuration.",
      );
    }
  } catch (error) {
    console.warn(
      "[Supabase Admin Client] Warning: Environment validation deferred. " +
        "This is expected if variables are not fully loaded during build/import phase. " +
        "Detailed validation will execute during request handling.",
      error
    );
  }
}

export { supabaseAdmin };

/**
 * Helper to retrieve the currently authenticated Supabase user from the server request.
 * Automatically parses Authorization headers and standard Supabase cookies.
 * In local development, provides a fallback profile to avoid blocking developers.
 */
export async function getAuthenticatedUser(): Promise<{ id: string; email: string } | null> {
  if (typeof window !== "undefined") return null;

  let token: string | null = null;
  let isLoggedOutCookie = false;

  // 1. Try to parse headers and cookies using TanStack Start's server utilities
  try {
    const headers = (getRequestHeaders() as any) || {};
    const cookies = getCookies() || {};

    isLoggedOutCookie = cookies["inbox_harmony_logged_out"] === "true";

    // Check Authorization Bearer header
    const authHeader = headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      // Parse cookies for sb-*-auth-token
      const supabaseCookieKey = Object.keys(cookies).find(
        (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
      );

      if (supabaseCookieKey && cookies[supabaseCookieKey]) {
        try {
          const parsed = JSON.parse(decodeURIComponent(cookies[supabaseCookieKey]));
          token = parsed?.access_token || null;
        } catch {
          token = cookies[supabaseCookieKey];
        }
      }
    }
  } catch (err) {
    console.warn(
      "[Supabase Auth Helper] Request context/cookies unavailable or failed to parse:",
      err,
    );
  }

  // 2. If we have a token, verify it with Supabase Auth
  if (token && supabaseAdmin) {
    try {
      const env = getEnv();
      const rawSupabaseUrl = env.SUPABASE_URL;
      const supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "") : "";
      const userClient = createClient(supabaseUrl, env.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { data, error } = await userClient.auth.getUser(token);
      if (!error && data?.user) {
        return { id: data.user.id, email: data.user.email || "" };
      }
    } catch (err) {
      console.error("[Supabase Auth Helper] Failed to verify user token:", err);
    }
  }

  const isDev =
    process.env.NODE_ENV === "development" ||
    (typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    (typeof import.meta !== "undefined" && import.meta.env?.MODE === "development");

  // 3. In local development mode, if no session exists, fall back to the developer user
  if (isDev && !isLoggedOutCookie) {
    if (supabaseAdmin) {
      console.log(
        "[Supabase Auth Helper] No authenticated session found. Development mode: Returning fallback/mock developer profile.",
      );

      // Try fetching the first existing user profile
      const { data: existingUser } = await supabaseAdmin
        .from("users")
        .select("id, email")
        .limit(1)
        .maybeSingle();

      if (existingUser) {
        return { id: existingUser.id, email: existingUser.email };
      }

      // If no profiles exist, create a default developer user in Supabase auth (which triggers sync to public.users)
      const devEmail = "developer@inboxharmony.local";
      const { data: newAuthUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: devEmail,
        password: "devPassword123!",
        email_confirm: true,
      });

      if (authError) {
        console.error("[Supabase Auth Helper] Error creating fallback dev user:", authError);
        return null;
      }

      if (newAuthUser?.user) {
        return { id: newAuthUser.user.id, email: devEmail };
      }
    }
    return null;
  }

  return null;
}

/**
 * Returns a user-scoped Supabase client with the authenticated user's session active.
 * Ensures Row Level Security (RLS) policies are correctly applied.
 */
export async function getSupabaseUserClient(): Promise<SupabaseClient | null> {
  if (typeof window !== "undefined") return null;

  let token: string | null = null;

  try {
    const headers = (getRequestHeaders() as any) || {};
    const cookies = getCookies() || {};

    const authHeader = headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      const supabaseCookieKey = Object.keys(cookies).find(
        (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
      );

      if (supabaseCookieKey && cookies[supabaseCookieKey]) {
        try {
          const parsed = JSON.parse(decodeURIComponent(cookies[supabaseCookieKey]));
          token = parsed?.access_token || null;
        } catch {
          token = cookies[supabaseCookieKey];
        }
      }
    }
  } catch (err) {
    console.warn("[getSupabaseUserClient] Failed to parse token:", err);
  }

  const env = getEnv();
  const rawSupabaseUrl = env.SUPABASE_URL;
  const supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "") : "";

  if (token) {
    const userClient = createClient(supabaseUrl, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    await userClient.auth.setSession({
      access_token: token,
      refresh_token: "",
    });
    return userClient;
  }

  // Fallback to dev user client in development
  const isDev =
    process.env.NODE_ENV === "development" ||
    (typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    (typeof import.meta !== "undefined" && import.meta.env?.MODE === "development");

  if (isDev && supabaseAdmin) {
    const fallbackUser = await getAuthenticatedUser();
    if (fallbackUser) {
      const userClient = createClient(supabaseUrl, env.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      const { data, error } = await userClient.auth.signInWithPassword({
        email: fallbackUser.email,
        password: "devPassword123!",
      });
      if (!error && data?.session) {
        return userClient;
      }
    }
  }

  return null;
}
