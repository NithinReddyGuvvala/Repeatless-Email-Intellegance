import { createServerFn } from "@tanstack/react-start";
import { getGoogleAuthUrl, exchangeCodeForTokens, getGmailProfile } from "./oauth";
import { supabaseAdmin, getAuthenticatedUser, getSupabaseUserClient } from "../supabase/server";
import { syncGmailAccount, syncGmailThread, refreshGmailAccessTokenIfNeeded, summarizeAndSaveEmail, summarizeAndSaveThread, fetchGmailMessageDetails, activeServerSyncs, runBackgroundSyncProcess, refreshCachedGmailCounts } from "./sync";
import { getEnv } from "../env";
import { getQuotaStatus, setQuotaExceeded } from "./quotaState";

export function classifyEmailCategory(
  labels: string[] = [],
  subject: string = "",
  fromAddress: string = "",
  bodyText: string = ""
): "Work" | "Newsletter" | "Job" | "Finance" | "Personal" | "Notification" {
  const upperLabels = (labels || []).map(l => l.toUpperCase());
  const textToSearch = `${subject || ""} ${fromAddress || ""} ${bodyText || ""}`.toLowerCase();

  // 1. Finance keywords
  const financeKeywords = [
    "invoice", "bill", "receipt", "statement", "payment", "bank", "transaction", 
    "tax", "refund", "checkout", "order", "salary", "stripe", "paypal", "finance", 
    "credit card", "wire transfer", "purchase confirmation", "receipts", "billing"
  ];
  if (financeKeywords.some(kw => textToSearch.includes(kw))) {
    return "Finance";
  }

  // 2. Job keywords
  const jobKeywords = [
    "job", "resume", "cv", "interview", "hiring", "recruitment", "recruiter", 
    "career", "offer letter", "apply", "applied", "applicant", "application status",
    "linkedin job", "workday", "job offer"
  ];
  if (jobKeywords.some(kw => textToSearch.includes(kw))) {
    return "Job";
  }

  // 3. Newsletter keywords / labels
  if (upperLabels.includes("CATEGORY_PROMOTIONS") || upperLabels.includes("PROMOTIONS")) {
    return "Newsletter";
  }
  const newsletterKeywords = ["newsletter", "subscribe", "unsubscribe", "digest", "promo", "coupon", "marketing", "substack"];
  if (newsletterKeywords.some(kw => textToSearch.includes(kw))) {
    return "Newsletter";
  }

  // 4. Notification keywords / labels
  if (upperLabels.includes("CATEGORY_UPDATES") || upperLabels.includes("UPDATES")) {
    return "Notification";
  }
  const notificationKeywords = ["notification", "alert", "security alert", "sign-in", "verification", "otp", "confirm your", "welcome to"];
  if (notificationKeywords.some(kw => textToSearch.includes(kw))) {
    return "Notification";
  }

  // 5. Personal labels
  if (
    upperLabels.includes("CATEGORY_PERSONAL") || 
    upperLabels.includes("CATEGORY_SOCIAL") || 
    upperLabels.includes("SOCIAL") || 
    upperLabels.includes("PERSONAL")
  ) {
    return "Personal";
  }

  // 6. Work labels/keywords
  if (upperLabels.includes("CATEGORY_FORUMS") || upperLabels.includes("FORUMS")) {
    return "Work";
  }

  // Default to Work
  return "Work";
}

// Helper to extract category from database join result, which is typed as an array in one-to-many structures
function extractCategory(emailCategories: any): string | undefined {
  if (Array.isArray(emailCategories)) {
    return emailCategories[0]?.category;
  }
  return emailCategories?.category;
}

/**
 * Server function to generate the Google OAuth redirect URL.
 */
export const getGoogleAuthUrlAction = createServerFn()
  .validator((payload: { redirectUri: string; forceSelectAccount?: boolean }) => {
    if (!payload.redirectUri || typeof payload.redirectUri !== "string") {
      throw new Error("redirectUri must be a non-empty string");
    }
    return payload;
  })
  .handler(async ({ data: { redirectUri, forceSelectAccount } }) => {
    const url = getGoogleAuthUrl(redirectUri, forceSelectAccount);
    return { url };
  });

interface CallbackPayload {
  code: string;
  redirectUri: string;
}

/**
 * Server function to handle the Google OAuth callback.
 * Exchanges the auth code for tokens, retrieves the Gmail email address,
 * maps it to the currently authenticated user, and saves it in Supabase.
 */
export const handleGoogleCallbackAction = createServerFn()
  .validator((payload: CallbackPayload) => {
    if (!payload.code || typeof payload.code !== "string") {
      throw new Error("Authorization code is required");
    }
    if (!payload.redirectUri || typeof payload.redirectUri !== "string") {
      throw new Error("Redirect URI is required");
    }
    return payload;
  })
  .handler(async ({ data: { code, redirectUri } }) => {
    // 1. Get currently authenticated Supabase user
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to link your Gmail account.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      // 2. Exchange code for access & refresh tokens
      const tokenData = await exchangeCodeForTokens(code, redirectUri);

      // 3. Retrieve Gmail profile address and history ID
      const gmailProfile = await getGmailProfile(tokenData.access_token);

      // Calculate token expiration timestamp
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokenData.expires_in);

      // Delete any pre-existing connected accounts that are different
      const newEmailClean = gmailProfile.emailAddress.toLowerCase();
      const { data: existingAccounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, email_address")
        .eq("user_id", user.id);

      if (existingAccounts && existingAccounts.length > 0) {
        const differentAccounts = existingAccounts.filter(a => a.email_address.toLowerCase() !== newEmailClean);
        for (const diffAcc of differentAccounts) {
          console.log(`[handleGoogleCallbackAction] Removing pre-existing Gmail account ${diffAcc.email_address} because user connected ${newEmailClean}`);
          
          // Delete related records manually for safety
          const { data: emails } = await supabaseAdmin
            .from("emails")
            .select("id")
            .eq("gmail_account_id", diffAcc.id);
          
          if (emails && emails.length > 0) {
            const emailIds = emails.map(e => e.id);
            await supabaseAdmin.from("email_categories").delete().in("email_id", emailIds);
            await supabaseAdmin.from("email_summaries").delete().in("email_id", emailIds);
          }

          const { data: threads } = await supabaseAdmin
            .from("email_threads")
            .select("id")
            .eq("gmail_account_id", diffAcc.id);

          if (threads && threads.length > 0) {
            const threadIds = threads.map(t => t.id);
            await supabaseAdmin.from("thread_summaries").delete().in("thread_id", threadIds);
            await supabaseAdmin.from("email_threads").delete().in("id", threadIds);
          }

          await supabaseAdmin.from("emails").delete().eq("gmail_account_id", diffAcc.id);
          await supabaseAdmin.from("gmail_accounts").delete().eq("id", diffAcc.id);
        }
      }

      // 4. Save/Upsert account credentials in gmail_accounts table
      const upsertData: {
        user_id: string;
        email_address: string;
        access_token: string;
        token_expires_at: string;
        last_synced_at: string;
        refresh_token?: string;
        gmail_history_id?: string;
      } = {
        user_id: user.id,
        email_address: gmailProfile.emailAddress.toLowerCase(),
        access_token: tokenData.access_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        last_synced_at: new Date().toISOString(),
      };

      // Only save/overwrite refresh token if it is returned by Google
      // (Google only sends the refresh_token on the first user approval prompt)
      if (tokenData.refresh_token) {
        upsertData.refresh_token = tokenData.refresh_token;
      }

      // Save the latest historyId as bigint if provided
      if (gmailProfile.historyId) {
        upsertData.gmail_history_id = gmailProfile.historyId;
      }

      const { data: savedAccount, error } = await supabaseAdmin
        .from("gmail_accounts")
        .upsert(upsertData, {
          onConflict: "user_id,email_address",
        })
        .select("id, email_address")
        .single();

      if (error || !savedAccount) {
        console.error("[OAuth Callback Upsert Error]:", error);
        throw new Error(`Failed to store Gmail account: ${error?.message || "Unknown error"}`);
      }

      // Automatically trigger background sync immediately for the new/switched account!
      runBackgroundSyncProcess(savedAccount.id).catch(err => {
        console.error(`[Callback Auto-Sync Error] for ${savedAccount.email_address}:`, err);
      });

      return {
        success: true,
        emailAddress: gmailProfile.emailAddress,
      };
    } catch (error) {
      console.error("[OAuth Callback Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Gmail integration.";
      throw new Error(message);
    }
  });

export const saveGoogleProviderTokensAction = createServerFn()
  .validator((payload: { accessToken: string; refreshToken?: string; email: string }) => {
    if (!payload.accessToken) throw new Error("accessToken is required");
    if (!payload.email) throw new Error("email is required");
    return payload;
  })
  .handler(async ({ data: { accessToken, refreshToken, email } }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      // 1. Get profile stats using accessToken
      const gmailProfile = await getGmailProfile(accessToken);
      
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 1); // Google access tokens expire in 1 hour

      // Check if we already have a refresh token for this user to avoid overwriting with undefined
      const { data: existingAccount } = await supabaseAdmin
        .from("gmail_accounts")
        .select("refresh_token")
        .eq("user_id", user.id)
        .eq("email_address", email.toLowerCase())
        .maybeSingle();

      const finalRefreshToken = refreshToken || existingAccount?.refresh_token;

      const upsertData: any = {
        user_id: user.id,
        email_address: email.toLowerCase(),
        access_token: accessToken,
        token_expires_at: tokenExpiresAt.toISOString(),
        last_synced_at: new Date().toISOString(),
      };

      if (finalRefreshToken) {
        upsertData.refresh_token = finalRefreshToken;
      }

      if (gmailProfile.historyId) {
        upsertData.gmail_history_id = gmailProfile.historyId;
      }

      const { data: savedAccount, error } = await supabaseAdmin
        .from("gmail_accounts")
        .upsert(upsertData, {
          onConflict: "user_id,email_address",
        })
        .select("id, email_address")
        .single();

      if (error || !savedAccount) {
        console.error("[saveGoogleProviderTokensAction] DB Upsert Error:", error);
        throw error || new Error("Failed to store Gmail account");
      }

      // Automatically trigger background sync immediately for the new/switched account!
      runBackgroundSyncProcess(savedAccount.id).catch(err => {
        console.error(`[saveGoogleProviderTokensAction Auto-Sync Error] for ${savedAccount.email_address}:`, err);
      });

      return { success: true };
    } catch (err) {
      console.error("[saveGoogleProviderTokensAction] Error:", err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

/**
 * Server function to trigger synchronization of all linked Gmail accounts for the authenticated user.
 */
export const syncGmailAccountAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to synchronize emails.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      // Find connected Gmail accounts
      const { data: accounts, error } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, email_address")
        .eq("user_id", user.id);

      if (error) {
        throw new Error(`Failed to retrieve linked accounts: ${error.message}`);
      }

      if (!accounts || accounts.length === 0) {
        return {
          success: true,
          totalSynced: 0,
          syncedAccounts: [],
          message: "No Gmail accounts linked yet.",
        };
      }

      const syncedAccounts: string[] = [];

      for (const account of accounts) {
        if (!activeServerSyncs.get(account.id)) {
          runBackgroundSyncProcess(account.id).catch(err => {
            console.error(`[Background Sync Error] for ${account.email_address}:`, err);
          });
        }
        syncedAccounts.push(account.email_address);
      }

      return {
        success: true,
        totalSynced: 0,
        syncedAccounts,
        message: "Background synchronization initiated."
      };
    } catch (error) {
      console.error("[Gmail Sync Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Gmail synchronization.";
      throw new Error(message);
    }
  });

export const getSyncProgressAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");
    
    try {
      // Try fetching with sync columns (may fail if migration not yet applied)
      let accounts: any[] | null = null;
      let useSyncColumns = true;
      
      const { data: accountsFull, error: fullErr } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, email_address, last_synced_at, sync_status, sync_progress_imported, sync_progress_total, sync_token")
        .eq("user_id", user.id);
        
      if (fullErr) {
        // Likely the sync columns don't exist yet — fall back to base columns
        console.warn("[getSyncProgressAction] Full select failed (columns may be missing), falling back:", fullErr.message);
        useSyncColumns = false;
        const { data: accountsBase } = await supabaseAdmin
          .from("gmail_accounts")
          .select("id, email_address, last_synced_at, sync_token")
          .eq("user_id", user.id);
        accounts = accountsBase;
      } else {
        accounts = accountsFull;
      }
        
      if (!accounts) return { accounts: [] };
      
      const formatted = accounts.map(acc => {
        let status: string = useSyncColumns ? (acc.sync_status || "idle") : "idle";
        let imported: number = useSyncColumns ? (acc.sync_progress_imported || 0) : 0;
        let total: number = useSyncColumns ? (acc.sync_progress_total || 0) : 0;
        
        // Always try sync_token JSON fallback when columns are missing or empty
        if ((!useSyncColumns || !acc.sync_status) && acc.sync_token) {
          try {
            const parsed = JSON.parse(acc.sync_token);
            if (parsed && typeof parsed === "object") {
              status = parsed.status || status;
              imported = parsed.imported || imported;
              total = parsed.total || total;
            }
          } catch (e) {
            // Not JSON — sync_token is a real token string
          }
        }
        
        return {
          id: acc.id,
          email_address: acc.email_address,
          last_synced_at: acc.last_synced_at,
          sync_status: status,
          sync_progress_imported: imported,
          sync_progress_total: total
        };
      });
      
      return { accounts: formatted };
    } catch (err) {
      console.error("[getSyncProgressAction] Error:", err);
      return { accounts: [] };
    }
  });

/**
 * Server function to retrieve the user's settings profile and linked Gmail accounts.
 * Also returns whether the connected account has the required send/compose scopes.
 */
export const getUserSettingsAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to load profile.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      const { data: profile } = await supabaseAdmin
        .from("users")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle();

      // Try fetching with sync columns — if migration not applied yet, fall back gracefully
      let gmailAccountsRaw: any[] | null = null;
      let hasSyncColumns = true;
      
      const { data: gmailAccountsFull, error: gaFullErr } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, email_address, last_synced_at, sync_status, sync_progress_imported, sync_progress_total, sync_token")
        .eq("user_id", user.id);
      
      if (gaFullErr) {
        console.warn("[getUserSettingsAction] Sync columns missing, using fallback:", gaFullErr.message);
        hasSyncColumns = false;
        const { data: gmailAccountsBase } = await supabaseAdmin
          .from("gmail_accounts")
          .select("id, email_address, last_synced_at, sync_token")
          .eq("user_id", user.id);
        gmailAccountsRaw = gmailAccountsBase;
      } else {
        gmailAccountsRaw = gmailAccountsFull;
      }

      const formattedAccounts = (gmailAccountsRaw || []).map(acc => {
        let status: string = hasSyncColumns ? (acc.sync_status || "idle") : "idle";
        let imported: number = hasSyncColumns ? (acc.sync_progress_imported || 0) : 0;
        let total: number = hasSyncColumns ? (acc.sync_progress_total || 0) : 0;
        
        // Always try sync_token JSON fallback when columns are missing or values are empty
        if ((!hasSyncColumns || !acc.sync_status) && acc.sync_token) {
          try {
            const parsed = JSON.parse(acc.sync_token);
            if (parsed && typeof parsed === "object") {
              status = parsed.status || status;
              imported = parsed.imported || imported;
              total = parsed.total || total;
            }
          } catch (e) {
            // Not JSON — sync_token is a real Gmail sync token string
          }
        }
        
        return {
          id: acc.id,
          email_address: acc.email_address,
          last_synced_at: acc.last_synced_at,
          sync_status: status,
          sync_progress_imported: imported,
          sync_progress_total: total
        };
      });

      return {
        user: {
          id: user.id,
          email: profile?.email || user.email,
          displayName: profile?.display_name || user.email.split("@")[0],
        },
        gmailAccounts: formattedAccounts,
      };
    } catch (error) {
      console.error("[Get User Settings Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during profile load.";
      throw new Error(message);
    }
  });

/**
 * Checks whether the connected Gmail account has been granted the required
 * send/compose/modify scopes. Returns a flag so the UI can prompt reconnect.
 *
 * Required scopes for full functionality:
 *   - gmail.modify  (read + label changes)
 *   - gmail.send    (send emails)
 *   - gmail.compose (create/manage drafts)
 */
