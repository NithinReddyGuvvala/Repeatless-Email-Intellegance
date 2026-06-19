import { createServerFn } from "@tanstack/react-start";

/**
 * Client-safe server action to verify if a user has an active session
 * and if they have already linked a Gmail account.
 * This runs entirely on the server, keeping server-only imports out of client routes.
 */
export const checkAuthAction = createServerFn()
  .handler(async () => {
    // Dynamic import to ensure server-only code is stripped from client bundles
    const { getAuthenticatedUser, supabaseAdmin } = await import("./server.server");
    
    const user = await getAuthenticatedUser();
    if (!user) {
      return { isAuthenticated: false, hasAccount: false };
    }

    let hasAccount = false;
    if (supabaseAdmin) {
      const { data } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      hasAccount = !!data && data.length > 0;
    }

    return { isAuthenticated: true, hasAccount };
  });
