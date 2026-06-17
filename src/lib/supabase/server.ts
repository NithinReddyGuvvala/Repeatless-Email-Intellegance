import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

// Reusable server-side admin Supabase client singleton
let supabaseAdmin: SupabaseClient | null = null;

// Only execute server client initialization on the server
if (typeof window === "undefined") {
  const env = getEnv();
  const supabaseUrl = env.SUPABASE_URL;
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
}

export { supabaseAdmin };

/**
 * Helper to retrieve the currently authenticated Supabase user from the server request.
 * Automatically parses Authorization headers and standard Supabase cookies.
 * In local development, provides a fallback profile to avoid blocking developers.
 */
export async function getAuthenticatedUser(): Promise<{ id: string; email: string } | null> {
  const { getEvent, getHeaders } = (await import("vinxi/http" as string)) as {
    getEvent: () => unknown;
    getHeaders: (event: unknown) => Record<string, string | undefined>;
  };
  const event = getEvent();
  if (!event) return null;

  const headers = getHeaders(event);
  const env = getEnv();
  let token: string | null = null;

  // 1. Check Authorization Bearer header
  const authHeader = headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    // 2. Fallback: Parse cookies for sb-*-auth-token
    const cookieHeader = headers["cookie"] || "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c: string) => {
        const parts = c.trim().split("=");
        return [parts[0], parts.slice(1).join("=")];
      }),
    );

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

  // If we have a token, verify it
  if (token && supabaseAdmin) {
    // Create a client bound to the user's session token to verify authenticity
    const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await userClient.auth.getUser(token);
    if (!error && data?.user) {
      return { id: data.user.id, email: data.user.email || "" };
    }
  }

  // 3. Fallback for Local Development
  if (process.env.NODE_ENV === "development" && supabaseAdmin) {
    console.log(
      "[Supabase Auth Helper] No active user session found in request headers. Falling back to developer profile in development mode.",
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