export const checkGmailScopesAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable.");

    const REQUIRED_SCOPES = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.modify",
    ];

    try {
      // Get the first linked account
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!accounts || accounts.length === 0) {
        return {
          hasRequiredScopes: false,
          grantedScopes: [],
          missingScopes: REQUIRED_SCOPES,
          noAccount: true,
          hasModifyScope: false,
          hasSendScope: false,
          hasComposeScope: false,
        };
      }

      const accountId = accounts[0].id;

      // Refresh token to get current valid access token
      const accessToken = await refreshGmailAccessTokenIfNeeded(accountId);

      // Use Google tokeninfo endpoint to read currently-granted scopes
      const tokenInfoUrl = `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(tokenInfoUrl);

      if (!res.ok) {
        console.warn("[checkGmailScopesAction] tokeninfo call failed:", await res.text());
        // If we can't verify, assume scopes are insufficient and prompt reconnect
        return {
          hasRequiredScopes: false,
          grantedScopes: [],
          missingScopes: REQUIRED_SCOPES,
          noAccount: false,
          hasModifyScope: false,
          hasSendScope: false,
          hasComposeScope: false,
        };
      }

      const tokenInfo = await res.json();
      const grantedScopes: string[] = (tokenInfo.scope || "").split(" ").filter(Boolean);
      const missingScopes = REQUIRED_SCOPES.filter(s => !grantedScopes.includes(s));
      const hasRequiredScopes = missingScopes.length === 0;

      console.log(`[checkGmailScopesAction] grantedScopes=${grantedScopes.join(", ")}, missing=${missingScopes.join(", ")}`);

      return {
        hasRequiredScopes,
        grantedScopes,
        missingScopes,
        noAccount: false,
        hasModifyScope: grantedScopes.includes("https://www.googleapis.com/auth/gmail.modify"),
        hasSendScope: grantedScopes.includes("https://www.googleapis.com/auth/gmail.send"),
        hasComposeScope: grantedScopes.includes("https://www.googleapis.com/auth/gmail.compose"),
      };
    } catch (err) {
      console.error("[checkGmailScopesAction] Error:", err);
      // On error, return false so UI shows reconnect — safer than silently failing
      return {
        hasRequiredScopes: false,
        grantedScopes: [],
        missingScopes: REQUIRED_SCOPES,
        noAccount: false,
        hasModifyScope: false,
        hasSendScope: false,
        hasComposeScope: false,
      };
    }
  });


export const getEmailCountAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to query email count.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        return { count: 0 };
      }

      const accountIds = accounts.map(a => a.id);
      const { count, error } = await supabaseAdmin
        .from("emails")
        .select("id", { count: "exact", head: true })
        .in("gmail_account_id", accountIds);

      if (error) {
        throw new Error(`Failed to count emails: ${error.message}`);
      }

      return { count: count || 0 };
    } catch (error) {
      console.error("[Get Email Count Action Failure]:", error);
      throw error;
    }
  });

/**
 * Server function to retrieve the count of unread emails in the database.
 */
export const getUnreadEmailCountAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to query unread email count.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, sync_token")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        return { count: 0 };
      }

      // Try using cached inboxUnreadThreads count
      let inboxUnreadCount = 0;
      let hasCache = false;
      for (const account of accounts) {
        if (account.sync_token) {
          try {
            const parsed = JSON.parse(account.sync_token);
            if (parsed && typeof parsed === "object" && typeof parsed.inboxUnreadThreads === "number") {
              inboxUnreadCount += parsed.inboxUnreadThreads;
              hasCache = true;
            }
          } catch (e) {
            // Ignore
          }
        }
      }

      if (hasCache) {
        return { count: inboxUnreadCount };
      }

      const accountIds = accounts.map(a => a.id);
      const { count, error } = await supabaseAdmin
        .from("emails")
        .select("id", { count: "exact", head: true })
        .in("gmail_account_id", accountIds)
        .contains("labels", ["INBOX", "UNREAD"]);

      if (error) {
        throw new Error(`Failed to count unread emails: ${error.message}`);
      }

      return { count: count || 0 };
    } catch (error) {
      console.error("[Get Unread Email Count Action Failure]:", error);
      throw error;
    }
  });

/**
 * Server function to retrieve the user's synced emails from the database with cursor-based pagination.
 */
export const getInboxEmailsAction = createServerFn()
  .validator((params: { filter?: string; sort?: string; search?: string; cursor?: string; pageSize?: number } | undefined) => {
    return params || {};
  })
  .handler(async ({ data: params }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to load inbox.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      // Get all linked gmail account IDs for the user
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        return { emails: [], nextCursor: null, totalCount: 0 };
      }

      const accountIds = accounts.map(a => a.id);
      const { filter = "All", sort = "newest", search = "", cursor = null, pageSize = 50 } = params;

      let selectFields = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories(category)";
      if (filter !== "All" && filter !== "Unread") {
        selectFields = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories!inner(category)";
      }

      // Build database query
      let dbEmails: any[] = [];
      let totalCount = 0;
      let nextCursor: string | null = null;

      if (sort === "unread") {
        // Unread sorting queries unread emails first, then read emails
        const parsedOffset = cursor && cursor.startsWith("offset:") ? parseInt(cursor.split(":")[1]) || 0 : 0;

        // 1. Get total unread count matching filters
        let countSelect = "id";
        if (filter !== "All" && filter !== "Unread") {
          countSelect = "id, email_categories!inner(category)";
        }

        let unreadCountQuery = supabaseAdmin
          .from("emails")
          .select(countSelect, { count: "exact", head: true })
          .in("gmail_account_id", accountIds)
          .contains("labels", ["INBOX", "UNREAD"]);

        // 2. Get total read count matching filters
        let readCountQuery = supabaseAdmin
          .from("emails")
          .select(countSelect, { count: "exact", head: true })
          .in("gmail_account_id", accountIds)
          .contains("labels", ["INBOX"])
          .not("labels", "cs", '{"UNREAD"}');

        // Apply filters to both count queries
        if (search && search.trim()) {
          const qTrim = search.trim();
          unreadCountQuery = unreadCountQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
          readCountQuery = readCountQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
        }
        if (filter !== "All" && filter !== "Unread") {
          unreadCountQuery = unreadCountQuery.eq("email_categories.category", filter);
          readCountQuery = readCountQuery.eq("email_categories.category", filter);
        }

        const [{ count: unreadCount }, { count: readCount }] = await Promise.all([
          unreadCountQuery.then(res => ({ count: res.count })),
          readCountQuery.then(res => ({ count: res.count }))
        ]);

        totalCount = (unreadCount || 0) + (readCount || 0);
        const unreadTotal = unreadCount || 0;

        if (parsedOffset < unreadTotal) {
          // Fetch unread emails
          let unreadEmailsQuery = supabaseAdmin
            .from("emails")
            .select(selectFields)
            .in("gmail_account_id", accountIds)
            .contains("labels", ["INBOX", "UNREAD"])
            .order("received_at", { ascending: false })
            .order("id", { ascending: false })
            .range(parsedOffset, parsedOffset + pageSize - 1);

          if (search && search.trim()) {
            const qTrim = search.trim();
            unreadEmailsQuery = unreadEmailsQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
          }
          if (filter !== "All" && filter !== "Unread") {
            unreadEmailsQuery = unreadEmailsQuery.eq("email_categories.category", filter);
          }

          const { data } = await unreadEmailsQuery;
          dbEmails = data || [];

          if (dbEmails.length < pageSize) {
            // Fill rest with read emails
            const needed = pageSize - dbEmails.length;
            let fillQuery = supabaseAdmin
              .from("emails")
              .select(selectFields)
              .in("gmail_account_id", accountIds)
              .contains("labels", ["INBOX"])
              .not("labels", "cs", '{"UNREAD"}')
              .order("received_at", { ascending: false })
              .order("id", { ascending: false })
              .range(0, needed - 1);

            if (search && search.trim()) {
              const qTrim = search.trim();
              fillQuery = fillQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
            }
            if (filter !== "All" && filter !== "Unread") {
              fillQuery = fillQuery.eq("email_categories.category", filter);
            }

            const { data: fillData } = await fillQuery;
            if (fillData) {
              dbEmails = [...dbEmails, ...fillData];
            }
          }
        } else {
          // Fetch read emails
          const readOffset = parsedOffset - unreadTotal;
          let readEmailsQuery = supabaseAdmin
            .from("emails")
            .select(selectFields)
            .in("gmail_account_id", accountIds)
            .contains("labels", ["INBOX"])
            .not("labels", "cs", '{"UNREAD"}')
            .order("received_at", { ascending: false })
            .order("id", { ascending: false })
            .range(readOffset, readOffset + pageSize - 1);

          if (search && search.trim()) {
            const qTrim = search.trim();
            readEmailsQuery = readEmailsQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
          }
          if (filter !== "All" && filter !== "Unread") {
            readEmailsQuery = readEmailsQuery.eq("email_categories.category", filter);
          }

          const { data } = await readEmailsQuery;
          dbEmails = data || [];
        }

        if (parsedOffset + pageSize < totalCount) {
          nextCursor = `offset:${parsedOffset + pageSize}`;
        }
      } else {
        // Date sorting (newest/oldest) using true keyset pagination (cursor Date + ID)
        let query = supabaseAdmin
          .from("emails")
          .select(selectFields, { count: "exact" })
          .in("gmail_account_id", accountIds)
          .contains("labels", ["INBOX"]);

        // Apply filters
        if (search && search.trim()) {
          const qTrim = search.trim();
          query = query.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
        }
        if (filter === "Unread") {
          query = query.contains("labels", ["UNREAD"]);
        } else if (filter !== "All") {
          query = query.eq("email_categories.category", filter);
        }

        // Apply ordering
        const ascending = sort === "oldest";
        query = query.order("received_at", { ascending }).order("id", { ascending });

        // Apply cursor keyset filter
        if (cursor && !cursor.startsWith("offset:")) {
          const [cursorDate, cursorId] = cursor.split(",");
          if (cursorDate && cursorId) {
            if (ascending) {
              query = query.or(`received_at.gt.${cursorDate},and(received_at.eq.${cursorDate},id.gt.${cursorId})`);
            } else {
              query = query.or(`received_at.lt.${cursorDate},and(received_at.eq.${cursorDate},id.lt.${cursorId})`);
            }
          }
        }

        query = query.limit(pageSize);

        const { data, count, error } = await query;
        if (error) {
          throw new Error(`Failed to query emails: ${error.message}`);
        }

        dbEmails = data || [];
        totalCount = count || 0;

        if (dbEmails.length === pageSize) {
          const lastEmail = dbEmails[dbEmails.length - 1];
          nextCursor = `${lastEmail.received_at},${lastEmail.id}`;
        }
      }

      // Map emails to frontend expected shape
      const palette = [
        "oklch(0.34 0.055 255)",
        "oklch(0.42 0.062 155)",
        "oklch(0.55 0.13 45)",
        "oklch(0.72 0.12 78)",
        "oklch(0.48 0.014 250)",
        "oklch(0.55 0.06 255)",
      ];

      const getAvatarColor = (sender: string) => {
        let hash = 0;
        for (let i = 0; i < sender.length; i++) {
          hash = sender.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
      };

      const parseSenderName = (fromAddress: string): string => {
        const parts = fromAddress.split("@");
        const namePart = parts[0];
        return namePart
          .split(/[\.+\-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      };

      const getImportanceFromLabels = (labels: string[]): "high" | "normal" | "low" => {
        const upperLabels = labels.map(l => l.toUpperCase());
        if (upperLabels.includes("IMPORTANT")) return "high";
        return "normal";
      };

      const mappedEmails = dbEmails.map(email => {
        const senderName = parseSenderName(email.from_address);
        const senderInitials = senderName
          .split(/\s+/)
          .map(w => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "??";

        const labelsList = (email.labels || []) as string[];
        const unread = labelsList.map((l: string) => l.toUpperCase()).includes("UNREAD");
        const starred = labelsList.map((l: string) => l.toUpperCase()).includes("STARRED");
        
        // Extract category from joined email_categories or fall back to classification
        const categoryVal = email.email_categories?.category || classifyEmailCategory(email.labels, email.subject || "", email.from_address, email.body_text || "");

        return {
          id: email.id,
          threadId: email.thread_id,
          senderName,
          senderEmail: email.from_address,
          senderInitials,
          avatarColor: getAvatarColor(email.from_address),
          subject: email.subject || "(No Subject)",
          preview: email.body_text ? email.body_text.slice(0, 120) : "",
          body: email.body_text || "",
          date: email.received_at,
          unread,
          starred,
          category: categoryVal,
          importance: getImportanceFromLabels(email.labels),
          labels: email.labels,
          hasAttachments: false,
        };
      });

      // Get unread count matching current filter
      let countSelect = "id";
      if (filter !== "All" && filter !== "Unread") {
        countSelect = "id, email_categories!inner(category)";
      }

      let unreadCountQuery = supabaseAdmin
        .from("emails")
        .select(countSelect, { count: "exact", head: true })
        .in("gmail_account_id", accountIds)
        .contains("labels", ["INBOX", "UNREAD"]);

      if (search && search.trim()) {
        const qTrim = search.trim();
        unreadCountQuery = unreadCountQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
      }
      if (filter !== "All" && filter !== "Unread") {
        unreadCountQuery = unreadCountQuery.eq("email_categories.category", filter);
      }
      const { count: uCount } = await unreadCountQuery;
      const unreadCount = uCount || 0;

      return { 
        emails: mappedEmails,
        nextCursor,
        totalCount,
        unreadCount
      };
    } catch (error) {
      console.error("[Get Inbox Emails Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while loading emails.";
      throw new Error(message);
    }
  });


/**
 * Server function to retrieve conversation threads.
 */
export const getThreadsAction = createServerFn()
  .validator((input: { limit?: number; offset?: number } | undefined) => {
    return input || {};
  })
  .handler(async ({ data }) => {
    const limit = typeof data?.limit === "number" ? data.limit : 50;
    const offset = typeof data?.offset === "number" ? data.offset : 0;

    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to load threads.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      // Step 1: Get the user's linked Gmail account IDs
      const { data: accounts, error: accountError } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (accountError) {
        throw new Error(`Failed to retrieve Gmail accounts: ${accountError.message}`);
      }

      if (!accounts || accounts.length === 0) {
        console.log("[getThreadsAction] No Gmail accounts linked for user:", user.id);
        return { threads: [], totalCount: 0, hasMore: false };
      }

      const accountIds = accounts.map(a => a.id);
      console.log("[getThreadsAction] Querying threads for account IDs:", accountIds);

      // Step 2: Fetch threads for those accounts using range pagination
      const { data: dbThreads, error: threadError, count: threadCount } = await supabaseAdmin
        .from("email_threads")
        .select("id, last_message_at, gmail_thread_id, gmail_account_id", { count: "exact" })
        .in("gmail_account_id", accountIds)
        .order("last_message_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (threadError) {
        throw new Error(`Failed to query threads: ${threadError.message}`);
      }

      console.log(`[getThreadsAction] Total threads in DB for user: ${threadCount ?? 0}, returned: ${dbThreads?.length ?? 0}`);

      if (!dbThreads || dbThreads.length === 0) {
        return { threads: [], totalCount: threadCount ?? 0, hasMore: false };
      }

      const threadIds = dbThreads.map(t => t.id);

      // Step 3: Fetch all emails for those threads in one query
      const { data: allEmails, error: emailError } = await supabaseAdmin
        .from("emails")
        .select("id, thread_id, from_address, subject, body_text, labels, received_at")
        .in("thread_id", threadIds)
        .order("received_at", { ascending: true });

      if (emailError) {
        console.error("[getThreadsAction] Failed to fetch emails:", emailError.message);
      }

      // Step 4: Fetch thread summaries
      const { data: allSummaries } = await supabaseAdmin
        .from("thread_summaries")
        .select("thread_id, summary")
        .in("thread_id", threadIds);

      // Build lookup maps
      const emailsByThread = new Map<string, any[]>();
      for (const email of allEmails || []) {
        const list = emailsByThread.get(email.thread_id) || [];
        list.push(email);
        emailsByThread.set(email.thread_id, list);
      }

      const summaryByThread = new Map<string, string>();
      for (const s of allSummaries || []) {
        if (s.summary) summaryByThread.set(s.thread_id, s.summary);
      }

      console.log(`[getThreadsAction] Emails fetched: ${allEmails?.length ?? 0} across ${threadIds.length} threads`);

      const palette = [
        "oklch(0.34 0.055 255)",
        "oklch(0.42 0.062 155)",
        "oklch(0.55 0.13 45)",
        "oklch(0.72 0.12 78)",
        "oklch(0.48 0.014 250)",
        "oklch(0.55 0.06 255)",
      ];

      const getAvatarColor = (sender: string) => {
        let hash = 0;
        for (let i = 0; i < sender.length; i++) {
          hash = sender.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
      };

      const parseSenderName = (fromAddress: string): string => {
        if (!fromAddress) return "Unknown";
        const match = fromAddress.match(/^([^<]+)<[^>]+>$/);
        if (match) return match[1].trim();
        const parts = fromAddress.split("@");
        const namePart = parts[0];
        return namePart
          .split(/[\.+\-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      };

      const mappedThreads = dbThreads.map(t => {
        const threadEmails = emailsByThread.get(t.id) || [];

        // Already sorted asc by received_at from DB query
        const firstEmail = threadEmails[0];
        const lastEmail = threadEmails[threadEmails.length - 1];

        // Participants
        const participantsSet = new Set<string>();
        threadEmails.forEach(e => {
          if (e.from_address) participantsSet.add(parseSenderName(e.from_address));
        });
        const participants = Array.from(participantsSet);

        const messages = threadEmails.map(email => {
          const senderName = parseSenderName(email.from_address);
          const senderInitials = senderName
            .split(/\s+/)
            .map(w => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "??";

          return {
            id: email.id,
            senderInitials,
            avatarColor: getAvatarColor(email.from_address || ""),
            senderName,
          };
        });

        const category = firstEmail ? classifyEmailCategory(
          firstEmail.labels || [],
          firstEmail.subject || "",
          firstEmail.from_address || "",
          firstEmail.body_text || ""
        ) : "Work";

        const isUnread = threadEmails.some(email => {
          const labelsList = (email.labels || []) as string[];
          return labelsList.map(l => l.toUpperCase()).includes("UNREAD");
        });

        const aiSummary = summaryByThread.get(t.id);
        const summary = aiSummary || (lastEmail?.body_text
          ? lastEmail.body_text.slice(0, 150)
          : firstEmail?.subject || "No messages in this thread yet.");

        const latestSender = lastEmail ? parseSenderName(lastEmail.from_address) : "Unknown";

        return {
          id: t.id,
          subject: firstEmail?.subject || "No Subject",
          participants,
          participantCount: participants.length,
          messages,
          category,
          summary,
          unread: isUnread,
          latestSender,
          lastActivity: t.last_message_at || lastEmail?.received_at || new Date().toISOString(),
        };
      });

      return {
        threads: mappedThreads,
        totalCount: threadCount ?? 0,
        hasMore: (offset + mappedThreads.length) < (threadCount ?? 0)
      };
    } catch (error) {
      console.error("[Get Threads Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while loading threads.";
      throw new Error(message);
    }
  });


/**
 * Server function to retrieve thread details by database thread ID.
 */
export const getThreadDetailAction = createServerFn()
  .validator((threadId: string) => {
    if (typeof threadId !== "string" || !threadId) {
      throw new Error("threadId is required");
    }
    return threadId;
  })
  .handler(async ({ data: threadId }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to load thread details.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      // Fetch user's Gmail accounts to identify sent messages
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("email_address")
        .eq("user_id", user.id);
      const userEmails = (accounts || []).map(a => a.email_address.toLowerCase());

      // 1. Fetch the thread
      const { data: dbThread, error: threadError } = await supabaseAdmin
        .from("email_threads")
        .select("id, last_message_at, gmail_thread_id, gmail_account_id")
        .eq("id", threadId)
        .single();

      if (threadError || !dbThread) {
        throw new Error(`Thread not found: ${threadError?.message || "Not found"}`);
      }

      // Sync the thread from Gmail to ensure we have all messages (including sent, archived, etc.)
      try {
        await syncGmailThread(dbThread.gmail_account_id, dbThread.gmail_thread_id);
      } catch (syncErr) {
        console.warn("[getThreadDetailAction] On-demand thread sync failed, using local fallback:", syncErr);
      }

      // 2. Fetch the emails for this thread
      const { data: dbEmails, error: emailError } = await supabaseAdmin
        .from("emails")
        .select("id, thread_id, gmail_message_id, from_address, subject, body_text, labels, received_at, to_addresses, in_reply_to, references_header, email_categories(category)")
        .eq("thread_id", threadId)
        .order("received_at", { ascending: true });

      if (emailError) {
        throw new Error(`Failed to query thread emails: ${emailError.message}`);
      }

      // Fetch thread summary if it exists in DB
      const { data: dbSummary } = await supabaseAdmin
        .from("thread_summaries")
        .select("summary, key_decisions, action_items")
        .eq("thread_id", threadId)
        .maybeSingle();

      const palette = [
        "oklch(0.34 0.055 255)",
        "oklch(0.42 0.062 155)",
        "oklch(0.55 0.13 45)",
        "oklch(0.72 0.12 78)",
        "oklch(0.48 0.014 250)",
        "oklch(0.55 0.06 255)",
      ];

      const getAvatarColor = (sender: string) => {
        let hash = 0;
        for (let i = 0; i < sender.length; i++) {
          hash = sender.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
      };

      const parseSenderName = (fromAddress: string): string => {
        const parts = fromAddress.split("@");
        const namePart = parts[0];
        return namePart
          .split(/[\.+\-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      };

      const firstEmail = dbEmails?.[0];
      const category = extractCategory(firstEmail?.email_categories) || classifyEmailCategory(
        firstEmail?.labels || [],
        firstEmail?.subject || "",
        firstEmail?.from_address || "",
        firstEmail?.body_text || ""
      );

      const participantsSet = new Set<string>();
      dbEmails?.forEach(e => {
        participantsSet.add(parseSenderName(e.from_address));
      });
      const participants = Array.from(participantsSet);

      const messages = (dbEmails || []).map(email => {
        const senderName = parseSenderName(email.from_address);
        const senderInitials = senderName
          .split(/\s+/)
          .map(w => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "??";

        return {
          id: email.id,
          threadId: email.thread_id,
          gmailMessageId: email.gmail_message_id,
          senderName,
          senderEmail: email.from_address,
          senderInitials,
          avatarColor: getAvatarColor(email.from_address),
          subject: email.subject || "(No Subject)",
          body: email.body_text || "",
          date: email.received_at,
          unread: email.labels.map((l: string) => l.toUpperCase()).includes("UNREAD"),
          starred: email.labels.map((l: string) => l.toUpperCase()).includes("STARRED"),
          category: extractCategory(email.email_categories) || classifyEmailCategory(
            email.labels || [],
            email.subject || "",
            email.from_address || "",
            email.body_text || ""
          ),
          labels: email.labels,
          hasAttachments: false,
          toAddresses: email.to_addresses || [],
          inReplyTo: email.in_reply_to,
          referencesHeader: email.references_header || [],
        };
      });

      const summary = dbSummary?.summary || `This thread contains a total of ${dbEmails?.length || 0} messages starting from ${parseSenderName(firstEmail?.from_address || "")}. The conversation primarily covers: "${firstEmail?.subject || "(No Subject)"}".`;

      const insights = dbSummary?.key_decisions && dbSummary.action_items && (dbSummary.key_decisions.length > 0 || dbSummary.action_items.length > 0)
        ? [
            ...dbSummary.key_decisions.map((d: string) => `Decision: ${d}`),
            ...dbSummary.action_items.map((a: string) => `Action Item: ${a}`)
          ]
        : [
            `Thread consists of ${dbEmails?.length || 0} emails`,
            `Involves ${participants.length} unique participants: ${participants.join(", ")}`,
            `Last activity registered at ${dbThread.last_message_at ? new Date(dbThread.last_message_at).toLocaleString() : "unknown"}`
          ];

      return {
        id: dbThread.id,
        gmailThreadId: dbThread.gmail_thread_id,
        subject: firstEmail?.subject || "(No Subject)",
        participants,
        messages,
        category,
        summary,
        insights,
        lastActivity: dbThread.last_message_at || firstEmail?.received_at || new Date().toISOString(),
        userEmails,
      };
    } catch (error) {
      console.error("[Get Thread Detail Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while loading thread details.";
      throw new Error(message);
    }
  });

/**
 * Shared helper to load all emails, group by thread, select the latest email per thread,
 * and aggregate category counts and distribution at the thread level.
 * 
 * If includeBody is false, body_text is not selected to minimize download overhead.
 */
async function getThreadLevelCategories(accountIds: string[], includeBody = true) {
  let allEmails: any[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;

  const selectFields = includeBody
    ? "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories(category)"
    : "id, thread_id, from_address, subject, labels, received_at, email_categories(category)";

  while (true) {
    const { data, error } = await supabaseAdmin!
      .from("emails")
      .select(selectFields)
      .in("gmail_account_id", accountIds)
      .order("received_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to query emails for categories: ${error.message}`);
    if (!data || data.length === 0) break;
    allEmails.push(...data);
    page++;
    if (data.length < PAGE_SIZE) break;
  }

  // Group emails by thread_id to find the latest email for each thread
  const threadMap = new Map<string, any>();
  for (const email of allEmails) {
    const existing = threadMap.get(email.thread_id);
    if (!existing || new Date(email.received_at).getTime() > new Date(existing.received_at).getTime()) {
      threadMap.set(email.thread_id, email);
    }
  }

  const catDescriptions: Record<string, string> = {
    Work: "Professional emails, project updates, and team communications.",
    Newsletter: "Curated content, publications, and marketing emails.",
    Notification: "Platform alerts, reminders, and automated updates.",
    Finance: "Invoices, bank notifications, and financial reports.",
    Personal: "Messages from friends, family, and personal contacts.",
    Job: "Recruiter messages, job applications, and career updates.",
  };

  const catCounts: Record<string, number> = {
    Work: 0,
    Newsletter: 0,
    Notification: 0,
    Finance: 0,
    Personal: 0,
    Job: 0
  };

  const parseSenderName = (addr: string) => {
    if (!addr) return "Unknown";
    return addr.split("@")[0].split(/[.\-_+]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const getAvatarColor = (addr: string) => {
    if (!addr) return "oklch(0.34 0.055 255)";
    const palette = ["oklch(0.34 0.055 255)", "oklch(0.42 0.062 155)", "oklch(0.55 0.13 45)", "oklch(0.72 0.12 78)", "oklch(0.48 0.014 250)", "oklch(0.55 0.06 255)"];
    let hash = 0;
    for (let i = 0; i < addr.length; i++) hash = addr.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  };

  // Map the representative email for each thread
  const mappedEmails = Array.from(threadMap.values()).map((e) => {
    const labels = (e.labels || []) as string[];
    const category = extractCategory(e.email_categories) || classifyEmailCategory(
      labels,
      e.subject || "",
      e.from_address || "",
      e.body_text || ""
    );
    
    catCounts[category] = (catCounts[category] ?? 0) + 1;
    
    const senderName = parseSenderName(e.from_address);
    const senderInitials = senderName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??";
    
    return {
      id: e.id,
      threadId: e.thread_id,
      senderName,
      senderEmail: e.from_address,
      senderInitials,
      avatarColor: getAvatarColor(e.from_address),
      subject: e.subject || "(No Subject)",
      preview: e.body_text ? e.body_text.slice(0, 120) : "",
      body: e.body_text || "",
      date: e.received_at,
      unread: labels.map((l) => l.toUpperCase()).includes("UNREAD"),
      starred: labels.map((l) => l.toUpperCase()).includes("STARRED"),
      category,
      importance: labels.map((l) => l.toUpperCase()).includes("IMPORTANT") ? "high" : "normal",
      labels,
      hasAttachments: false,
    };
  });

  const categories = Object.entries(catCounts).map(([name, count]) => ({
    name,
    count,
    description: catDescriptions[name] || "",
  }));

  const categoryDistribution = categories.map(({ name, count }) => ({ name, value: count }));
  const categorizedCount = mappedEmails.length;

  return {
    categories,
    categoryDistribution,
    emails: mappedEmails,
    categorizedCount
  };
}

/**
 * Server function to retrieve dashboard metrics and email statistics.
 */
export const getDashboardDataAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to load dashboard data.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      // 1. Get linked account IDs and cached stats
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, last_synced_at, sync_token")
        .eq("user_id", user.id);
      
      let totalThreadsCached = undefined;
      let unreadThreadsCached = undefined;
      let inboxUnreadThreadsCached = undefined;
      let inboxThreadsCached = undefined;

      if (accounts && accounts.length > 0) {
        for (const account of accounts) {
          if (account.sync_token) {
            try {
              const parsed = JSON.parse(account.sync_token);
              if (parsed && typeof parsed === "object") {
                if (typeof parsed.totalThreads === "number") totalThreadsCached = (totalThreadsCached || 0) + parsed.totalThreads;
                if (typeof parsed.unreadThreads === "number") unreadThreadsCached = (unreadThreadsCached || 0) + parsed.unreadThreads;
                if (typeof parsed.inboxUnreadThreads === "number") inboxUnreadThreadsCached = (inboxUnreadThreadsCached || 0) + parsed.inboxUnreadThreads;
                if (typeof parsed.inboxThreads === "number") inboxThreadsCached = (inboxThreadsCached || 0) + parsed.inboxThreads;
              }
            } catch (e) {
              // Ignore
            }
          }
        }
      }

      if (!accounts || accounts.length === 0) {
        return {
          stats: { total: 0, unread: 0, categorized: 0, threads: 0, summaries: 0, newsletters: 0 },
          weeklyVolume: [],
          categoryDistribution: [],
          priorityEmails: [],
          recentEmails: [],
        };
      }

      const accountIds = accounts.map(a => a.id);

      // 2. Query counts in parallel (excluding category counts as they are calculated at thread level)
      const [
        { count: totalCount },
        { count: unreadCount },
        { count: threadCount },
        { count: newsletterLabelCount },
        { count: emailSummariesCount },
      ] = await Promise.all([
        supabaseAdmin.from("emails").select("id", { count: "exact", head: true }).in("gmail_account_id", accountIds),
        supabaseAdmin.from("emails").select("id", { count: "exact", head: true }).in("gmail_account_id", accountIds).contains("labels", ["UNREAD"]),
        supabaseAdmin.from("email_threads").select("id", { count: "exact", head: true }).in("gmail_account_id", accountIds),
        supabaseAdmin.from("emails").select("id", { count: "exact", head: true }).in("gmail_account_id", accountIds).contains("labels", ["CATEGORY_PROMOTIONS"]),
        supabaseAdmin.from("email_summaries").select("email_id, emails!inner(gmail_account_id)", { count: "exact", head: true }).in("emails.gmail_account_id", accountIds),
      ]);

      // 3. Get thread-level categories and distribution (without body_text for speed)
      const catData = await getThreadLevelCategories(accountIds, false);
      const emailCategoriesCount = catData.categorizedCount;
      const categoryDistribution = catData.categoryDistribution;

      const newsletterCategoryCount = catData.categories.find(c => c.name === "Newsletter")?.count || 0;
      const newsletterCount = Math.max(newsletterLabelCount || 0, newsletterCategoryCount);

      const finalTotal = totalThreadsCached ?? threadCount ?? 0;
      const finalUnread = unreadThreadsCached ?? unreadCount ?? 0;
      const finalThreads = inboxThreadsCached ?? threadCount ?? 0;

      // Validation assertions
      const sumCategoryCounts = catData.categories.reduce((sum, c) => sum + c.count, 0);
      console.log(`[Validation Check] categorizedCount (${emailCategoriesCount}) <= totalThreads (${finalTotal})`);
      if (emailCategoriesCount > finalTotal) {
        console.error(`[Validation Failed] categorizedCount (${emailCategoriesCount}) exceeds totalThreads (${finalTotal})`);
      }
      
      console.log(`[Validation Check] SUM(category_counts) (${sumCategoryCounts}) = categorizedCount (${emailCategoriesCount})`);
      if (sumCategoryCounts !== emailCategoriesCount) {
        console.error(`[Validation Failed] SUM(category_counts) (${sumCategoryCounts}) does not equal categorizedCount (${emailCategoriesCount})`);
      }

      console.log(`[Dashboard Stats] total=${finalTotal} unread=${finalUnread} threads=${finalThreads} categorized=${emailCategoriesCount} summaries=${emailSummariesCount} newsletters=${newsletterCount}`);

      const summariesCount = emailSummariesCount || 0;
      const totalCategorized = emailCategoriesCount || 0;

      // 4. Query recent emails for weekly volume (past 7 days)
      const startOfPeriod = new Date();
      startOfPeriod.setDate(startOfPeriod.getDate() - 7);

      const { data: recentPeriodEmails } = await supabaseAdmin
        .from("emails")
        .select("received_at")
        .in("gmail_account_id", accountIds)
        .gte("received_at", startOfPeriod.toISOString());

      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const volumeMap = new Map<string, number>();
      days.forEach(d => volumeMap.set(d, 0));

      (recentPeriodEmails || []).forEach(e => {
        const dayName = days[new Date(e.received_at).getDay()];
        volumeMap.set(dayName, (volumeMap.get(dayName) || 0) + 1);
      });

      const weeklyVolume: { day: string; received: number; sent: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = days[d.getDay()];
        weeklyVolume.push({
          day: dayName,
          received: volumeMap.get(dayName) || 0,
          sent: 0,
        });
      }

      // 5. Fetch Priority and Recent Emails
      const [
        { data: dbPriority },
        { data: dbRecent }
      ] = await Promise.all([
        supabaseAdmin
          .from("emails")
          .select("id, thread_id, from_address, subject, body_text, labels, received_at")
          .in("gmail_account_id", accountIds)
          .contains("labels", ["IMPORTANT"])
          .order("received_at", { ascending: false })
          .limit(4),
        supabaseAdmin
          .from("emails")
          .select("id, thread_id, from_address, subject, body_text, labels, received_at")
          .in("gmail_account_id", accountIds)
          .order("received_at", { ascending: false })
          .limit(5)
      ]);

      const palette = [
        "oklch(0.34 0.055 255)",
        "oklch(0.42 0.062 155)",
        "oklch(0.55 0.13 45)",
        "oklch(0.72 0.12 78)",
        "oklch(0.48 0.014 250)",
        "oklch(0.55 0.06 255)",
      ];

      const getAvatarColor = (sender: string) => {
        let hash = 0;
        for (let i = 0; i < sender.length; i++) {
          hash = sender.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
      };

      const parseSenderName = (fromAddress: string): string => {
        const parts = fromAddress.split("@");
        const namePart = parts[0];
        return namePart
          .split(/[\.+\-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      };

      const getImportanceFromLabels = (labels: string[]): "high" | "normal" | "low" => {
        const upperLabels = labels.map((l: string) => l.toUpperCase());
        if (upperLabels.includes("IMPORTANT")) return "high";
        return "normal";
      };

      const mapEmail = (email: any) => {
        const senderName = parseSenderName(email.from_address);
        const senderInitials = senderName
          .split(/\s+/)
          .map(w => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "??";

        const unread = email.labels.map((l: string) => l.toUpperCase()).includes("UNREAD");
        const starred = email.labels.map((l: string) => l.toUpperCase()).includes("STARRED");

        return {
          id: email.id,
          threadId: email.thread_id,
          senderName,
          senderEmail: email.from_address,
          senderInitials,
          avatarColor: getAvatarColor(email.from_address),
          subject: email.subject || "(No Subject)",
          preview: email.body_text ? email.body_text.slice(0, 120) : "",
          body: email.body_text || "",
          date: email.received_at,
          unread,
          starred,
          category: classifyEmailCategory(
            email.labels || [],
            email.subject || "",
            email.from_address || "",
            email.body_text || ""
          ),
          importance: getImportanceFromLabels(email.labels),
          labels: email.labels,
          hasAttachments: false,
        };
      };

      const latestSync = (accounts || []).reduce((max, acc) => {
        const t = acc.last_synced_at ? new Date(acc.last_synced_at).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      const latestEmailDate = dbRecent?.[0]?.received_at || "";
      const cacheKey = `brief_${user.id}_${totalCount || 0}_${latestEmailDate}_${latestSync}`;

      return {
        stats: {
          total: finalTotal || 0,
          unread: finalUnread || 0,
          categorized: totalCategorized || 0,
          threads: finalThreads || 0,
          summaries: summariesCount || 0,
          newsletters: newsletterCount || 0,
        },
        weeklyVolume,
        categoryDistribution,
        priorityEmails: (dbPriority || []).map(mapEmail),
        recentEmails: (dbRecent || []).map(mapEmail),
        cacheKey,
      };
    } catch (error) {
      console.error("[Get Dashboard Data Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while loading dashboard metrics.";
      throw new Error(message);
    }
  });

/**
 * Server function to retrieve conversation and email summaries from the database.
 */
export const getSummariesAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to load summaries.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable. Check SUPABASE_SERVICE_ROLE_KEY environment variable.");
    }

    try {
      // Get user's account IDs for manual ownership scoping (admin client bypasses RLS)
      const { data: accounts, error: accountError } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (accountError) throw new Error(`Failed to get accounts: ${accountError.message}`);
      const accountIds = (accounts || []).map(a => a.id);
      console.log(`[getSummariesAction] user=${user.id}, accounts=${accountIds.length}`);

      if (accountIds.length === 0) {
        return {
          threadSummaries: [],
          emailSummaries: [],
          totalThreadSummaries: 0,
          totalEmailSummaries: 0,
          remainingEmails: 0,
          remainingThreads: 0
        };
      }

      // 1. Query thread summaries scoped to user's accounts via inner join
      const { data: dbThreadSummaries, error: tse } = await supabaseAdmin
        .from("thread_summaries")
        .select("thread_id, summary, email_threads!inner(gmail_account_id)")
        .in("email_threads.gmail_account_id", accountIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (tse) console.error("[getSummariesAction] thread_summaries error:", tse.message);

      // 2. Query email summaries scoped to user's accounts via inner join
      const { data: dbEmailSummaries, error: ese } = await supabaseAdmin
        .from("email_summaries")
        .select("email_id, summary, emails!inner(gmail_account_id)")
        .in("emails.gmail_account_id", accountIds)
        .order("created_at", { ascending: false })
        .limit(200);

      if (ese) console.error("[getSummariesAction] email_summaries error:", ese.message);

      // 3. Query all counts in parallel to compute totals and remaining counts
      const [
        { count: totalEmails },
        { count: totalEmailSummaries },
        { count: totalThreads },
        { count: totalThreadSummaries }
      ] = await Promise.all([
        supabaseAdmin
          .from("emails")
          .select("id", { count: "exact", head: true })
          .in("gmail_account_id", accountIds)
          .not("body_text", "is", null),
        supabaseAdmin
          .from("email_summaries")
          .select("email_id, emails!inner(gmail_account_id)", { count: "exact", head: true })
          .in("emails.gmail_account_id", accountIds),
        supabaseAdmin
          .from("email_threads")
          .select("id", { count: "exact", head: true })
          .in("gmail_account_id", accountIds),
        supabaseAdmin
          .from("thread_summaries")
          .select("thread_id, email_threads!inner(gmail_account_id)", { count: "exact", head: true })
          .in("email_threads.gmail_account_id", accountIds)
      ]);

      const remainingEmails = Math.max(0, (totalEmails ?? 0) - (totalEmailSummaries ?? 0));
      const remainingThreads = Math.max(0, (totalThreads ?? 0) - (totalThreadSummaries ?? 0));

      console.log(`[getSummariesAction] thread summaries=${dbThreadSummaries?.length ?? 0} (total=${totalThreadSummaries}), email summaries=${dbEmailSummaries?.length ?? 0} (total=${totalEmailSummaries})`);

      // Fetch thread details for thread summaries
      const summaryThreadIds = (dbThreadSummaries || []).map(s => s.thread_id);
      const { data: threadDetails } = summaryThreadIds.length > 0
        ? await supabaseAdmin
            .from("email_threads")
            .select("id, last_message_at")
            .in("id", summaryThreadIds)
        : { data: [] };

      // Fetch first email per thread for metadata
      const { data: threadEmails } = summaryThreadIds.length > 0
        ? await supabaseAdmin
            .from("emails")
            .select("id, thread_id, from_address, subject, body_text, labels, received_at")
            .in("thread_id", summaryThreadIds)
            .order("received_at", { ascending: true })
        : { data: [] };

      // Build thread email map
      const emailsByThread = new Map<string, any[]>();
      for (const e of threadEmails || []) {
        const list = emailsByThread.get(e.thread_id) || [];
        list.push(e);
        emailsByThread.set(e.thread_id, list);
      }
      const threadDetailMap = new Map((threadDetails || []).map(t => [t.id, t]));

      const parseSenderName = (fromAddress: string): string => {
        if (!fromAddress) return "Unknown";
        const match = fromAddress.match(/^([^<]+)<[^>]+>$/);
        if (match) return match[1].trim();
        const parts = fromAddress.split("@");
        return parts[0]
          .split(/[.+\-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      };

      // Map Thread Summaries
      const threadSummaries = (dbThreadSummaries || [])
        .map(ts => {
          const threadEmailList = emailsByThread.get(ts.thread_id) || [];
          const firstEmail = threadEmailList[0];
          const lastEmail = threadEmailList[threadEmailList.length - 1];
          const detail = threadDetailMap.get(ts.thread_id);
          const participants = [...new Set(threadEmailList.map(e => parseSenderName(e.from_address)))];

          return {
            id: ts.thread_id,
            title: firstEmail?.subject || "(No Subject)",
            summary: ts.summary,
            date: detail?.last_message_at || lastEmail?.received_at || new Date().toISOString(),
            category: classifyEmailCategory(
              firstEmail?.labels || [],
              firstEmail?.subject || "",
              firstEmail?.from_address || "",
              firstEmail?.body_text || ""
            ),
            source: `${threadEmailList.length} message${threadEmailList.length !== 1 ? "s" : ""} · ${participants.length} people`,
            threadId: ts.thread_id,
            unread: threadEmailList.some(e => e.labels?.includes("UNREAD")),
          };
        });

      threadSummaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Fetch email details for email summaries
      const summaryEmailIds = (dbEmailSummaries || []).map(s => s.email_id);
      const { data: emailDetails } = summaryEmailIds.length > 0
        ? await supabaseAdmin
            .from("emails")
            .select("id, thread_id, from_address, subject, body_text, labels, received_at")
            .in("id", summaryEmailIds)
        : { data: [] };

      const emailDetailMap = new Map((emailDetails || []).map(e => [e.id, e]));

      // Map Email Summaries
      const emailSummaries = (dbEmailSummaries || [])
        .map(es => {
          const email = emailDetailMap.get(es.email_id);
          if (!email) return null;
          return {
            id: email.id,
            title: email.subject || "(No Subject)",
            summary: es.summary,
            date: email.received_at,
            category: classifyEmailCategory(
              email.labels || [],
              email.subject || "",
              email.from_address || "",
              email.body_text || ""
            ),
            source: parseSenderName(email.from_address),
            threadId: email.thread_id,
            unread: email.labels?.includes("UNREAD") ?? false,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      emailSummaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
        threadSummaries,
        emailSummaries,
        totalThreadSummaries: totalThreadSummaries ?? 0,
        totalEmailSummaries: totalEmailSummaries ?? 0,
        remainingEmails,
        remainingThreads
      };
    } catch (error) {
      console.error("[Get Summaries Action Failure]:", error);
      throw new Error(error instanceof Error ? error.message : "An unexpected error occurred while loading summaries.");
    }
  });

export const backfillSummariesAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in.");
    }

    if (!supabaseAdmin) {
      const envCheck = (() => {
        try { const { getEnv } = require('../env'); const e = getEnv(); return `URL=${!!e.SUPABASE_URL}, KEY=${!!e.SUPABASE_SERVICE_ROLE_KEY}`; } catch { return 'env unavailable'; }
      })();
      throw new Error(`Database connection unavailable. Env: ${envCheck}`);
    }

    try {
      const { aiQuotaExceeded, nextRetryAt } = getQuotaStatus();
      if (aiQuotaExceeded) {
        throw new Error(`AI temporarily unavailable due to quota limits. Cooldown active until ${new Date(nextRetryAt!).toLocaleTimeString()}.`);
      }

      // Step 1: Get user's account IDs
      const { data: accounts, error: accountError } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (accountError) throw new Error(`Failed to get accounts: ${accountError.message}`);
      const accountIds = (accounts || []).map(a => a.id);
      console.log(`[backfillSummariesAction] user=${user.id}, accounts=${accountIds.length}`);

      if (accountIds.length === 0) {
        return { success: true, emailsGenerated: 0, threadsGenerated: 0, remainingEmails: 0, remainingThreads: 0 };
      }

      // Step 2: Find emails without summaries (user-scoped)
      const { data: existingSummaryIds } = await supabaseAdmin
        .from("email_summaries")
        .select("email_id");
      const summarizedEmailIds = new Set((existingSummaryIds || []).map(s => s.email_id));

      const { data: emails, error: emailsError } = await supabaseAdmin
        .from("emails")
        .select("id, thread_id, subject, body_text")
        .in("gmail_account_id", accountIds)
        .not("body_text", "is", null)
        .order("received_at", { ascending: false })
        .limit(500);

      if (emailsError) console.error("[backfillSummariesAction] emails fetch error:", emailsError.message);

      const emailsToSummarize = (emails || []).filter(
        e => !summarizedEmailIds.has(e.id) && e.body_text?.trim()
      );

      // Step 3: Find threads without summaries (user-scoped)
      const { data: existingThreadSummaryIds } = await supabaseAdmin
        .from("thread_summaries")
        .select("thread_id");
      const summarizedThreadIds = new Set((existingThreadSummaryIds || []).map(t => t.thread_id));

      const { data: threads, error: threadsError } = await supabaseAdmin
        .from("email_threads")
        .select("id")
        .in("gmail_account_id", accountIds)
        .order("last_message_at", { ascending: false })
        .limit(200);

      if (threadsError) console.error("[backfillSummariesAction] threads fetch error:", threadsError.message);

      const threadsToSummarize = (threads || []).filter(t => !summarizedThreadIds.has(t.id));

      const totalEmailsRemaining = emailsToSummarize.length;
      const totalThreadsRemaining = threadsToSummarize.length;

      console.log(`[backfillSummariesAction] emails to process: ${totalEmailsRemaining}, threads to process: ${totalThreadsRemaining}`);

      // Step 4: Process batch of emails (20 per call to stay within timeout)
      const BATCH_EMAIL = 20;
      const BATCH_THREAD = 10;
      let emailsCount = 0;
      let threadsCount = 0;

      const emailBatch = emailsToSummarize.slice(0, BATCH_EMAIL);
      for (const email of emailBatch) {
        if (getQuotaStatus().aiQuotaExceeded) {
          console.warn("[backfillSummariesAction] Quota exceeded during email summarization loop. Aborting loop.");
          break;
        }
        try {
          await summarizeAndSaveEmail(email.id, email.subject || "(No Subject)", email.body_text);
          emailsCount++;
          console.log(`[backfillSummariesAction] ✓ email ${emailsCount}/${emailBatch.length}: ${email.id}`);
        } catch (err) {
          console.error(`[backfillSummariesAction] ✗ email ${email.id}:`, err instanceof Error ? err.message : err);
          // Continue processing remaining emails
        }
      }

      // Step 5: Process batch of threads
      const threadBatch = threadsToSummarize.slice(0, BATCH_THREAD);
      for (const thread of threadBatch) {
        if (getQuotaStatus().aiQuotaExceeded) {
          console.warn("[backfillSummariesAction] Quota exceeded during thread summarization loop. Aborting loop.");
          break;
        }
        try {
          await summarizeAndSaveThread(thread.id);
          threadsCount++;
          console.log(`[backfillSummariesAction] ✓ thread ${threadsCount}/${threadBatch.length}: ${thread.id}`);
        } catch (err) {
          console.error(`[backfillSummariesAction] ✗ thread ${thread.id}:`, err instanceof Error ? err.message : err);
          // Continue processing remaining threads
        }
      }

      console.log(`[backfillSummariesAction] Done. emails=${emailsCount}, threads=${threadsCount}`);

      // Query database for updated exact remaining counts
      const [
        { count: totalEmails },
        { count: totalEmailSummaries },
        { count: totalThreads },
        { count: totalThreadSummaries }
      ] = await Promise.all([
        supabaseAdmin
          .from("emails")
          .select("id", { count: "exact", head: true })
          .in("gmail_account_id", accountIds)
          .not("body_text", "is", null),
        supabaseAdmin
          .from("email_summaries")
          .select("email_id, emails!inner(gmail_account_id)", { count: "exact", head: true })
          .in("emails.gmail_account_id", accountIds),
        supabaseAdmin
          .from("email_threads")
          .select("id", { count: "exact", head: true })
          .in("gmail_account_id", accountIds),
        supabaseAdmin
          .from("thread_summaries")
          .select("thread_id, email_threads!inner(gmail_account_id)", { count: "exact", head: true })
          .in("email_threads.gmail_account_id", accountIds)
      ]);

      const remainingEmails = Math.max(0, (totalEmails ?? 0) - (totalEmailSummaries ?? 0));
      const remainingThreads = Math.max(0, (totalThreads ?? 0) - (totalThreadSummaries ?? 0));

      return {
        success: true,
        emailsGenerated: emailsCount,
        threadsGenerated: threadsCount,
        remainingEmails,
        remainingThreads,
      };
    } catch (error) {
      console.error("[Backfill Summaries Failure]:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to backfill summaries.");
    }
  });

/**
 * Server function to retrieve the user's chat session history and active session messages.
 */
export const getAgentHistoryAction = createServerFn()
  .validator((sessionId?: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      // Get all sessions
      let { data: sessions } = await supabaseAdmin
        .from("chat_sessions")
        .select("id, title, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      // If no sessions, create one
      if (!sessions || sessions.length === 0) {
        const { data: newSession } = await supabaseAdmin
          .from("chat_sessions")
          .insert({
            user_id: user.id,
            title: "New Conversation"
          })
          .select("id, title, created_at")
          .single();
        sessions = newSession ? [newSession] : [];
      }

      const activeSession = sessionId 
        ? sessions.find(s => s.id === sessionId) || sessions[0]
        : sessions[0];

      let messages: any[] = [];

      if (activeSession) {
        const { data: dbMessages } = await supabaseAdmin
          .from("chat_messages")
          .select("sender, content, metadata")
          .eq("session_id", activeSession.id)
          .order("created_at", { ascending: true });

        messages = (dbMessages || []).map(m => ({
          role: m.sender,
          content: m.content,
          sources: m.metadata?.sources || [],
          searchedCount: m.metadata?.searchedCount,
          matchedCount: m.metadata?.matchedCount,
        }));
      }

      // New sessions always start empty — no demo seed messages

      return {
        sessions: (sessions || []).map(s => ({
          id: s.id,
          title: s.title,
          date: s.created_at,
        })),
        activeSessionId: activeSession?.id || null,
        messages,
      };
    } catch (error) {
      console.error("[Get Agent History Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while loading chat history.";
      throw new Error(message);
    }
  });

/**
 * Server function to create a new chat session.
 */
export const createNewSessionAction = createServerFn()
  .validator((title: string) => {
    if (!title) throw new Error("title is required");
    return title;
  })
  .handler(async ({ data: title }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    const { data: newSession, error } = await supabaseAdmin
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        title,
      })
      .select("id, title, created_at")
      .single();

    if (error || !newSession) {
      throw new Error(`Failed to create session: ${error?.message || "Error"}`);
    }

    return newSession;
  });

/**
 * Server function to rename an existing chat session.
 */
export const renameChatSessionAction = createServerFn()
  .validator((payload: { sessionId: string; title: string }) => {
    if (!payload.sessionId) throw new Error("sessionId is required");
    if (!payload.title) throw new Error("title is required");
    return payload;
  })
  .handler(async ({ data: { sessionId, title } }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    const { data, error } = await supabaseAdmin
      .from("chat_sessions")
      .update({ title })
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .select("id, title, created_at")
      .single();

    if (error) {
      throw new Error(`Failed to rename session: ${error.message}`);
    }

    return data;
  });

/**
 * Server function to delete a chat session and all its messages.
 */
export const deleteChatSessionAction = createServerFn()
  .validator((sessionId: string) => {
    if (!sessionId) throw new Error("sessionId is required");
    return sessionId;
  })
  .handler(async ({ data: sessionId }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    // First delete messages for safety
    await supabaseAdmin
      .from("chat_messages")
      .delete()
      .eq("session_id", sessionId);

    // Then delete session
    const { error } = await supabaseAdmin
      .from("chat_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`);
    }

    return { success: true };
  });

/**
 * Helper to calculate cosine similarity between two vectors.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Parse structured or conversational time periods into ISO date strings.
 */
function parseTimePeriod(timePeriod: string): { since: string | null; until: string | null } {
  const now = new Date();
  const lower = timePeriod.toLowerCase().trim();

  if (lower.includes("today")) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), until: null };
  }
  if (lower.includes("yesterday")) {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), until: end.toISOString() };
  }
  if (lower.includes("last week") || lower === "week" || lower.includes("past week")) {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { since: start.toISOString(), until: null };
  }
  if (lower.includes("last month") || lower === "month" || lower.includes("past month")) {
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    return { since: start.toISOString(), until: null };
  }
  if (lower.includes("last year") || lower === "year" || lower.includes("past year")) {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    return { since: start.toISOString(), until: null };
  }
  if (lower.includes("2025")) {
    return { since: "2025-01-01T00:00:00Z", until: "2025-12-31T23:59:59Z" };
  }
  if (lower.includes("2026")) {
    return { since: "2026-01-01T00:00:00Z", until: "2026-12-31T23:59:59Z" };
  }
  
  // Regex fallbacks
  const matchDays = lower.match(/(\d+)\s+day/);
  if (matchDays) {
    const days = parseInt(matchDays[1], 10);
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { since: start.toISOString(), until: null };
  }
  const matchMonths = lower.match(/(\d+)\s+month/);
  if (matchMonths) {
    const months = parseInt(matchMonths[1], 10);
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    return { since: start.toISOString(), until: null };
  }

  return { since: null, until: null };
}

/**
 * Robust helper to call Gemini generateContent with auto-fallback to alternative models if rate-limited.
 */
async function callGeminiAPI(
  apiKey: string,
  payload: any,
  models: string[] = [
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.0-flash-lite",
    "models/gemini-2.5-flash",
    "models/gemini-2.0-flash",
    "models/gemini-flash-latest"
  ],
  preferredModel?: string
) {
  const { aiQuotaExceeded, nextRetryAt } = getQuotaStatus();
  if (aiQuotaExceeded) {
    throw new Error(`AI temporarily unavailable due to quota limits. Cooldown active until ${new Date(nextRetryAt!).toLocaleTimeString()}.`);
  }

  const finalModels = [...models];
  if (preferredModel) {
    const cleanPreferred = preferredModel.startsWith("models/") ? preferredModel : `models/${preferredModel}`;
    const idx = finalModels.indexOf(cleanPreferred);
    if (idx > -1) finalModels.splice(idx, 1);
    finalModels.unshift(cleanPreferred);
  }
  console.log(`[callGeminiAPI] Configured models pipeline: ${finalModels.join(" -> ")}`);
  let lastError: any = null;
  for (const model of finalModels) {
    try {
      const { aiQuotaExceeded: innerExceeded } = getQuotaStatus();
      if (innerExceeded) {
        throw new Error("AI temporarily unavailable due to quota limits.");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

      const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const resJson = await response.json();
        const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { text, model };
        }
      } else {
        const errorText = await response.text();
        console.warn(`[Gemini API Fallback] Model ${model} returned status ${response.status}:`, errorText);
        if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED") || errorText.includes("quota") || errorText.includes("Quota")) {
          setQuotaExceeded();
        }
        lastError = new Error(`Gemini API error for ${model}: ${errorText}`);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.warn(`[Gemini API Fallback] Model ${model} request timed out after 10s`);
        lastError = new Error(`Gemini API request timed out after 10s for ${model}`);
      } else {
        console.warn(`[Gemini API Fallback] Failed to contact ${model}:`, err);
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("Quota")) {
          setQuotaExceeded();
        }
        lastError = err;
      }
    }
  }
  throw lastError || new Error("Gemini API call failed for all models.");
}

/**
 * On-the-fly embedding generator to ensure recent emails have embeddings for semantic search.
 */
async function ensureEmbeddingsForLatestEmails(supabase: any, apiKey: string) {
  try {
    // 1. Fetch latest 30 emails
    const { data: latestEmails } = await supabase
      .from("emails")
      .select("id, thread_id, subject, body_text")
      .order("received_at", { ascending: false })
      .limit(30);

    if (!latestEmails || latestEmails.length === 0) return;

    // 2. Fetch existing embedding email IDs
    const emailIds = latestEmails.map((e: any) => e.id);
    const { data: existing } = await supabase
      .from("embeddings")
      .select("email_id")
      .in("email_id", emailIds);

    const existingSet = new Set((existing || []).map((x: any) => x.email_id).filter(Boolean));

    // 3. Filter to find emails that need embeddings
    const toEmbed = latestEmails.filter((e: any) => !existingSet.has(e.id));
    if (toEmbed.length === 0) return;

    console.log(`[Semantic Search] Generating embeddings for ${toEmbed.length} emails...`);

    // 4. Generate and insert embeddings (limit to 10 at a time to keep it fast)
    for (const email of toEmbed.slice(0, 10)) {
      try {
        const textToEmbed = `Subject: ${email.subject || ""}\nContent: ${(email.body_text || "").slice(0, 4000)}`;
        const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
        const response = await fetch(embedUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: {
              parts: [{ text: textToEmbed }]
            },
            outputDimensionality: 768
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          const vector = resJson.embedding?.values;
          if (vector && vector.length === 768) {
            await supabase.from("embeddings").insert({
              email_id: email.id,
              thread_id: email.thread_id,
              chunk_index: 0,
              content: textToEmbed.slice(0, 1000),
              embedding: vector
            });
          }
        }
      } catch (err) {
        console.error(`[Semantic Search] Failed to embed email ${email.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[Semantic Search] Error in ensureEmbeddingsForLatestEmails:", err);
  }
}

/**
 * Admin-scoped version of the embedding backfill helper.
 * Uses supabaseAdmin and accountIds for user ownership — works correctly in server actions.
 */
async function ensureEmbeddingsForLatestEmailsAdmin(accountIds: string[], apiKey: string) {
  if (!supabaseAdmin || accountIds.length === 0) return;
  try {
    const { data: latestEmails } = await supabaseAdmin
      .from("emails")
      .select("id, thread_id, subject, body_text")
      .in("gmail_account_id", accountIds)
      .order("received_at", { ascending: false })
      .limit(200);

    if (!latestEmails || latestEmails.length === 0) return;

    const emailIds = latestEmails.map(e => e.id);
    const { data: existing } = await supabaseAdmin
      .from("embeddings")
      .select("email_id")
      .in("email_id", emailIds);

    const existingSet = new Set((existing || []).map(x => x.email_id).filter(Boolean));
    const toEmbed = latestEmails.filter(e => !existingSet.has(e.id));
    if (toEmbed.length === 0) return;

    console.log(`[Semantic Search] Generating embeddings for ${toEmbed.length} emails (admin)...`);

    for (const email of toEmbed.slice(0, 15)) {
      try {
        const textToEmbed = `Subject: ${email.subject || ""}\nContent: ${(email.body_text || "").slice(0, 4000)}`;
        const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
        const response = await fetch(embedUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text: textToEmbed }] },
            outputDimensionality: 768
          })
        });
        if (response.ok) {
          const resJson = await response.json();
          const vector = resJson.embedding?.values;
          if (vector && vector.length === 768) {
            await supabaseAdmin.from("embeddings").insert({
              email_id: email.id,
              thread_id: email.thread_id,
              chunk_index: 0,
              content: textToEmbed.slice(0, 1000),
              embedding: vector
            });
          }
        }
      } catch (err) {
        console.error(`[Semantic Search] Failed to embed email ${email.id}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[Semantic Search] Error in ensureEmbeddingsForLatestEmailsAdmin:", err);
  }
}

/**
 * Calculate matching relevance score and reasons for a given email.
 */
function calculateRelevance(
  email: any,
  query: string,
  searchTerms: string | null,
  senderFilter: string | null,
  categoryFilter: string | null,
  isDeadlineRelated: boolean,
  semanticSimilarity?: number
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const subject = (email.subject || "").toLowerCase();
  const body = (email.body_text || "").toLowerCase();
  const fromAddress = (email.from_address || "").toLowerCase();

  // 1. Sender Match
  if (senderFilter) {
    const sLower = senderFilter.toLowerCase().trim();
    if (fromAddress.includes(sLower)) {
      score = Math.max(score, 0.95);
      reasons.push("sender");
    }
  }

  // 2. Keyword Search Terms Match
  if (searchTerms) {
    const term = searchTerms.toLowerCase().trim();
    if (subject.includes(term)) {
      score = Math.max(score, 0.90);
      reasons.push("subject");
    }
    if (body.includes(term)) {
      score = Math.max(score, 0.80);
      reasons.push("body");
    }
    if (fromAddress.includes(term)) {
      score = Math.max(score, 0.85);
      reasons.push("sender");
    }
  }

  // 3. Category Match
  const rawCat = email.email_categories?.category || (Array.isArray(email.email_categories) ? email.email_categories[0]?.category : email.email_categories?.category);
  const emailCat = rawCat || classifyEmailCategory(email.labels || [], email.subject || "", email.from_address || "", email.body_text || "");
  if (categoryFilter) {
    if (emailCat && emailCat.toLowerCase() === categoryFilter.toLowerCase()) {
      score = Math.max(score, 0.85);
      reasons.push("category");
    }
  }

  // 4. Deadline Match
  if (isDeadlineRelated) {
    const deadlineKeywords = [
      "deadline", "due date", "last date", "apply before", "registration closes",
      "closes", "expires", "action required", "action item", "due by", "final date"
    ];
    const subjectHasDeadline = deadlineKeywords.some(kw => subject.includes(kw));
    const bodyHasDeadline = deadlineKeywords.some(kw => body.includes(kw));
    
    if (subjectHasDeadline) {
      score = Math.max(score, 0.88);
      reasons.push("subject (deadline)");
    } else if (bodyHasDeadline) {
      score = Math.max(score, 0.80);
      reasons.push("body (deadline)");
    }
  }

  // 5. Semantic Match
  if (semanticSimilarity && semanticSimilarity > 0.40) {
    score = Math.max(score, semanticSimilarity);
    reasons.push("semantic");
  }

  // Fallback keyword check if nothing matched yet
  if (score === 0) {
    const rawWords = query.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
    for (const word of rawWords) {
      const wLower = word.toLowerCase();
      if (subject.includes(wLower)) {
        score = Math.max(score, 0.50);
        reasons.push("subject");
      }
      if (body.includes(wLower)) {
        score = Math.max(score, 0.40);
        reasons.push("body");
      }
    }
  }

  const uniqueReasons = Array.from(new Set(reasons));
  const reasonStr = uniqueReasons.length > 0 ? uniqueReasons.join("/") : "semantic";

  return { score, reason: reasonStr };
}

/**
 * Server function to ask the AI Agent and generate RAG responses using Gemini.
 */
export const askAgentAction = createServerFn()
  .validator((payload: { query: string; sessionId: string; history: { role: "user" | "assistant"; content: string }[]; model?: string }) => {
    if (!payload.query) throw new Error("query is required");
    if (!payload.sessionId) throw new Error("sessionId is required");
    return payload;
  })
  .handler(async ({ data: { query, sessionId, history, model } }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");

    if (!supabaseAdmin) throw new Error("Database connection unavailable. Check SUPABASE_SERVICE_ROLE_KEY.");

    try {
      // 0. Verify session ownership (manual check since we use admin client)
      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from("chat_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (sessionError || !sessionData) {
        throw new Error("Chat session not found or access denied.");
      }

      // Get user's account IDs for scoping all queries
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);
      const accountIds = (accounts || []).map(a => a.id);

      if (accountIds.length === 0) {
        // No linked accounts — save graceful message and return
        const noAccountMsg = "I couldn't find any linked Gmail accounts. Please connect your Gmail account in Settings first.";
        await supabaseAdmin.from("chat_messages").insert([
          { session_id: sessionId, sender: "user", content: query },
          { session_id: sessionId, sender: "assistant", content: noAccountMsg, metadata: { sources: [] } },
        ]);
        return { role: "assistant", content: noAccountMsg, sources: [] };
      }

      // Retrieve the true session history from database (which includes sources / metadata)
      const { data: dbMessages } = await supabaseAdmin
        .from("chat_messages")
        .select("sender, content, metadata")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      // Extract previously cited email IDs from the session messages
      const previouslyCitedEmailIds = new Set<string>();
      if (dbMessages) {
        for (const msg of dbMessages) {
          if (msg.sender === "assistant" && msg.metadata?.sources) {
            const sources = msg.metadata.sources;
            if (Array.isArray(sources)) {
              for (const src of sources) {
                if (src.id) {
                  previouslyCitedEmailIds.add(src.id);
                }
              }
            }
          }
        }
      }

      // Fetch the contents of previously cited emails
      const citedEmailsMap = new Map<string, any>();
      if (previouslyCitedEmailIds.size > 0) {
        try {
          const { data: citedEmails } = await supabaseAdmin
            .from("emails")
            .select("id, thread_id, from_address, subject, body_text, labels, received_at, email_categories(category)")
            .in("id", Array.from(previouslyCitedEmailIds));
          if (citedEmails) {
            for (const email of citedEmails) {
              citedEmailsMap.set(email.id, email);
            }
          }
        } catch (err) {
          console.warn("[askAgentAction] Failed to fetch cited emails details:", err);
        }
      }

      // Build history text for prompts using database messages, fallback to passed history
      const activeHistory = dbMessages && dbMessages.length > 0
        ? dbMessages.map(m => ({ role: m.sender === "assistant" ? "assistant" : "user", content: m.content }))
        : history;

      const historyText = activeHistory.slice(-6).map(h => `${h.role === "user" ? "User" : "Agent"}: ${h.content}`).join("\n");

      // 1. Save user message
      await supabaseAdmin.from("chat_messages").insert({
        session_id: sessionId,
        sender: "user",
        content: query,
      });

      const env = getEnv();
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

      // 2. Backfill embeddings for recent emails (non-blocking, uses admin client)
      await ensureEmbeddingsForLatestEmailsAdmin(accountIds, apiKey).catch(err =>
        console.warn("[askAgentAction] Embedding backfill skipped:", err instanceof Error ? err.message : err)
      );

      // 3. Extract structured search filters from query using Gemini (incorporating history for follow-ups)
      let searchTerms: string | null = null;
      let senderFilter: string | null = null;
      let categoryFilter: string | null = null;
      let timePeriod: string | null = null;
      let isDeadlineRelated = false;
      let isCategoryQuery = false;

      try {
        const extractionPrompt = `Analyze this email question and conversation history to extract database search filters and search intent.
${historyText ? `Conversation History:\n${historyText}\n` : ""}
New User query: "${query}"

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "searchTerms": "key topic or company name to search in subject/body (e.g. 'TCS', 'invoice', 'meeting') or null",
  "sender": "sender name, company name, or email domain (e.g. 'tcs.com', 'noreply@amazon.com', 'John', 'Nithinreddy910074') or null",
  "category": "one of: Work, Newsletter, Job, Finance, Personal, Notification — or null",
  "timePeriod": "one of: today, yesterday, week, month, year — or null",
  "isDeadlineRelated": true/false,
  "isCategoryQuery": true/false
}

Guidelines:
1. If the user's new query is a follow-up or refinement of the previous conversation (e.g. "elaborate on the second one", "summarize it", "who sent it?", "what is the date?"), you must carry forward the searchTerms, sender, and category from the history so we continue searching the same emails.
2. If the user's query is a completely new topic or request, ignore history search filters and focus only on the new query.
3. searchTerms must be a SHORT keyword (1-2 words max, e.g. "TCS", "contract", "flight"), NOT the user's full question. Never use the entire question as a search string.
4. Set isDeadlineRelated to true if the query is asking about deadlines, due dates, actions, registration closes, or expiring.
5. Set isCategoryQuery to true if the user is explicitly asking to filter by a category (e.g., "Job emails", "Finance emails").`;

        const extractionResult = await callGeminiAPI(apiKey, {
          contents: [{ parts: [{ text: extractionPrompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        });

        if (extractionResult?.text) {
          const parsed = JSON.parse(extractionResult.text.trim());
          searchTerms = parsed.searchTerms?.trim() || null;
          senderFilter = parsed.sender?.trim() || null;
          categoryFilter = parsed.category?.trim() || null;
          timePeriod = parsed.timePeriod?.trim() || null;
          isDeadlineRelated = !!parsed.isDeadlineRelated;
          isCategoryQuery = !!parsed.isCategoryQuery;
          console.log(`[askAgentAction:retrieval] Extracted filters — terms="${searchTerms}", sender="${senderFilter}", category="${categoryFilter}", time="${timePeriod}", deadline=${isDeadlineRelated}`);
        }
      } catch (extractErr) {
        console.warn("[askAgentAction:retrieval] Filter extraction failed, using raw query as keyword:", extractErr instanceof Error ? extractErr.message : extractErr);
        // Fallback: use raw query words as search terms
        searchTerms = query.split(/\s+/).slice(0, 3).join(" ");
      }

      // 4. Translate time period
      let sinceDate: string | null = null;
      let untilDate: string | null = null;
      if (timePeriod) {
        const parsedTime = parseTimePeriod(timePeriod);
        sinceDate = parsedTime.since;
        untilDate = parsedTime.until;
        console.log(`[askAgentAction:retrieval] Time bounds parsed — since="${sinceDate}", until="${untilDate}"`);
      }

      // 5. Keyword + sender + category + deadline DB retrieval (multiple separate queries merged)
      let dbEmails: any[] = [];
      try {
        const emailSelect = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories(category)";
        const emailMap = new Map<string, any>();

        const applyTimeFilter = (q: any) => {
          let res = q;
          if (sinceDate) res = res.gte("received_at", sinceDate);
          if (untilDate) res = res.lte("received_at", untilDate);
          return res;
        };
        const applyAccountFilter = (q: any) => q.in("gmail_account_id", accountIds);

        // Query A: match searchTerms in subject/body/sender
        if (searchTerms) {
          const term = searchTerms.slice(0, 60);
          let q = applyAccountFilter(applyTimeFilter(
            supabaseAdmin.from("emails").select(emailSelect)
              .ilike("subject", `%${term}%`)
          )).order("received_at", { ascending: false }).limit(50);
          const { data: subjectMatches, error: se } = await q;
          if (se) console.warn("[askAgentAction:retrieval] subject query error:", se.message);
          (subjectMatches || []).forEach((e: any) => emailMap.set(e.id, e));

          let q2 = applyAccountFilter(applyTimeFilter(
            supabaseAdmin.from("emails").select(emailSelect)
              .ilike("body_text", `%${term}%`)
          )).order("received_at", { ascending: false }).limit(50);
          const { data: bodyMatches, error: be } = await q2;
          if (be) console.warn("[askAgentAction:retrieval] body query error:", be.message);
          (bodyMatches || []).forEach((e: any) => emailMap.set(e.id, e));

          let q3 = applyAccountFilter(applyTimeFilter(
            supabaseAdmin.from("emails").select(emailSelect)
              .ilike("from_address", `%${term}%`)
          )).order("received_at", { ascending: false }).limit(30);
          const { data: fromMatches, error: fe } = await q3;
          if (fe) console.warn("[askAgentAction:retrieval] from_address query error:", fe.message);
          (fromMatches || []).forEach((e: any) => emailMap.set(e.id, e));
        }

        // Query B: match explicit sender filter
        if (senderFilter) {
          let q4 = applyAccountFilter(applyTimeFilter(
            supabaseAdmin.from("emails").select(emailSelect)
              .ilike("from_address", `%${senderFilter.slice(0, 60)}%`)
          )).order("received_at", { ascending: false }).limit(50);
          const { data: senderMatches, error: sde } = await q4;
          if (sde) console.warn("[askAgentAction:retrieval] sender query error:", sde.message);
          (senderMatches || []).forEach((e: any) => emailMap.set(e.id, e));
        }

        // Query C: match category filter
        if (categoryFilter) {
          let qCat = applyAccountFilter(applyTimeFilter(
            supabaseAdmin
              .from("emails")
              .select("id, thread_id, from_address, subject, body_text, labels, received_at, email_categories!inner(category)")
              .eq("email_categories.category", categoryFilter)
          )).order("received_at", { ascending: false }).limit(50);
          const { data: categoryMatches, error: ce } = await qCat;
          if (ce) console.warn("[askAgentAction:retrieval] category query error:", ce.message);
          (categoryMatches || []).forEach((e: any) => emailMap.set(e.id, e));
        }

        // Query D: match deadline keywords
        if (isDeadlineRelated) {
          const deadlineKeywords = [
            "deadline", "due date", "last date", "apply before", "registration closes",
            "closes", "expires", "action required", "action item"
          ];
          for (const kw of deadlineKeywords.slice(0, 5)) {
            let qDl = applyAccountFilter(applyTimeFilter(
              supabaseAdmin.from("emails").select(emailSelect)
                .ilike("subject", `%${kw}%`)
            )).order("received_at", { ascending: false }).limit(20);
            const { data: dlMatches } = await qDl;
            (dlMatches || []).forEach((e: any) => emailMap.set(e.id, e));
          }
        }

        // Query E: if no specific filters but date boundaries exist
        if (!searchTerms && !senderFilter && !categoryFilter && !isDeadlineRelated && (sinceDate || untilDate)) {
          let q5 = applyAccountFilter(applyTimeFilter(
            supabaseAdmin.from("emails").select(emailSelect)
          )).order("received_at", { ascending: false }).limit(50);
          const { data: timeMatches, error: te } = await q5;
          if (te) console.warn("[askAgentAction:retrieval] time query error:", te.message);
          (timeMatches || []).forEach((e: any) => emailMap.set(e.id, e));
        }

        dbEmails = Array.from(emailMap.values());
        console.log(`[askAgentAction:retrieval] Keyword search found ${dbEmails.length} unique emails`);

        // On-the-fly embedding generation for missing keyword-matched emails
        const dbEmailIds = dbEmails.map(e => e.id);
        if (dbEmailIds.length > 0) {
          const { data: existingEmbeds } = await supabaseAdmin
            .from("embeddings")
            .select("email_id")
            .in("email_id", dbEmailIds);
          const existingSet = new Set((existingEmbeds || []).map(x => x.email_id).filter(Boolean));
          const missingEmbeds = dbEmails.filter(e => !existingSet.has(e.id));
          
          if (missingEmbeds.length > 0) {
            console.log(`[askAgentAction:retrieval] Embedding ${missingEmbeds.length} keyword-matched emails on the fly...`);
            for (const email of missingEmbeds.slice(0, 10)) {
              try {
                const textToEmbed = `Subject: ${email.subject || ""}\nContent: ${(email.body_text || "").slice(0, 4000)}`;
                const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
                const response = await fetch(embedUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    content: { parts: [{ text: textToEmbed }] },
                    outputDimensionality: 768
                  })
                });
                if (response.ok) {
                  const resJson = await response.json();
                  const vector = resJson.embedding?.values;
                  if (vector && vector.length === 768) {
                    await supabaseAdmin.from("embeddings").insert({
                      email_id: email.id,
                      thread_id: email.thread_id,
                      chunk_index: 0,
                      content: textToEmbed.slice(0, 1000),
                      embedding: vector
                    });
                  }
                }
              } catch (err) {
                console.error(`[askAgentAction:retrieval] Failed to embed matched email ${email.id}:`, err);
              }
            }
          }
        }
      } catch (retrievalErr) {
        console.error("[askAgentAction:retrieval] DB retrieval failed:", retrievalErr instanceof Error ? retrievalErr.message : retrievalErr);
      }

      // 6. Semantic (vector) retrieval using match_embeddings RPC
      let semanticEmails: any[] = [];
      const semanticSimilarityMap = new Map<string, number>();
      try {
        const embedText = searchTerms || query;
        const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
        const embedRes = await fetch(embedUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text: embedText }] },
            outputDimensionality: 768
          })
        });

        if (embedRes.ok) {
          const embedData = await embedRes.json();
          const queryVector = embedData.embedding?.values;

          if (queryVector && queryVector.length === 768) {
            const { data: matchedEmbeds, error: rpcErr } = await supabaseAdmin.rpc("match_embeddings", {
              query_embedding: queryVector,
              match_threshold: 0.35,
              match_count: 50
            });

            if (rpcErr) {
              console.warn("[askAgentAction:semantic] RPC match_embeddings error:", rpcErr.message);
            } else if (matchedEmbeds && matchedEmbeds.length > 0) {
              for (const emb of matchedEmbeds) {
                if (emb.email_id) {
                  semanticSimilarityMap.set(emb.email_id, emb.similarity);
                }
              }

              const matchedIds = Array.from(semanticSimilarityMap.keys());
              let qSem = supabaseAdmin
                .from("emails")
                .select("id, thread_id, from_address, subject, body_text, labels, received_at, email_categories(category)")
                .in("gmail_account_id", accountIds)
                .in("id", matchedIds);

              if (sinceDate) qSem = qSem.gte("received_at", sinceDate);
              if (untilDate) qSem = qSem.lte("received_at", untilDate);

              const { data: fetchedEmails, error: fErr } = await qSem;

              if (fErr) {
                console.warn("[askAgentAction:semantic] Error fetching semantic emails:", fErr.message);
              } else if (fetchedEmails) {
                semanticEmails = matchedIds
                  .map((id: string) => fetchedEmails.find((e: any) => e.id === id))
                  .filter(Boolean);
              }
            }
          }
        } else {
          console.warn("[askAgentAction:semantic] Embedding API returned", embedRes.status, "— skipping semantic search");
        }
      } catch (semanticErr) {
        console.warn("[askAgentAction:semantic] Semantic search failed:", semanticErr instanceof Error ? semanticErr.message : semanticErr);
      }

      // 7. Merge DB + semantic results, assign relevance score and reason, filter and sort
      const finalMap = new Map<string, { email: any; score: number; reason: string }>();

      // Merge all candidate emails
      const allCandidates = new Map<string, any>();
      for (const e of dbEmails) allCandidates.set(e.id, e);
      for (const e of semanticEmails) allCandidates.set(e.id, e);

      const isConversationalFollowUp = !searchTerms && !senderFilter && !categoryFilter && !isDeadlineRelated && previouslyCitedEmailIds.size > 0;

      for (const [id, email] of allCandidates.entries()) {
        const similarity = semanticSimilarityMap.get(id);
        let { score, reason } = calculateRelevance(
          email,
          query,
          searchTerms,
          senderFilter,
          categoryFilter,
          isDeadlineRelated,
          similarity
        );

        if (isConversationalFollowUp && previouslyCitedEmailIds.has(id)) {
          score = Math.max(score, 0.90);
          reason = reason !== "semantic" ? `${reason}/context` : "context";
        }

        // Only include positive matches (score > 0) to avoid unrelated fallback pollution
        if (score > 0) {
          finalMap.set(id, { email, score, reason });
        }
      }

      const sortedCandidates = Array.from(finalMap.values()).sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.001) {
          return b.score - a.score;
        }
        return new Date(b.email.received_at).getTime() - new Date(a.email.received_at).getTime();
      });

      // Top 20 for Gemini context
      const finalEmails = sortedCandidates.slice(0, 20).map(c => c.email);
      console.log(`[askAgentAction:retrieval] Final context: ${finalEmails.length} emails (scored from ${allCandidates.size} raw candidates)`);

      // Get total emails searched (all emails connected to user's accounts)
      const { count: totalEmailsSearched } = await supabaseAdmin
        .from("emails")
        .select("id", { count: "exact", head: true })
        .in("gmail_account_id", accountIds);

      // 8. Build Gemini context
      const emailsText = finalEmails.length > 0
        ? finalEmails.map(e => `
Email UUID: ${e.id}
From: ${e.from_address}
Subject: ${e.subject || "(No Subject)"}
Date: ${new Date(e.received_at).toLocaleString()}
Category: ${extractCategory(e.email_categories) || classifyEmailCategory(e.labels || [], e.subject || "", e.from_address || "", e.body_text || "")}
Match Details: Matched via ${finalMap.get(e.id)?.reason} (Relevance Score: ${Math.round((finalMap.get(e.id)?.score || 0) * 100)}%)
Body (truncated):
${(e.body_text || "").slice(0, 800)}
`).join("\n---\n")
        : `NO_EMAILS_FOUND`;

      const noResultsHint = finalEmails.length === 0
        ? `\n\nIMPORTANT: No emails were found in the database matching "${searchTerms || senderFilter || query}". Tell the user clearly that their inbox contains no emails matching this search. Do NOT make up email content. Suggest they try syncing their Gmail if they expect emails to be there.`
        : "";

      // 9. Call Gemini for RAG answer
      const prompt = `You are Repeatless Agent, an intelligent email assistant. Answer the user's query using ONLY the provided email context below. Never fabricate emails.

Conversation History:
${historyText}

User query: "${query}"

${finalEmails.length > 0 ? `Email Context (${finalEmails.length} relevant emails):
${emailsText}` : "Email Context: No matching emails found in the database."}
${noResultsHint}

Guidelines:
- If emails were found, provide a clear, structured summary.
- Cite the specific email UUIDs you referenced in "referencedEmailIds".
- If no emails were found, your output content MUST explicitly state "No matching emails found." followed by helpful suggestions (e.g. sync Gmail, rephrase query).
- Never say "An unexpected error occurred" — always give a helpful response.
- Keep responses professional and concise.

Return ONLY valid JSON (no markdown):
{
  "content": "Your answer to the user.",
  "referencedEmailIds": ["UUID_1", "UUID_2"]
}`;

      let agentResponse: { content: string; referencedEmailIds: string[] };

      try {
        const answerResult = await callGeminiAPI(
          apiKey,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
          },
          undefined,
          model
        );

        if (answerResult?.text) {
          try {
            agentResponse = JSON.parse(answerResult.text.trim());
          } catch (parseErr) {
            console.error("[askAgentAction:gemini] Failed to parse JSON response:", answerResult.text.slice(0, 200));
            agentResponse = { content: answerResult.text.trim(), referencedEmailIds: [] };
          }
        } else {
          throw new Error("Gemini returned empty response.");
        }
      } catch (geminiErr) {
        console.error("[askAgentAction:gemini] Gemini API call failed:", geminiErr instanceof Error ? geminiErr.message : geminiErr);
        if (finalEmails.length > 0) {
          const subjects = finalEmails.slice(0, 5).map(e => `• "${e.subject || "(No Subject)"}" from ${e.from_address}`).join("\n");
          agentResponse = {
            content: `I found ${finalEmails.length} emails matching your query, but I'm currently unable to generate a summary (AI service issue). Here are the most recent matches:\n\n${subjects}`,
            referencedEmailIds: finalEmails.slice(0, 5).map(e => e.id),
          };
        } else {
          agentResponse = {
            content: "No matching emails found. I couldn't find any emails matching your search. Please check your query or run Sync Gmail to load more history.",
            referencedEmailIds: [],
          };
        }
      }

      // 10. Map source attributions
      const referencedIds: string[] = agentResponse.referencedEmailIds || [];
      const referencedEmails = finalEmails.filter(e => referencedIds.includes(e.id));

      const palette = [
        "oklch(0.34 0.055 255)",
        "oklch(0.42 0.062 155)",
        "oklch(0.55 0.13 45)",
        "oklch(0.72 0.12 78)",
        "oklch(0.48 0.014 250)",
        "oklch(0.55 0.06 255)",
      ];
      const getAvatarColor = (s: string) => {
        let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
        return palette[Math.abs(h) % palette.length];
      };
      const parseSenderName = (fromAddress: string): string => {
        if (!fromAddress) return "Unknown";
        const match = fromAddress.match(/^([^<]+)<[^>]+>$/);
        if (match) return match[1].trim();
        return fromAddress.split("@")[0].split(/[.+\-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      };

      const mappedSources = referencedEmails.map(email => {
        const candidateInfo = finalMap.get(email.id);
        const senderName = parseSenderName(email.from_address);
        const senderInitials = senderName.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
        return {
          id: email.id,
          threadId: email.thread_id,
          senderName,
          senderEmail: email.from_address,
          senderInitials,
          avatarColor: getAvatarColor(email.from_address || ""),
          subject: email.subject || "(No Subject)",
          category: extractCategory(email.email_categories) || classifyEmailCategory(email.labels || [], email.subject || "", email.from_address || "", email.body_text || ""),
          matchReason: candidateInfo?.reason || "semantic",
          relevanceScore: candidateInfo?.score || 0.40,
          unread: email.labels?.includes("UNREAD") ?? false,
        };
      });

      // 11. Save assistant response
      await supabaseAdmin.from("chat_messages").insert({
        session_id: sessionId,
        sender: "assistant",
        content: agentResponse.content,
        metadata: {
          sources: mappedSources,
          searchedCount: totalEmailsSearched || 0,
          matchedCount: sortedCandidates.length || 0,
        },
      });

      return {
        role: "assistant",
        content: agentResponse.content,
        sources: mappedSources,
        searchedCount: totalEmailsSearched || 0,
        matchedCount: sortedCandidates.length || 0,
      };
    } catch (error) {
      console.error("[askAgentAction:fatal]", error instanceof Error ? error.message : error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      throw new Error(message);
    }
  });

/**
 * Debug server function — tests each step of the Gmail sync pipeline and returns a report.
 * Use this to pinpoint exactly where syncing fails.
 */
export const debugSyncAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized: Please sign in.");
    if (!supabaseAdmin) throw new Error("Database connection unavailable.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report: any = {};

    try {
      // Step 1: Find gmail accounts
      const { data: accounts, error: accError } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, email_address, access_token, refresh_token, token_expires_at, gmail_history_id, last_synced_at")
        .eq("user_id", user.id);

      report.step1_accounts = { found: accounts?.length ?? 0, error: accError?.message ?? null, accounts };

      if (!accounts || accounts.length === 0) {
        return { success: false, report, message: "No Gmail accounts linked." };
      }

      const account = accounts[0];
      report.step2_account_detail = {
        id: account.id,
        email: account.email_address,
        hasAccessToken: !!account.access_token,
        hasRefreshToken: !!account.refresh_token,
        tokenExpiresAt: account.token_expires_at,
        historyId: account.gmail_history_id,
        lastSynced: account.last_synced_at,
      };

      // Step 2: Test Gmail API with access token
      const gmailTestUrl = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
      const gmailTestResponse = await fetch(gmailTestUrl, {
        headers: { Authorization: `Bearer ${account.access_token}`, Accept: "application/json" },
      });
      const gmailTestBody = await gmailTestResponse.json();
      report.step3_gmail_profile_test = {
        status: gmailTestResponse.status,
        ok: gmailTestResponse.ok,
        body: gmailTestBody,
      };

      // Step 3: List message IDs
      if (gmailTestResponse.ok) {
        const listUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5";
        const listResponse = await fetch(listUrl, {
          headers: { Authorization: `Bearer ${account.access_token}`, Accept: "application/json" },
        });
        const listBody = await listResponse.json();
        report.step4_list_messages = {
          status: listResponse.status,
          ok: listResponse.ok,
          messageCount: listBody.messages?.length ?? 0,
          firstFive: listBody.messages?.slice(0, 5) ?? [],
          error: listBody.error ?? null,
        };

        // Step 4: Fetch first message details
        if (listBody.messages?.[0]) {
          const msgId = listBody.messages[0].id;
          const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`;
          const msgResponse = await fetch(msgUrl, {
            headers: { Authorization: `Bearer ${account.access_token}`, Accept: "application/json" },
          });
          const msgBody = await msgResponse.json();
          report.step5_fetch_message_detail = {
            status: msgResponse.status,
            ok: msgResponse.ok,
            messageId: msgId,
            hasPayload: !!msgBody.payload,
            hasHeaders: !!msgBody.payload?.headers?.length,
            hasInternalDate: !!msgBody.internalDate,
            labelIds: msgBody.labelIds ?? [],
            fromHeader: msgBody.payload?.headers?.find((h: any) => h.name.toLowerCase() === "from")?.value ?? "NOT FOUND",
          };

          // Step 5: Try thread upsert
          const testThreadId = listBody.messages[0].threadId || msgId;
          const { data: threadData, error: threadErr } = await supabaseAdmin
            .from("email_threads")
            .upsert(
              {
                gmail_account_id: account.id,
                gmail_thread_id: testThreadId,
                last_message_at: new Date().toISOString(),
              },
              { onConflict: "gmail_account_id,gmail_thread_id" }
            )
            .select("id")
            .single();

          report.step6_thread_upsert = {
            success: !threadErr,
            threadDbId: threadData?.id ?? null,
            error: threadErr?.message ?? null,
            code: threadErr?.code ?? null,
            details: threadErr?.details ?? null,
          };

          // Step 6: Try email upsert (only if thread succeeded)
          if (threadData?.id && msgBody.payload) {
            const fromHeader = msgBody.payload?.headers?.find((h: any) => h.name.toLowerCase() === "from")?.value ?? "";
            const emailMatch = /<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/.exec(fromHeader);
            const fromAddress = emailMatch ? (emailMatch[1] || emailMatch[2]).toLowerCase() : (fromHeader.trim().toLowerCase() || "unknown@example.com");

            const { data: emailData, error: emailErr } = await supabaseAdmin
              .from("emails")
              .upsert(
                {
                  gmail_account_id: account.id,
                  thread_id: threadData.id,
                  gmail_message_id: msgId,
                  from_address: fromAddress,
                  to_addresses: [],
                  cc_addresses: [],
                  bcc_addresses: [],
                  subject: msgBody.payload?.headers?.find((h: any) => h.name.toLowerCase() === "subject")?.value ?? "(No Subject)",
                  body_text: "Test body",
                  body_html: null,
                  labels: msgBody.labelIds ?? [],
                  in_reply_to: null,
                  references_header: [],
                  received_at: msgBody.internalDate ? new Date(Number(msgBody.internalDate)).toISOString() : new Date().toISOString(),
                },
                { onConflict: "gmail_account_id,gmail_message_id" }
              )
              .select("id")
              .single();

            report.step7_email_upsert = {
              success: !emailErr,
              emailDbId: emailData?.id ?? null,
              error: emailErr?.message ?? null,
              code: emailErr?.code ?? null,
              details: emailErr?.details ?? null,
            };
          }
        }
      }

      // Final: Current DB counts
      const { count: emailCount } = await supabaseAdmin
        .from("emails")
        .select("id", { count: "exact", head: true })
        .eq("gmail_account_id", account.id);

      const { count: threadCount } = await supabaseAdmin
        .from("email_threads")
        .select("id", { count: "exact", head: true })
        .eq("gmail_account_id", account.id);

      report.step8_db_counts = { emails: emailCount ?? 0, threads: threadCount ?? 0 };

    } catch (err) {
      report.fatal_error = err instanceof Error ? err.message : String(err);
    }

    return { success: true, report };
  });

/**
 * Server function to get category counts and emails per category from Supabase.
 */
export const getCategoriesAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized: Please sign in to load categories.");
    if (!supabaseAdmin) throw new Error("Database connection unavailable.");

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        return { categories: [], categoryDistribution: [], emails: [] };
      }

      const accountIds = accounts.map((a) => a.id);
      
      // Call shared helper with includeBody = true to return previews
      const catData = await getThreadLevelCategories(accountIds, true);
      
      return {
        categories: catData.categories,
        categoryDistribution: catData.categoryDistribution,
        emails: catData.emails,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error loading categories.";
      throw new Error(message);
    }
  });

/**
 * Server function to search emails from Supabase.
 */
export const searchEmailsAction = createServerFn()
  .validator((params: {
    query?: string;
    sender?: string;
    label?: string;
    dateRange?: string;
    categories?: string[];
    cursor?: string;
    pageSize?: number;
  } | undefined) => {
    return params || {};
  })
  .handler(async ({ data: params }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized: Please sign in to search.");
    if (!supabaseAdmin) throw new Error("Database connection unavailable.");

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        return { emails: [], nextCursor: null, totalCount: 0 };
      }

      const accountIds = accounts.map((a) => a.id);
      const { query, dateRange, sender, label, categories, cursor = null, pageSize = 50 } = params;

      let selectFields = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories(category)";
      if (categories && categories.length > 0) {
        selectFields = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories!inner(category)";
      }

      let dbQuery = supabaseAdmin
        .from("emails")
        .select(selectFields, { count: "exact" })
        .in("gmail_account_id", accountIds);

      // Category filter in database
      if (categories && categories.length > 0) {
        dbQuery = dbQuery.in("email_categories.category", categories);
      }

      // Keyword search
      if (query && query.trim()) {
        const qTrim = query.trim();
        dbQuery = dbQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
      }

      // Sender filter
      if (sender && sender.trim()) {
        dbQuery = dbQuery.ilike("from_address", `%${sender.trim()}%`);
      }

      // Label filter
      if (label && label.trim()) {
        dbQuery = dbQuery.contains("labels", [label.trim().toUpperCase()]);
      }

      // Date range filter
      if (dateRange && dateRange !== "All time") {
        const now = new Date();
        let since: Date | null = null;
        if (dateRange === "Today") {
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (dateRange === "This week") {
          since = new Date(now);
          since.setDate(now.getDate() - 7);
        } else if (dateRange === "This month") {
          since = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (dateRange === "Last 90 days") {
          since = new Date(now);
          since.setDate(now.getDate() - 90);
        }
        if (since) {
          dbQuery = dbQuery.gte("received_at", since.toISOString());
        }
      }

      // Order chronologically (newest first)
      dbQuery = dbQuery.order("received_at", { ascending: false }).order("id", { ascending: false });

      // Apply cursor keyset filter
      if (cursor) {
        const [cursorDate, cursorId] = cursor.split(",");
        if (cursorDate && cursorId) {
          dbQuery = dbQuery.or(`received_at.lt.${cursorDate},and(received_at.eq.${cursorDate},id.lt.${cursorId})`);
        }
      }

      // Limit page size
      dbQuery = dbQuery.limit(pageSize);

      const { data: dbEmails, count, error } = await dbQuery;
      if (error) throw new Error(`Failed to search emails: ${error.message}`);

      const parseSenderName = (addr: string) =>
        addr.split("@")[0].split(/[.\-_+]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

      const getAvatarColor = (addr: string) => {
        const palette = ["oklch(0.34 0.055 255)", "oklch(0.42 0.062 155)", "oklch(0.55 0.13 45)", "oklch(0.72 0.12 78)", "oklch(0.48 0.014 250)", "oklch(0.55 0.06 255)"];
        let hash = 0;
        for (let i = 0; i < addr.length; i++) hash = addr.charCodeAt(i) + ((hash << 5) - hash);
        return palette[Math.abs(hash) % palette.length];
      };

      const emails = (dbEmails || []).map((e: any) => {
        const labels = e.labels as string[];
        const senderName = parseSenderName(e.from_address);
        const senderInitials = senderName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??";
        const emailCategory = e.email_categories?.category || classifyEmailCategory(labels || [], e.subject || "", e.from_address, e.body_text || "");
        return {
          id: e.id,
          threadId: e.thread_id,
          senderName,
          senderEmail: e.from_address,
          senderInitials,
          avatarColor: getAvatarColor(e.from_address),
          subject: e.subject || "(No Subject)",
          preview: e.body_text ? e.body_text.slice(0, 120) : "",
          body: e.body_text || "",
          date: e.received_at,
          unread: labels.map((l: string) => l.toUpperCase()).includes("UNREAD"),
          starred: labels.map((l: string) => l.toUpperCase()).includes("STARRED"),
          category: emailCategory,
          importance: labels.map((l: string) => l.toUpperCase()).includes("IMPORTANT") ? "high" : "normal",
          labels,
          hasAttachments: false,
        };
      });

      const totalCount = count || 0;
      let nextCursor: string | null = null;
      if (emails.length === pageSize) {
        const lastEmail = emails[emails.length - 1];
        nextCursor = `${lastEmail.date},${lastEmail.id}`;
      }

      return { 
        emails,
        nextCursor,
        totalCount
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error searching emails.";
      throw new Error(message);
    }
  });


/**
 * Server function to get newsletter senders from Supabase.
 */
export const getNewslettersAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized: Please sign in to load newsletters.");
    if (!supabaseAdmin) throw new Error("Database connection unavailable.");

    const db = supabaseAdmin;

    try {
      const { data: accounts } = await db
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) return { newsletters: [], emails: [] };

      const accountIds = accounts.map((a) => a.id);

      const { data: newsletterEmails, error } = await db
        .from("emails")
        .select("id, thread_id, from_address, subject, body_text, labels, received_at")
        .in("gmail_account_id", accountIds)
        .contains("labels", ["CATEGORY_PROMOTIONS"])
        .order("received_at", { ascending: false })
        .limit(200);

      if (error) throw new Error(`Failed to query newsletter emails: ${error.message}`);

      const parseSenderName = (addr: string) =>
        addr.split("@")[0].split(/[.\-_+]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

      const getAvatarColor = (addr: string) => {
        const palette = ["oklch(0.34 0.055 255)", "oklch(0.42 0.062 155)", "oklch(0.55 0.13 45)", "oklch(0.72 0.12 78)", "oklch(0.48 0.014 250)", "oklch(0.55 0.06 255)"];
        let hash = 0;
        for (let i = 0; i < addr.length; i++) hash = addr.charCodeAt(i) + ((hash << 5) - hash);
        return palette[Math.abs(hash) % palette.length];
      };

      // Group by sender domain/address into newsletter subscriptions
      const senderMap = new Map<string, { name: string; latestSubject: string; latestDate: string; count: number; latestEmailId: string; latestEmailBody: string; unread: boolean }>();
      for (const e of newsletterEmails || []) {
        const isEmailUnread = e.labels?.includes("UNREAD") ?? false;
        const existing = senderMap.get(e.from_address);
        if (!existing) {
          senderMap.set(e.from_address, {
            name: parseSenderName(e.from_address),
            latestSubject: e.subject || "(No Subject)",
            latestDate: e.received_at,
            count: 1,
            latestEmailId: e.id,
            latestEmailBody: e.body_text || "",
            unread: isEmailUnread,
          });
        } else {
          existing.count++;
          if (new Date(e.received_at) > new Date(existing.latestDate)) {
            existing.latestSubject = e.subject || "(No Subject)";
            existing.latestDate = e.received_at;
            existing.latestEmailId = e.id;
            existing.latestEmailBody = e.body_text || "";
            existing.unread = isEmailUnread;
          } else if (isEmailUnread) {
            existing.unread = true;
          }
        }
      }

      const latestEmailIds = Array.from(senderMap.values()).map(v => v.latestEmailId);
      
      const { data: dbSummaries } = await db
        .from("email_summaries")
        .select("email_id, summary, key_takeaways")
        .in("email_id", latestEmailIds);

      const summariesMap = new Map<string, { summary: string; keyTakeaways: string[] }>();
      dbSummaries?.forEach(s => {
        summariesMap.set(s.email_id, {
          summary: s.summary,
          keyTakeaways: s.key_takeaways || [],
        });
      });

      const newsletters = await Promise.all(
        Array.from(senderMap.entries()).map(async ([addr, info]) => {
          let summaryData = summariesMap.get(info.latestEmailId);

          if (!summaryData) {
            // Generate summary on the fly and save it to prevent duplication
            try {
              const env = getEnv();
              const apiKey = env.GEMINI_API_KEY;
              if (apiKey && info.latestEmailBody) {
                const cleanBody = info.latestEmailBody.slice(0, 5000);
                const prompt = `You are an AI assistant. Summarize the following newsletter, extracting key announcements, important updates, and major takeaways.Location:
Newsletter Subject: ${info.latestSubject}
Body:
${cleanBody}

Return ONLY a JSON object with this exact shape:
{
  "summary": "A concise one-sentence summary of the email.",
  "key_takeaways": ["Takeaway 1", "Takeaway 2"],
  "action_items": []
}`;

                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" },
                  }),
                });

                if (response.ok) {
                  const resJson = await response.json();
                  const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    const parsed = JSON.parse(text.trim());
                    const summary = parsed.summary || "";
                    const key_takeaways = parsed.key_takeaways || [];
                    
                    // Save to DB to avoid duplicate generation next time
                    await db
                      .from("email_summaries")
                      .upsert({
                        email_id: info.latestEmailId,
                        summary: summary,
                        key_takeaways: key_takeaways,
                        action_items: []
                      }, { onConflict: "email_id" });

                    summaryData = {
                      summary: summary,
                      keyTakeaways: key_takeaways,
                    };
                  }
                }
              }
            } catch (err) {
              console.error(`[getNewslettersAction] Failed to generate summary for email ${info.latestEmailId}:`, err);
            }
          }

          return {
            id: addr,
            name: info.name,
            author: addr,
            cadence: `${info.count} email${info.count !== 1 ? "s" : ""}`,
            date: info.latestDate,
            lastIssue: info.latestSubject,
            unread: info.unread,
            extracted: summaryData?.keyTakeaways && summaryData.keyTakeaways.length > 0 
              ? summaryData.keyTakeaways 
              : summaryData?.summary 
                ? [summaryData.summary] 
                : ["No key highlights found."],
            avatarColor: getAvatarColor(addr),
          };
        })
      );

      const emails = (newsletterEmails || []).map((e) => {
        const labels = e.labels as string[];
        const senderName = parseSenderName(e.from_address);
        const senderInitials = senderName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??";
        return {
          id: e.id,
          threadId: e.thread_id,
          senderName,
          senderEmail: e.from_address,
          senderInitials,
          avatarColor: getAvatarColor(e.from_address),
          subject: e.subject || "(No Subject)",
          preview: e.body_text ? e.body_text.slice(0, 120) : "",
          body: e.body_text || "",
          date: e.received_at,
          unread: labels.map((l) => l.toUpperCase()).includes("UNREAD"),
          starred: labels.map((l) => l.toUpperCase()).includes("STARRED"),
          category: "Newsletter" as const,
          importance: "normal" as const,
          labels,
          hasAttachments: false,
        };
      });

      return { newsletters, emails };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error loading newsletters.";
      throw new Error(message);
    }
  });

/**
 * Server function to generate a daily brief using Gemini based on recent emails.
 * Uses callGeminiAPI (model fallbacks) + retry logic. Returns structured error info.
 */
export const generateDailyBriefAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to generate daily brief.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      const { aiQuotaExceeded, nextRetryAt } = getQuotaStatus();
      if (aiQuotaExceeded) {
        return {
          brief: [],
          error: "AI temporarily unavailable due to quota limits.",
          aiQuotaExceeded: true,
          nextRetryAt,
          isStale: true,
        };
      }

      // 1. Get linked accounts
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        return { brief: [], error: null, isStale: false };
      }

      const accountIds = accounts.map(a => a.id);

      // 2. Query latest 30 emails
      const { data: dbEmails, error } = await supabaseAdmin
        .from("emails")
        .select("id, from_address, subject, body_text, received_at, labels")
        .in("gmail_account_id", accountIds)
        .order("received_at", { ascending: false })
        .limit(30);

      if (error) {
        console.error("[generateDailyBriefAction:retrieval]", error.message);
        return {
          brief: [],
          error: "Could not load your emails. Please try syncing.",
          isStale: false,
        };
      }

      if (!dbEmails || dbEmails.length === 0) {
        return {
          brief: [],
          error: null,
          isEmpty: true,
          isStale: false,
        };
      }

      // 3. Format email context for Gemini
      const parseSenderName = (fromAddress: string): string => {
        if (!fromAddress) return "Unknown";
        const match = fromAddress.match(/^([^<]+)<[^>]+>$/);
        if (match) return match[1].trim();
        return fromAddress.split("@")[0].split(/[.+\-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      };

      const emailsText = dbEmails.map((e, idx) => `
Email #${idx + 1}
Sender: ${parseSenderName(e.from_address)} (${e.from_address})
Subject: ${e.subject || "(No Subject)"}
Date: ${new Date(e.received_at).toLocaleString()}
Labels: ${e.labels ? e.labels.join(", ") : ""}
Body snippet: ${e.body_text ? e.body_text.slice(0, 1200) : ""}
`).join("\n---\n");

      // 4. Call Gemini with retry (up to 3 attempts)
      const env = getEnv();
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

      const prompt = `You are a personal assistant. Analyze the user's recent emails to compile a concise daily brief.
Focus on extracting important tasks, deadlines, meetings, follow-ups, and action items.

Recent Emails:
${emailsText}

Format the output as a JSON object with this exact shape:
{
  "brief": [
    "A bullet point summarizing a key task, deadline, meeting, or action item",
    "Another bullet point..."
  ]
}

Guidelines:
- Keep the brief extremely concise, elegant, and action-oriented.
- Limit to 3-5 high-impact bullet points.
- If there are no urgent tasks, deadlines, meetings, or action items, return a single bullet point saying everything looks clear today.
- Do not mention email IDs. Use sender names and clean descriptions.
- Return ONLY the JSON object. Do not include markdown formatting or backticks around the JSON.`;

      const MAX_RETRIES = 3;
      let lastGeminiError: string | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await callGeminiAPI(apiKey, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
          });

          if (!result?.text) {
            throw new Error("Gemini returned empty response.");
          }

          let parsed: { brief?: string[] };
          try {
            parsed = JSON.parse(result.text.trim());
          } catch (parseErr) {
            console.error("[generateDailyBriefAction:gemini] JSON parse failed on attempt", attempt, ":", result.text.slice(0, 200));
            // If it's the last attempt, throw so the outer catch handles it
            if (attempt === MAX_RETRIES) throw new Error("Gemini response was not valid JSON.");
            // Otherwise retry
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }

          const brief = parsed.brief || [];
          console.log(`[generateDailyBriefAction:gemini] Success on attempt ${attempt}, model=${result.model}, items=${brief.length}`);
          return { brief, error: null, isStale: false };

        } catch (geminiErr) {
          const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
          lastGeminiError = msg;
          console.error(`[generateDailyBriefAction:gemini] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);

          const { aiQuotaExceeded: quotaTripped } = getQuotaStatus();
          if (quotaTripped) {
            console.warn(`[generateDailyBriefAction:gemini] Quota exceeded on attempt ${attempt}. Stopping further retries.`);
            break; // Immediately break out of retry loop
          }

          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }

      // All retries exhausted — return structured error so client can show stale cache
      console.error("[generateDailyBriefAction:gemini] All retries exhausted:", lastGeminiError);
      return {
        brief: [],
        error: "AI temporarily unavailable due to quota limits.",
        isStale: true,
        aiQuotaExceeded: true,
      };

    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("[generateDailyBriefAction:fatal]", msg);
      return {
        brief: [],
        error: "AI temporarily unavailable due to quota limits.",
        isStale: true,
        aiQuotaExceeded: true,
      };
    }
  });

export const sendGmailEmailAction = createServerFn()
  .validator((payload: { to: string; cc?: string; subject: string; body: string; threadId?: string; draftId?: string }) => {
    if (!payload.to || typeof payload.to !== "string") {
      throw new Error("Recipient (To) email is required");
    }
    if (typeof payload.subject !== "string") {
      throw new Error("Subject must be a string");
    }
    if (typeof payload.body !== "string") {
      throw new Error("Body must be a string");
    }
    if (payload.threadId && typeof payload.threadId !== "string") {
      throw new Error("threadId must be a string");
    }
    if (payload.draftId && typeof payload.draftId !== "string") {
      throw new Error("draftId must be a string");
    }
    return payload;
  })
  .handler(async ({ data: { to, cc, subject, body, threadId, draftId } }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to send emails.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    // Find the first linked account
    const { data: accounts, error: accountError } = await supabaseAdmin
      .from("gmail_accounts")
      .select("id, email_address")
      .eq("user_id", user.id)
      .limit(1);

    if (accountError) {
      throw new Error(`Failed to query Gmail accounts: ${accountError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      throw new Error("No linked Gmail account found. Please connect your Gmail account in settings first.");
    }

    const account = accounts[0];

    try {
      // Refresh token
      const accessToken = await refreshGmailAccessTokenIfNeeded(account.id);

      // Thread aware reply headers
      let gmailThreadId: string | undefined = undefined;
      let inReplyToHeaderVal = "";
      let referencesHeaderVal = "";

      if (threadId) {
        // Query Supabase for the email_thread row
        const { data: dbThread } = await supabaseAdmin
          .from("email_threads")
          .select("gmail_thread_id")
          .eq("id", threadId)
          .single();

        if (dbThread) {
          gmailThreadId = dbThread.gmail_thread_id;

          // Find the latest message in this thread
          const { data: lastEmail } = await supabaseAdmin
            .from("emails")
            .select("gmail_message_id")
            .eq("thread_id", threadId)
            .order("received_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastEmail) {
            try {
              // Fetch latest message details from Gmail to get its Message-ID and references headers
              const msgDetails = await fetchGmailMessageDetails(accessToken, lastEmail.gmail_message_id);
              const headers = msgDetails.payload?.headers || [];
              const msgIdHeader = headers.find((h: any) => h.name.toLowerCase() === "message-id")?.value;
              if (msgIdHeader) {
                inReplyToHeaderVal = msgIdHeader;
                const parentRefs = headers.find((h: any) => h.name.toLowerCase() === "references")?.value || "";
                referencesHeaderVal = parentRefs
                  ? `${parentRefs.trim()} ${msgIdHeader}`
                  : msgIdHeader;
              }
            } catch (err) {
              console.warn("[sendGmailEmailAction] Failed to fetch parent message headers from Gmail:", err);
            }
          }
        }
      }

      // If a draftId is provided, update the draft and send it
      if (draftId) {
        const emailParts = [];
        emailParts.push(`From: ${account.email_address}`);
        emailParts.push(`To: ${to}`);
        if (cc && cc.trim()) {
          emailParts.push(`Cc: ${cc.trim()}`);
        }
        emailParts.push(`Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`);
        if (inReplyToHeaderVal) {
          emailParts.push(`In-Reply-To: ${inReplyToHeaderVal}`);
        }
        if (referencesHeaderVal) {
          emailParts.push(`References: ${referencesHeaderVal}`);
        }
        emailParts.push("MIME-Version: 1.0");
        emailParts.push("Content-Type: text/plain; charset=UTF-8");
        emailParts.push("Content-Transfer-Encoding: base64");
        emailParts.push("");
        emailParts.push(Buffer.from(body).toString("base64"));

        const emailMime = emailParts.join("\r\n");
        const base64UrlSafe = Buffer.from(emailMime)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const putResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: draftId,
            message: {
              raw: base64UrlSafe,
            },
          }),
        });

        if (!putResponse.ok) {
          const errText = await putResponse.text();
          throw new Error(`Failed to update draft before sending: ${errText}`);
        }

        const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: draftId,
          }),
        });

        if (!sendResponse.ok) {
          const errText = await sendResponse.text();
          throw new Error(`Failed to send draft: ${errText}`);
        }

        const resData = await sendResponse.json();
        const responseThreadId = resData.threadId;

        if (responseThreadId) {
          try {
            await syncGmailThread(account.id, responseThreadId);
          } catch (syncErr) {
            console.warn("[sendGmailEmailAction] On-demand sent thread sync failed:", syncErr);
          }
        }

        return {
          success: true,
          messageId: resData.id,
          threadId: responseThreadId,
        };
      }

      // Otherwise, construct MIME message and send normally
      const emailParts = [];
      emailParts.push(`From: ${account.email_address}`);
      emailParts.push(`To: ${to}`);
      if (cc && cc.trim()) {
        emailParts.push(`Cc: ${cc.trim()}`);
      }
      emailParts.push(`Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`);
      if (inReplyToHeaderVal) {
        emailParts.push(`In-Reply-To: ${inReplyToHeaderVal}`);
      }
      if (referencesHeaderVal) {
        emailParts.push(`References: ${referencesHeaderVal}`);
      }
      emailParts.push("MIME-Version: 1.0");
      emailParts.push("Content-Type: text/plain; charset=UTF-8");
      emailParts.push("Content-Transfer-Encoding: base64");
      emailParts.push("");
      emailParts.push(Buffer.from(body).toString("base64"));

      const emailMime = emailParts.join("\r\n");
      const base64UrlSafe = Buffer.from(emailMime)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
      
      const payload: any = { raw: base64UrlSafe };
      if (gmailThreadId) {
        payload.threadId = gmailThreadId;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gmail API sending failed: ${errText}`);
      }

      const resData = await response.json();
      const responseThreadId = resData.threadId;

      if (responseThreadId) {
        // Automatically trigger sync for this thread to update Supabase local DB
        try {
          await syncGmailThread(account.id, responseThreadId);
        } catch (syncErr) {
          console.warn("[sendGmailEmailAction] On-demand sent thread sync failed:", syncErr);
        }
      }

      return {
        success: true,
        messageId: resData.id,
        threadId: responseThreadId,
      };
    } catch (error) {
      console.error("[sendGmailEmailAction] Error sending email:", error);
      const message = error instanceof Error ? error.message : "Failed to send email via Gmail.";
      throw new Error(message);
    }
  });

export const generateAIDraftAction = createServerFn()
  .validator((payload: { promptText: string; tone: string; style: string; model?: string }) => {
    if (!payload.promptText || typeof payload.promptText !== "string") {
      throw new Error("Prompt text is required");
    }
    return payload;
  })
  .handler(async ({ data: { promptText, tone, style, model } }) => {
    try {
      const env = getEnv();
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

      // Resolve the model endpoint
      const modelEndpoint = model ? (model.startsWith("models/") ? model : `models/${model}`) : "models/gemini-2.5-flash";
      console.log(`[generateAIDraftAction] Generating content with Gemini model: ${modelEndpoint}`);

      const prompt = `You are an AI assistant. Draft an email body based on the user's instructions.
      
Instructions: ${promptText}
Tone/Length: ${tone}
Style: ${style}

Guidelines:
- Write ONLY the body of the email. Do not include subject lines, To, From, Cc, or greeting/sign-off placeholders like "[My Name]". Just write the email body as natural text.
- Do not include any surrounding markdown or backticks. Return the plain text response.`;

      const url = `https://generativelanguage.googleapis.com/v1beta/${modelEndpoint}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${await response.text()}`);
      }

      const resJson = await response.json();
      const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty response from Gemini.");

      return { draft: text.trim() };
    } catch (error) {
      console.error("[Generate AI Draft Action Failure]:", error);
      throw error;
    }
  });

export const saveGmailDraftAction = createServerFn()
  .validator((payload: { to: string; cc?: string; subject: string; body: string; draftId?: string }) => {
    return payload;
  })
  .handler(async ({ data: { to, cc, subject, body, draftId } }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to save drafts.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    const { data: accounts } = await supabaseAdmin
      .from("gmail_accounts")
      .select("id, email_address")
      .eq("user_id", user.id)
      .limit(1);

    if (!accounts || accounts.length === 0) {
      throw new Error("No linked Gmail account found.");
    }

    const account = accounts[0];

    try {
      const accessToken = await refreshGmailAccessTokenIfNeeded(account.id);

      // Construct MIME message
      const emailParts = [];
      emailParts.push(`From: ${account.email_address}`);
      if (to && to.trim()) {
        emailParts.push(`To: ${to}`);
      }
      if (cc && cc.trim()) {
        emailParts.push(`Cc: ${cc.trim()}`);
      }
      emailParts.push(`Subject: =?utf-8?B?${Buffer.from(subject || "").toString("base64")}?=`);
      emailParts.push("MIME-Version: 1.0");
      emailParts.push("Content-Type: text/plain; charset=UTF-8");
      emailParts.push("Content-Transfer-Encoding: base64");
      emailParts.push("");
      emailParts.push(Buffer.from(body || "").toString("base64"));

      const emailMime = emailParts.join("\r\n");
      const base64UrlSafe = Buffer.from(emailMime)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const url = draftId
        ? `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`
        : "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

      const response = await fetch(url, {
        method: draftId ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: draftId,
          message: {
            raw: base64UrlSafe,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gmail API draft creation/update failed: ${errText}`);
      }

      const resData = await response.json();
      return {
        success: true,
        draftId: resData.id,
      };
    } catch (error) {
      console.error("[saveGmailDraftAction] Error saving draft:", error);
      const message = error instanceof Error ? error.message : "Failed to save draft via Gmail.";
      throw new Error(message);
    }
  });

async function handleGmailApiError(response: Response, operation: string) {
  if (response.ok) return;

  let errText = "";
  try {
    errText = await response.text();
  } catch (_) {}

  console.error(`[Gmail API Error] ${operation} failed with status ${response.status}:`, errText);

  if (response.status === 403) {
    let isScopeError = false;
    try {
      const errJson = JSON.parse(errText);
      const firstError = errJson.error?.errors?.[0];
      if (
        firstError?.reason === "insufficientPermissions" ||
        errJson.error?.message?.includes("insufficient") ||
        errText.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
      ) {
        isScopeError = true;
      }
    } catch (_) {
      if (errText.includes("insufficient") || errText.includes("scope") || errText.includes("SCOPE")) {
        isScopeError = true;
      }
    }

    if (isScopeError || response.status === 403) {
      throw new Error(
        `Gmail permissions are insufficient to ${operation}. Please reconnect your Gmail account in Settings and ensure you grant all requested permissions (especially modify/send scopes).`
      );
    }
  }

  let userFriendlyMsg = `Failed to ${operation} via Gmail.`;
  try {
    const errJson = JSON.parse(errText);
    if (errJson.error?.message) {
      userFriendlyMsg = `${userFriendlyMsg} Detail: ${errJson.error.message}`;
    }
  } catch (_) {
    if (errText) {
      userFriendlyMsg = `${userFriendlyMsg} Detail: ${errText}`;
    }
  }

  throw new Error(userFriendlyMsg);
}

export const archiveEmailsAction = createServerFn()
  .validator((emailIds: string[]) => {
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      throw new Error("List of email IDs is required");
    }
    return emailIds.slice(0, 100); // cap at 100 per request
  })
  .handler(async ({ data: emailIds }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      // Fetch emails and verify ownership via gmail_accounts join
      const { data: dbEmails, error: fetchError } = await supabaseAdmin
        .from("emails")
        .select("id, gmail_message_id, gmail_account_id, labels, gmail_accounts!inner(user_id)")
        .in("id", emailIds)
        .eq("gmail_accounts.user_id", user.id);

      if (fetchError) {
        throw new Error(`Failed to retrieve emails: ${fetchError.message}`);
      }
      if (!dbEmails || dbEmails.length === 0) {
        return { success: true, count: 0 }; // nothing to do
      }

      const accountGroups = new Map<string, { dbIds: string[], gmailMsgIds: string[] }>();
      for (const email of dbEmails) {
        const accId = email.gmail_account_id;
        const existing = accountGroups.get(accId) || { dbIds: [], gmailMsgIds: [] };
        existing.dbIds.push(email.id);
        if (email.gmail_message_id) existing.gmailMsgIds.push(email.gmail_message_id);
        accountGroups.set(accId, existing);
      }

      for (const [accountId, { dbIds, gmailMsgIds }] of accountGroups.entries()) {
        const accessToken = await refreshGmailAccessTokenIfNeeded(accountId);

        // Call Gmail batchModify to remove INBOX label
        if (gmailMsgIds.length > 0) {
          const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify";
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ids: gmailMsgIds,
              removeLabelIds: ["INBOX"],
            }),
          });

          if (!response.ok) {
            await handleGmailApiError(response, "archive emails");
          }
        }

        // Update Supabase labels in parallel
        await Promise.all(
          dbEmails
            .filter(e => dbIds.includes(e.id))
            .map(email => {
              const newLabels = (email.labels || []).filter((l: string) => l.toUpperCase() !== "INBOX");
              return supabaseAdmin!
                .from("emails")
                .update({ labels: newLabels })
                .eq("id", email.id)
                .then(({ error }) => {
                  if (error) throw error;
                });
            })
        );

        // Refresh counts in background
        refreshCachedGmailCounts(accountId, accessToken).catch(err => {
          console.error(`[Gmail Sync] Failed to refresh cached counts after archive:`, err);
        });
      }

      return { success: true, count: dbEmails.length };
    } catch (error) {
      console.error("[archiveEmailsAction] Error:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to archive emails.");
    }
  });

export const deleteEmailsAction = createServerFn()
  .validator((emailIds: string[]) => {
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      throw new Error("List of email IDs is required");
    }
    return emailIds.slice(0, 100); // cap at 100 per request
  })
  .handler(async ({ data: emailIds }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      // Fetch emails and verify ownership via gmail_accounts join
      const { data: dbEmails, error: fetchError } = await supabaseAdmin
        .from("emails")
        .select("id, gmail_message_id, gmail_account_id, labels, gmail_accounts!inner(user_id)")
        .in("id", emailIds)
        .eq("gmail_accounts.user_id", user.id);

      if (fetchError) {
        throw new Error(`Failed to retrieve emails: ${fetchError.message}`);
      }
      if (!dbEmails || dbEmails.length === 0) {
        return { success: true, count: 0 };
      }

      const accountGroups = new Map<string, { dbIds: string[], gmailMsgIds: string[] }>();
      for (const email of dbEmails) {
        const accId = email.gmail_account_id;
        const existing = accountGroups.get(accId) || { dbIds: [], gmailMsgIds: [] };
        existing.dbIds.push(email.id);
        if (email.gmail_message_id) existing.gmailMsgIds.push(email.gmail_message_id);
        accountGroups.set(accId, existing);
      }

      for (const [accountId, { dbIds, gmailMsgIds }] of accountGroups.entries()) {
        const accessToken = await refreshGmailAccessTokenIfNeeded(accountId);

        // Move each message to Trash via Gmail API
        if (gmailMsgIds.length > 0) {
          await Promise.all(
            gmailMsgIds.map(async (msgId) => {
              const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/trash`;
              const response = await fetch(url, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: "application/json",
                },
              });

              const respText = await response.text();
              console.log(`[deleteEmailsAction] Gmail API response for message ${msgId}: status=${response.status}, body=${respText.slice(0, 500)}`);

              if (!response.ok) {
                const reConstructedResponse = new Response(respText, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers
                });
                await handleGmailApiError(reConstructedResponse, "delete email");
              } else {
                console.log(`[deleteEmailsAction] Message ${msgId} successfully moved to Gmail Trash.`);
              }
            })
          );
        }

        // Update Supabase labels in parallel - remove INBOX, SENT, and DRAFT labels
        await Promise.all(
          dbEmails
            .filter(e => dbIds.includes(e.id))
            .map(email => {
              const newLabels = [
                ...new Set([
                  ...(email.labels || []).filter(
                    (l: string) =>
                      l.toUpperCase() !== "INBOX" &&
                      l.toUpperCase() !== "SENT" &&
                      l.toUpperCase() !== "DRAFT"
                  ),
                  "TRASH",
                ]),
              ];
              console.log(`[deleteEmailsAction] Updating local Supabase labels for email ${email.id}: old=${JSON.stringify(email.labels)}, new=${JSON.stringify(newLabels)}`);
              return supabaseAdmin!
                .from("emails")
                .update({ labels: newLabels })
                .eq("id", email.id)
                .then(({ error }) => {
                  if (error) throw error;
                });
            })
        );

        // Refresh counts in background
        refreshCachedGmailCounts(accountId, accessToken).catch(err => {
          console.error(`[Gmail Sync] Failed to refresh cached counts after delete:`, err);
        });
      }

      return { success: true, count: dbEmails.length };
    } catch (error) {
      console.error("[deleteEmailsAction] Error:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to delete emails.");
    }
  });


/**
 * Server function to mark emails as read.
 * Removes the UNREAD label via Gmail API and updates Supabase.
 * Accepts an array of DB email IDs (from the emails table).
 */
export const markEmailsReadAction = createServerFn()
  .validator((emailIds: string[]) => {
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      throw new Error("List of email IDs is required");
    }
    return emailIds.slice(0, 200);
  })
  .handler(async ({ data: emailIds }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      // Fetch emails with ownership verification
      const { data: dbEmails, error: fetchError } = await supabaseAdmin
        .from("emails")
        .select("id, gmail_message_id, gmail_account_id, labels, gmail_accounts!inner(user_id)")
        .in("id", emailIds)
        .eq("gmail_accounts.user_id", user.id);

      if (fetchError) {
        throw new Error(`Failed to retrieve emails: ${fetchError.message}`);
      }
      if (!dbEmails || dbEmails.length === 0) {
        return { success: true, count: 0 };
      }

      // Only process emails that are actually unread
      const unreadEmails = dbEmails.filter(e =>
        (e.labels || []).map((l: string) => l.toUpperCase()).includes("UNREAD")
      );

      if (unreadEmails.length === 0) {
        return { success: true, count: 0 };
      }

      // Group by account
      const accountGroups = new Map<string, { dbIds: string[], gmailMsgIds: string[] }>();
      for (const email of unreadEmails) {
        const accId = email.gmail_account_id;
        const existing = accountGroups.get(accId) || { dbIds: [], gmailMsgIds: [] };
        existing.dbIds.push(email.id);
        if (email.gmail_message_id) existing.gmailMsgIds.push(email.gmail_message_id);
        accountGroups.set(accId, existing);
      }

      for (const [accountId, { dbIds, gmailMsgIds }] of accountGroups.entries()) {
        const accessToken = await refreshGmailAccessTokenIfNeeded(accountId);

        // Call Gmail batchModify to remove UNREAD label
        if (gmailMsgIds.length > 0) {
          const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify";
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ids: gmailMsgIds,
              removeLabelIds: ["UNREAD"],
            }),
          });

          if (!response.ok) {
            await handleGmailApiError(response, "mark emails as read");
          }
        }

        // Update Supabase labels in parallel
        await Promise.all(
          unreadEmails
            .filter(e => dbIds.includes(e.id))
            .map(email => {
              const newLabels = (email.labels || []).filter(
                (l: string) => l.toUpperCase() !== "UNREAD"
              );
              return supabaseAdmin!
                .from("emails")
                .update({ labels: newLabels })
                .eq("id", email.id)
                .then(({ error }) => {
                  if (error) throw error;
                });
            })
        );

        // Refresh counts in background
        refreshCachedGmailCounts(accountId, accessToken).catch(err => {
          console.error(`[Gmail Sync] Failed to refresh cached counts after mark read:`, err);
        });
      }

      return { success: true, count: unreadEmails.length };
    } catch (error) {
      console.error("[markEmailsReadAction] Error:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to mark emails as read.");
    }
  });

export const categorizeEmailsAction = createServerFn()
  .validator((payload: { emailIds: string[]; category: "Newsletter" | "Job" | "Finance" | "Notification" | "Personal" | "Work" }) => {
    if (!Array.isArray(payload.emailIds) || payload.emailIds.length === 0) {
      throw new Error("emailIds must be a non-empty array");
    }
    const validCategories = ["Newsletter", "Job", "Finance", "Notification", "Personal", "Work"];
    if (!validCategories.includes(payload.category)) {
      throw new Error("Invalid category");
    }
    return payload;
  })
  .handler(async ({ data: { emailIds, category } }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      // Fetch and verify ownership of emails
      const { data: dbEmails, error: fetchError } = await supabaseAdmin
        .from("emails")
        .select("id, gmail_accounts!inner(user_id)")
        .in("id", emailIds)
        .eq("gmail_accounts.user_id", user.id);

      if (fetchError) throw fetchError;
      if (!dbEmails || dbEmails.length === 0) {
        return { success: true, count: 0 };
      }

      const verifiedIds = dbEmails.map(e => e.id);

      // Perform upsert for each verified email ID
      const upserts = verifiedIds.map(id => ({
        email_id: id,
        category: category,
        confidence_score: 1.0,
        reasoning: "User manually categorized",
      }));

      const { error: upsertError } = await supabaseAdmin
        .from("email_categories")
        .upsert(upserts, { onConflict: "email_id" });

      if (upsertError) throw upsertError;

      return { success: true, count: verifiedIds.length };
    } catch (error) {
      console.error("[categorizeEmailsAction] Error:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to categorize emails.");
    }
  });


/**
 * Server function to retrieve the user's archived emails (no INBOX or TRASH labels).
 */
export const getArchivedEmailsAction = createServerFn()
  .validator((params: { filter?: string; sort?: string; search?: string; cursor?: string; pageSize?: number } | undefined) => {
    return params || {};
  })
  .handler(async ({ data: params }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        return { emails: [], nextCursor: null, totalCount: 0 };
      }

      const accountIds = accounts.map(a => a.id);
      const { filter = "All", sort = "newest", search = "", cursor = null, pageSize = 50 } = params;

      let selectFields = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories(category)";
      if (filter !== "All" && filter !== "Unread") {
        selectFields = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories!inner(category)";
      }

      let dbEmails: any[] = [];
      let totalCount = 0;
      let nextCursor: string | null = null;

      if (sort === "unread") {
        const parsedOffset = cursor && cursor.startsWith("offset:") ? parseInt(cursor.split(":")[1]) || 0 : 0;

        let countSelect = "id";
        if (filter !== "All" && filter !== "Unread") {
          countSelect = "id, email_categories!inner(category)";
        }

        let unreadCountQuery = supabaseAdmin
          .from("emails")
          .select(countSelect, { count: "exact", head: true })
          .in("gmail_account_id", accountIds)
          .not("labels", "cs", '{"INBOX"}')
          .not("labels", "cs", '{"TRASH"}')
          .contains("labels", ["UNREAD"]);

        let readCountQuery = supabaseAdmin
          .from("emails")
          .select(countSelect, { count: "exact", head: true })
          .in("gmail_account_id", accountIds)
          .not("labels", "cs", '{"INBOX"}')
          .not("labels", "cs", '{"TRASH"}')
          .not("labels", "cs", '{"UNREAD"}');

        if (search && search.trim()) {
          const qTrim = search.trim();
          unreadCountQuery = unreadCountQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
          readCountQuery = readCountQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
        }
        if (filter !== "All" && filter !== "Unread") {
          unreadCountQuery = unreadCountQuery.eq("email_categories.category", filter);
          readCountQuery = readCountQuery.eq("email_categories.category", filter);
        }

        const [{ count: unreadCount }, { count: readCount }] = await Promise.all([
          unreadCountQuery.then(res => ({ count: res.count })),
          readCountQuery.then(res => ({ count: res.count }))
        ]);

        totalCount = (unreadCount || 0) + (readCount || 0);
        const unreadTotal = unreadCount || 0;

        if (parsedOffset < unreadTotal) {
          let unreadEmailsQuery = supabaseAdmin
            .from("emails")
            .select(selectFields)
            .in("gmail_account_id", accountIds)
            .not("labels", "cs", '{"INBOX"}')
            .not("labels", "cs", '{"TRASH"}')
            .contains("labels", ["UNREAD"])
            .order("received_at", { ascending: false })
            .order("id", { ascending: false })
            .range(parsedOffset, parsedOffset + pageSize - 1);

          if (search && search.trim()) {
            const qTrim = search.trim();
            unreadEmailsQuery = unreadEmailsQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
          }
          if (filter !== "All" && filter !== "Unread") {
            unreadEmailsQuery = unreadEmailsQuery.eq("email_categories.category", filter);
          }

          const { data } = await unreadEmailsQuery;
          dbEmails = data || [];

          if (dbEmails.length < pageSize) {
            const needed = pageSize - dbEmails.length;
            let fillQuery = supabaseAdmin
              .from("emails")
              .select(selectFields)
              .in("gmail_account_id", accountIds)
              .not("labels", "cs", '{"INBOX"}')
              .not("labels", "cs", '{"TRASH"}')
              .not("labels", "cs", '{"UNREAD"}')
              .order("received_at", { ascending: false })
              .order("id", { ascending: false })
              .range(0, needed - 1);

            if (search && search.trim()) {
              const qTrim = search.trim();
              fillQuery = fillQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
            }
            if (filter !== "All" && filter !== "Unread") {
              fillQuery = fillQuery.eq("email_categories.category", filter);
            }

            const { data: fillData } = await fillQuery;
            if (fillData) {
              dbEmails = [...dbEmails, ...fillData];
            }
          }
        } else {
          const readOffset = parsedOffset - unreadTotal;
          let readEmailsQuery = supabaseAdmin
            .from("emails")
            .select(selectFields)
            .in("gmail_account_id", accountIds)
            .not("labels", "cs", '{"INBOX"}')
            .not("labels", "cs", '{"TRASH"}')
            .not("labels", "cs", '{"UNREAD"}')
            .order("received_at", { ascending: false })
            .order("id", { ascending: false })
            .range(readOffset, readOffset + pageSize - 1);

          if (search && search.trim()) {
            const qTrim = search.trim();
            readEmailsQuery = readEmailsQuery.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
          }
          if (filter !== "All" && filter !== "Unread") {
            readEmailsQuery = readEmailsQuery.eq("email_categories.category", filter);
          }

          const { data } = await readEmailsQuery;
          dbEmails = data || [];
        }

        if (parsedOffset + pageSize < totalCount) {
          nextCursor = `offset:${parsedOffset + pageSize}`;
        }
      } else {
        let query = supabaseAdmin
          .from("emails")
          .select(selectFields, { count: "exact" })
          .in("gmail_account_id", accountIds)
          .not("labels", "cs", '{"INBOX"}')
          .not("labels", "cs", '{"TRASH"}');

        if (search && search.trim()) {
          const qTrim = search.trim();
          query = query.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
        }
        if (filter === "Unread") {
          query = query.contains("labels", ["UNREAD"]);
        } else if (filter !== "All") {
          query = query.eq("email_categories.category", filter);
        }

        const ascending = sort === "oldest";
        query = query.order("received_at", { ascending }).order("id", { ascending });

        if (cursor && !cursor.startsWith("offset:")) {
          const [cursorDate, cursorId] = cursor.split(",");
          if (cursorDate && cursorId) {
            if (ascending) {
              query = query.or(`received_at.gt.${cursorDate},and(received_at.eq.${cursorDate},id.gt.${cursorId})`);
            } else {
              query = query.or(`received_at.lt.${cursorDate},and(received_at.eq.${cursorDate},id.lt.${cursorId})`);
            }
          }
        }

        query = query.limit(pageSize);

        const { data, count, error } = await query;
        if (error) {
          throw new Error(`Failed to query archived emails: ${error.message}`);
        }

        dbEmails = data || [];
        totalCount = count || 0;

        if (dbEmails.length === pageSize) {
          const lastEmail = dbEmails[dbEmails.length - 1];
          nextCursor = `${lastEmail.received_at},${lastEmail.id}`;
        }
      }

      const mappedEmails = dbEmails.map((email) => {
        const category = email.email_categories?.[0]?.category || classifyEmailCategory(
          email.labels || [],
          email.subject || "",
          email.from_address || "",
          email.body_text || ""
        );
        return {
          id: email.id,
          threadId: email.thread_id,
          fromAddress: email.from_address,
          subject: email.subject || "No Subject",
          bodyText: email.body_text || "",
          labels: email.labels || [],
          receivedAt: email.received_at,
          category,
        };
      });

      return { emails: mappedEmails, nextCursor, totalCount };
    } catch (error) {
      console.error("[getArchivedEmailsAction] Error:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to load archived emails.");
    }
  });


/**
 * Server function to restore emails back to Inbox.
 */
export const restoreEmailsAction = createServerFn()
  .validator((emailIds: string[]) => {
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      throw new Error("List of email IDs is required");
    }
    return emailIds.slice(0, 100);
  })
  .handler(async ({ data: emailIds }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      const { data: dbEmails, error: fetchError } = await supabaseAdmin
        .from("emails")
        .select("id, gmail_message_id, gmail_account_id, labels, gmail_accounts!inner(user_id)")
        .in("id", emailIds)
        .eq("gmail_accounts.user_id", user.id);

      if (fetchError) {
        throw new Error(`Failed to retrieve emails: ${fetchError.message}`);
      }
      if (!dbEmails || dbEmails.length === 0) {
        return { success: true, count: 0 };
      }

      const accountGroups = new Map<string, { dbIds: string[], gmailMsgIds: string[] }>();
      for (const email of dbEmails) {
        const accId = email.gmail_account_id;
        const existing = accountGroups.get(accId) || { dbIds: [], gmailMsgIds: [] };
        existing.dbIds.push(email.id);
        if (email.gmail_message_id) existing.gmailMsgIds.push(email.gmail_message_id);
        accountGroups.set(accId, existing);
      }

      for (const [accountId, { dbIds, gmailMsgIds }] of accountGroups.entries()) {
        const accessToken = await refreshGmailAccessTokenIfNeeded(accountId);

        // Call Gmail batchModify to add INBOX label
        if (gmailMsgIds.length > 0) {
          const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify";
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ids: gmailMsgIds,
              addLabelIds: ["INBOX"],
            }),
          });

          if (!response.ok) {
            await handleGmailApiError(response, "restore emails");
          }
        }

        // Update Supabase labels in parallel
        await Promise.all(
          dbEmails
            .filter(e => dbIds.includes(e.id))
            .map(email => {
              const newLabels = [...new Set([...(email.labels || []), "INBOX"])];
              return supabaseAdmin!
                .from("emails")
                .update({ labels: newLabels })
                .eq("id", email.id)
                .then(({ error }) => {
                  if (error) throw error;
                });
            })
        );
      }

      return { success: true, count: dbEmails.length };
    } catch (error) {
      console.error("[restoreEmailsAction] Error:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to restore emails.");
    }
  });


/**
 * Server function to delete emails permanently from both Gmail and Supabase.
 */
export const permanentlyDeleteEmailsAction = createServerFn()
  .validator((emailIds: string[]) => {
    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      throw new Error("List of email IDs is required");
    }
    return emailIds.slice(0, 100);
  })
  .handler(async ({ data: emailIds }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      const { data: dbEmails, error: fetchError } = await supabaseAdmin
        .from("emails")
        .select("id, gmail_message_id, gmail_account_id, gmail_accounts!inner(user_id)")
        .in("id", emailIds)
        .eq("gmail_accounts.user_id", user.id);

      if (fetchError) {
        throw new Error(`Failed to retrieve emails: ${fetchError.message}`);
      }
      if (!dbEmails || dbEmails.length === 0) {
        return { success: true, count: 0 };
      }

      const accountGroups = new Map<string, { dbIds: string[], gmailMsgIds: string[] }>();
      for (const email of dbEmails) {
        const accId = email.gmail_account_id;
        const existing = accountGroups.get(accId) || { dbIds: [], gmailMsgIds: [] };
        existing.dbIds.push(email.id);
        if (email.gmail_message_id) existing.gmailMsgIds.push(email.gmail_message_id);
        accountGroups.set(accId, existing);
      }

      for (const [accountId, { dbIds, gmailMsgIds }] of accountGroups.entries()) {
        const accessToken = await refreshGmailAccessTokenIfNeeded(accountId);

        // Delete permanently via Gmail API
        if (gmailMsgIds.length > 0) {
          await Promise.all(
            gmailMsgIds.map(async (msgId) => {
              const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}`;
              const response = await fetch(url, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              });

              if (!response.ok && response.status !== 204) {
                await handleGmailApiError(response, "permanently delete email");
              }
            })
          );
        }

        // Delete from Supabase
        const { error: deleteError } = await supabaseAdmin
          .from("emails")
          .delete()
          .in("id", dbIds);

        if (deleteError) {
          throw new Error(`Failed to delete emails from DB: ${deleteError.message}`);
        }
      }

      return { success: true, count: dbEmails.length };
    } catch (error) {
      console.error("[permanentlyDeleteEmailsAction] Error:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to permanently delete emails.");
    }
  });

export const getSentEmailsAction = createServerFn()
  .validator((params: { filter?: string; sort?: string; search?: string; cursor?: string; pageSize?: number } | undefined) => {
    return params || {};
  })
  .handler(async ({ data: params }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized: Please sign in.");
    if (!supabaseAdmin) throw new Error("Database connection unavailable.");

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        return { emails: [], nextCursor: null, totalCount: 0 };
      }

      const accountIds = accounts.map(a => a.id);
      const { filter = "All", sort = "newest", search = "", cursor = null, pageSize = 50 } = params;

      let selectFields = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories(category)";
      if (filter !== "All" && filter !== "Unread") {
        selectFields = "id, thread_id, from_address, subject, body_text, labels, received_at, email_categories!inner(category)";
      }

      let dbEmails: any[] = [];
      let totalCount = 0;
      let nextCursor: string | null = null;

      // Sent emails are queried using contains("labels", ["SENT"])
      let query = supabaseAdmin
        .from("emails")
        .select(selectFields, { count: "exact" })
        .in("gmail_account_id", accountIds)
        .contains("labels", ["SENT"])
        .not("labels", "cs", '{"TRASH"}')
        .not("labels", "cs", '{"SPAM"}');

      // Apply search
      if (search && search.trim()) {
        const qTrim = search.trim();
        query = query.or(`subject.ilike.%${qTrim}%,from_address.ilike.%${qTrim}%,body_text.ilike.%${qTrim}%`);
      }
      
      // Apply filters
      if (filter === "Unread") {
        query = query.contains("labels", ["UNREAD"]);
      } else if (filter !== "All") {
        query = query.eq("email_categories.category", filter);
      }

      // Apply sorting and cursors
      const ascending = sort === "oldest";
      query = query.order("received_at", { ascending }).order("id", { ascending });

      if (cursor) {
        const [cursorDate, cursorId] = cursor.split(",");
        if (cursorDate && cursorId) {
          if (ascending) {
            query = query.or(`received_at.gt.${cursorDate},and(received_at.eq.${cursorDate},id.gt.${cursorId})`);
          } else {
            query = query.or(`received_at.lt.${cursorDate},and(received_at.eq.${cursorDate},id.lt.${cursorId})`);
          }
        }
      }

      query = query.limit(pageSize);

      const { data, count, error } = await query;
      if (error) throw new Error(`Failed to query sent emails: ${error.message}`);

      dbEmails = data || [];
      totalCount = count || 0;

      if (dbEmails.length === pageSize) {
        const lastEmail = dbEmails[dbEmails.length - 1];
        nextCursor = `${lastEmail.received_at},${lastEmail.id}`;
      }

      const palette = [
        "oklch(0.34 0.055 255)",
        "oklch(0.42 0.062 155)",
        "oklch(0.72 0.12 78)",
        "oklch(0.55 0.13 45)",
        "oklch(0.38 0.012 250)",
      ];

      const getAvatarColor = (addr: string) => {
        let hash = 0;
        for (let i = 0; i < addr.length; i++) hash = addr.charCodeAt(i) + ((hash << 5) - hash);
        return palette[Math.abs(hash) % palette.length];
      };

      const parseSenderName = (fromHeader: string) => {
        if (!fromHeader) return "Unknown";
        const cleanFrom = fromHeader.replace(/"/g, "");
        const match = cleanFrom.match(/^([^<]+)/);
        if (match && match[1].trim() && !match[1].includes("@")) {
          return match[1].trim();
        }
        const emailMatch = cleanFrom.match(/<([^>]+)>/) || cleanFrom.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        return emailMatch ? emailMatch[1] : cleanFrom;
      };

      const mappedEmails = dbEmails.map((e) => {
        const labels = e.labels as string[];
        const category = extractCategory(e.email_categories) || classifyEmailCategory(labels || [], e.subject || "", e.from_address, e.body_text || "");
        const senderName = parseSenderName(e.from_address);
        const senderInitials = senderName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??";

        return {
          id: e.id,
          threadId: e.thread_id,
          senderName,
          senderEmail: e.from_address,
          senderInitials,
          avatarColor: getAvatarColor(e.from_address),
          subject: e.subject || "(No Subject)",
          preview: e.body_text ? e.body_text.slice(0, 120) : "",
          body: e.body_text || "",
          date: e.received_at,
          unread: labels.map(l => l.toUpperCase()).includes("UNREAD"),
          starred: labels.map(l => l.toUpperCase()).includes("STARRED"),
          category,
          importance: labels.map(l => l.toUpperCase()).includes("IMPORTANT") ? "high" : "normal",
          labels,
          hasAttachments: false,
        };
      });

      return { emails: mappedEmails, nextCursor, totalCount };
    } catch (error) {
      console.error("[getSentEmailsAction] Error:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to load sent emails.");
    }
  });

interface DraftItem {
  id: string;
  messageId: string;
  threadId: string;
  senderName: string;
  senderEmail: string;
  senderInitials: string;
  avatarColor: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  unread: boolean;
  starred: boolean;
  category: string;
  importance: string;
  labels: string[];
  hasAttachments: boolean;
}

export const getDraftsAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, email_address")
        .eq("user_id", user.id)
        .limit(1);

      if (!accounts || accounts.length === 0) {
        return { drafts: [] };
      }

      const account = accounts[0];
      const accessToken = await refreshGmailAccessTokenIfNeeded(account.id);

      // Fetch drafts list
      const url = "https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=25";
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Gmail API drafts list failed: ${await response.text()}`);
      }

      const listData = await response.json();
      const draftsList = listData.drafts || [];

      // Fetch draft details in parallel
      const detailedDrafts = await Promise.all(
        draftsList.map(async (d: { id: string }) => {
          try {
            const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${d.id}?format=full`;
            const detailResponse = await fetch(detailUrl, {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
            });

            if (!detailResponse.ok) return null;

            const detail = await detailResponse.json();
            const message = detail.message;
            if (!message) return null;

            const headers = message.payload?.headers || [];
            
            const getHeader = (name: string) => {
              return headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
            };

            const subject = getHeader("subject") || "(No Subject)";
            const to = getHeader("to") || "";
            const fromRaw = getHeader("from") || account.email_address;

            const parseAddress = (fromHeader: string) => {
              if (!fromHeader) return { name: "Unknown", email: "" };
              const clean = fromHeader.replace(/"/g, "");
              const nameMatch = clean.match(/^([^<]+)/);
              let name = nameMatch && nameMatch[1].trim() && !nameMatch[1].includes("@") ? nameMatch[1].trim() : "";
              const emailMatch = clean.match(/<([^>]+)>/) || clean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
              const email = emailMatch ? emailMatch[1] : clean;
              if (!name) name = email.split("@")[0] || "Draft";
              return { name, email };
            };

            const sender = parseAddress(fromRaw);
            const initials = sender.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() || "DR";
            
            const parsePart = (part: any): string => {
              let text = "";
              if (!part) return "";
              if (part.mimeType === "text/plain" && part.body?.data) {
                text = Buffer.from(part.body.data, "base64").toString("utf8");
              } else if (part.parts) {
                for (const sub of part.parts) {
                  text += parsePart(sub);
                }
              }
              return text;
            };

            const bodyText = parsePart(message.payload);
            const dateVal = getHeader("date") || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString());

            return {
              id: detail.id,
              messageId: message.id,
              threadId: message.threadId,
              senderName: to ? `Draft to: ${to}` : "Draft (No Recipient)",
              senderEmail: to,
              senderInitials: initials,
              avatarColor: "oklch(0.38 0.012 250)",
              subject,
              preview: bodyText ? bodyText.slice(0, 120) : message.snippet || "",
              body: bodyText,
              date: dateVal,
              unread: false,
              starred: false,
              category: "Personal",
              importance: "normal",
              labels: message.labelIds || [],
              hasAttachments: false,
            };
          } catch (err) {
            console.error(`Failed to fetch draft detail ${d.id}:`, err);
            return null;
          }
        })
      );

      const filteredDrafts = detailedDrafts.filter(Boolean) as DraftItem[];
      return { drafts: filteredDrafts };
    } catch (err) {
      console.error("[getDraftsAction] Error:", err);
      throw new Error(err instanceof Error ? err.message : "Failed to load drafts.");
    }
  });

export const getGmailDraftAction = createServerFn()
  .validator((draftId: string) => {
    if (!draftId || typeof draftId !== "string") throw new Error("draftId is required");
    return draftId;
  })
  .handler(async ({ data: draftId }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!accounts || accounts.length === 0) {
        throw new Error("No connected Gmail accounts");
      }

      const account = accounts[0];
      const accessToken = await refreshGmailAccessTokenIfNeeded(account.id);

      const url = `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}?format=full`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Failed to load draft detail: ${await response.text()}`);
      }

      const detail = await response.json();
      const message = detail.message;
      if (!message) throw new Error("Draft message payload missing");

      const headers = message.payload?.headers || [];
      const getHeader = (name: string) => {
        return headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
      };

      const subject = getHeader("subject");
      const to = getHeader("to");
      const cc = getHeader("cc");

      const parsePart = (part: any): string => {
        let text = "";
        if (!part) return "";
        if (part.mimeType === "text/plain" && part.body?.data) {
          text = Buffer.from(part.body.data, "base64").toString("utf8");
        } else if (part.parts) {
          for (const sub of part.parts) {
            text += parsePart(sub);
          }
        }
        return text;
      };

      const bodyText = parsePart(message.payload);

      return {
        id: detail.id,
        messageId: message.id,
        threadId: message.threadId,
        to,
        cc,
        subject,
        body: bodyText,
      };
    } catch (err) {
      console.error("[getGmailDraftAction] Error:", err);
      throw new Error(err instanceof Error ? err.message : "Failed to load draft.");
    }
  });

export const deleteGmailDraftsAction = createServerFn()
  .validator((draftIds: string[]) => {
    if (!Array.isArray(draftIds) || draftIds.length === 0) throw new Error("draftIds required");
    return draftIds;
  })
  .handler(async ({ data: draftIds }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection");

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!accounts || accounts.length === 0) throw new Error("No account linked");

      const account = accounts[0];
      const accessToken = await refreshGmailAccessTokenIfNeeded(account.id);

      await Promise.all(
        draftIds.map(async (id) => {
          const url = `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${id}`;
          const res = await fetch(url, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!res.ok && res.status !== 204) {
            throw new Error(`Failed to delete draft: ${await res.text()}`);
          }
        })
      );

      return { success: true };
    } catch (err) {
      console.error(err);
      throw err;
    }
  });

export const disconnectGmailAction = createServerFn()
  .handler(async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      const { data: accounts } = await supabaseAdmin
        .from("gmail_accounts")
        .select("id, refresh_token, access_token")
        .eq("user_id", user.id);

      if (accounts && accounts.length > 0) {
        for (const account of accounts) {
          const tokenToRevoke = account.refresh_token || account.access_token;
          if (tokenToRevoke) {
            try {
              const revokeUrl = `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`;
              await fetch(revokeUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
              });
              console.log(`[disconnectGmailAction] Revoked token for account ${account.id}`);
            } catch (revokeErr) {
              console.warn(`[disconnectGmailAction] Token revocation failed for account ${account.id}:`, revokeErr);
            }
          }

          const { data: emails } = await supabaseAdmin
            .from("emails")
            .select("id")
            .eq("gmail_account_id", account.id);
          
          if (emails && emails.length > 0) {
            const emailIds = emails.map(e => e.id);
            await supabaseAdmin.from("email_categories").delete().in("email_id", emailIds);
            await supabaseAdmin.from("email_summaries").delete().in("email_id", emailIds);
          }

          const { data: threads } = await supabaseAdmin
            .from("email_threads")
            .select("id")
            .eq("gmail_account_id", account.id);

          if (threads && threads.length > 0) {
            const threadIds = threads.map(t => t.id);
            await supabaseAdmin.from("thread_summaries").delete().in("thread_id", threadIds);
            await supabaseAdmin.from("email_threads").delete().in("id", threadIds);
          }

          await supabaseAdmin.from("emails").delete().eq("gmail_account_id", account.id);
          await supabaseAdmin.from("gmail_accounts").delete().eq("id", account.id);
        }
      }

      return { success: true };
    } catch (err) {
      console.error("[disconnectGmailAction] Error:", err);
      throw err;
    }
  });

export const updateUserProfileAction = createServerFn()
  .validator((payload: { displayName: string }) => {
    if (!payload.displayName || typeof payload.displayName !== "string") {
      throw new Error("displayName is required");
    }
    return payload;
  })
  .handler(async ({ data: { displayName } }) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Unauthorized");
    if (!supabaseAdmin) throw new Error("Database connection unavailable");

    try {
      const { error } = await supabaseAdmin
        .from("users")
        .update({ display_name: displayName })
        .eq("id", user.id);

      if (error) {
        throw new Error(`Failed to update profile: ${error.message}`);
      }

      return { success: true };
    } catch (err) {
      console.error("[updateUserProfileAction] Error:", err);
      throw err;
    }
  });


