import { getEnv } from "../env";
import { supabaseAdmin } from "../supabase/server.server";
import { refreshAccessToken, getGmailProfile } from "./oauth";
import { getQuotaStatus, setQuotaExceeded } from "./quotaState";

/**
 * Deterministic email category classifier — mirrors classifyEmailCategory in actions.ts.
 * Kept here to avoid circular imports (sync.ts → actions.ts → sync.ts).
 */
function classifyEmailCategoryLocal(
  labels: string[] = [],
  subject: string = "",
  fromAddress: string = "",
  bodyText: string = ""
): string {
  const upperLabels = (labels || []).map(l => l.toUpperCase());
  const textToSearch = `${subject || ""} ${fromAddress || ""} ${bodyText || ""}`.toLowerCase();

  const financeKeywords = [
    "invoice", "bill", "receipt", "statement", "payment", "bank", "transaction",
    "tax", "refund", "checkout", "order", "salary", "stripe", "paypal", "finance",
    "credit card", "wire transfer", "purchase confirmation", "receipts", "billing"
  ];
  if (financeKeywords.some(kw => textToSearch.includes(kw))) return "Finance";

  const jobKeywords = [
    "job", "resume", "cv", "interview", "hiring", "recruitment", "recruiter",
    "career", "offer letter", "apply", "applied", "applicant", "application status",
    "linkedin job", "workday", "job offer"
  ];
  if (jobKeywords.some(kw => textToSearch.includes(kw))) return "Job";

  if (upperLabels.includes("CATEGORY_PROMOTIONS") || upperLabels.includes("PROMOTIONS")) return "Newsletter";
  const newsletterKeywords = ["newsletter", "subscribe", "unsubscribe", "digest", "promo", "coupon", "marketing", "substack"];
  if (newsletterKeywords.some(kw => textToSearch.includes(kw))) return "Newsletter";

  if (upperLabels.includes("CATEGORY_UPDATES") || upperLabels.includes("UPDATES")) return "Notification";
  const notificationKeywords = ["notification", "alert", "security alert", "sign-in", "verification", "otp", "confirm your", "welcome to"];
  if (notificationKeywords.some(kw => textToSearch.includes(kw))) return "Notification";

  if (
    upperLabels.includes("CATEGORY_PERSONAL") ||
    upperLabels.includes("CATEGORY_SOCIAL") ||
    upperLabels.includes("SOCIAL") ||
    upperLabels.includes("PERSONAL")
  ) return "Personal";

  if (upperLabels.includes("CATEGORY_FORUMS") || upperLabels.includes("FORUMS")) return "Work";

  return "Work";
}

/**
 * Zero-dependency concurrency-controlled map helper.
 */
async function concurrentMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * Checks if the Gmail account's access token is expired or close to expiration (within 5 minutes)
 * and refreshes it if necessary.
 *
 * @param accountId UUID of the Gmail account in gmail_accounts table
 * @returns The active access token
 */
export async function refreshGmailAccessTokenIfNeeded(accountId: string): Promise<string> {
  if (!supabaseAdmin) throw new Error("Database connection unavailable.");

  // Fetch account details
  const { data: account, error } = await supabaseAdmin
    .from("gmail_accounts")
    .select("access_token, refresh_token, token_expires_at")
    .eq("id", accountId)
    .single();

  if (error || !account) {
    throw new Error(`Failed to find Gmail account ${accountId}: ${error?.message || "Not found"}`);
  }

  const tokenExpiresAt = account.token_expires_at ? new Date(account.token_expires_at) : new Date(0);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer

  if (tokenExpiresAt.getTime() - now.getTime() > bufferMs && account.access_token) {
    console.log(`[Gmail Sync] Access token is valid for account ${accountId}`);
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error(`No refresh token available for account ${accountId}. Please re-authenticate.`);
  }

  console.log(`[Gmail Sync] Access token expired for account ${accountId}. Refreshing...`);
  const refreshData = await refreshAccessToken(account.refresh_token);

  const newExpiry = new Date();
  newExpiry.setSeconds(newExpiry.getSeconds() + refreshData.expires_in);

  const { error: updateError } = await supabaseAdmin
    .from("gmail_accounts")
    .update({
      access_token: refreshData.access_token,
      token_expires_at: newExpiry.toISOString(),
    })
    .eq("id", accountId);

  if (updateError) {
    throw new Error(`Failed to update refreshed token in database: ${updateError.message}`);
  }

  console.log(`[Gmail Sync] Token refreshed successfully for account ${accountId}`);
  return refreshData.access_token;
}

/**
 * Recursively parses mime parts to extract plain text and HTML bodies.
 */
function parseMessagePart(part: any): { text: string; html: string } {
  let text = "";
  let html = "";

  if (part.mimeType === "text/plain" && part.body?.data) {
    text = decodeBase64Url(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data) {
    html = decodeBase64Url(part.body.data);
  } else if (part.parts && Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      const parsed = parseMessagePart(subPart);
      text += parsed.text;
      html += parsed.html;
    }
  }

  return { text, html };
}

/**
 * Parses the body of a Gmail message payload.
 */
function parseMessageBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  if (!payload) return { text, html };

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    text = decodeBase64Url(payload.body.data);
  } else if (payload.mimeType === "text/html" && payload.body?.data) {
    html = decodeBase64Url(payload.body.data);
  } else {
    const parsed = parseMessagePart(payload);
    text = parsed.text;
    html = parsed.html;
  }

  return { text, html };
}

/**
 * Decodes a base64url encoded string.
 */
function decodeBase64Url(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Helper to get a header value from the header array.
 */
function getHeaderValue(headers: { name: string; value: string }[], name: string): string {
  if (!headers) return "";
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : "";
}

/**
 * Parses email strings into clean email address arrays.
 */
function parseRecipientAddresses(headerVal: string): string[] {
  if (!headerVal) return [];
  const addresses: string[] = [];
  const emailRegex = /<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let match;
  while ((match = emailRegex.exec(headerVal)) !== null) {
    const email = match[1] || match[2];
    if (email) {
      addresses.push(email.trim().toLowerCase());
    }
  }
  if (addresses.length === 0) {
    return headerVal.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return addresses;
}

/**
 * Extracts the clean sender email address.
 */
function parseFromAddress(fromHeader: string): string {
  if (!fromHeader) return "";
  const emailRegex = /<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const match = emailRegex.exec(fromHeader);
  if (match) {
    return (match[1] || match[2]).trim().toLowerCase();
  }
  return fromHeader.trim().toLowerCase();
}

/**
 * Fetches message details for a specific Gmail message.
 */
export async function fetchGmailMessageDetails(accessToken: string, messageId: string): Promise<any> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch message details for ${messageId}: ${text}`);
  }

  return response.json();
}

/**
 * Syncs messages for a specific Gmail account.
 * Handles both full sync (fetching latest messages) and incremental sync (using historyId).
 *
 * @param accountId UUID of the Gmail account
 */
// Map of accountId -> boolean to track which accounts are actively syncing in-memory on the server
export const activeServerSyncs = new Map<string, boolean>();

export interface SyncStatus {
  status: "idle" | "syncing" | "syncing_recent" | "syncing_historical" | "completed" | "error";
  imported: number;
  total: number;
}

export async function getSyncStatus(accountId: string): Promise<SyncStatus> {
  if (!supabaseAdmin) return { status: "idle", imported: 0, total: 0 };
  
  try {
    // First, try querying with the new sync columns
    const { data, error } = await supabaseAdmin
      .from("gmail_accounts")
      .select("sync_status, sync_progress_imported, sync_progress_total, sync_token")
      .eq("id", accountId)
      .single();
      
    if (error) {
      // Columns likely don't exist yet — try fallback query with only sync_token
      console.warn("[getSyncStatus] Full select failed (columns may be missing), falling back to sync_token:", error.message);
      const { data: fallbackData, error: fallbackErr } = await supabaseAdmin
        .from("gmail_accounts")
        .select("sync_token")
        .eq("id", accountId)
        .single();
      
      if (!fallbackErr && fallbackData?.sync_token) {
        try {
          const parsed = JSON.parse(fallbackData.sync_token);
          if (parsed && typeof parsed === "object") {
            return {
              status: parsed.status || "idle",
              imported: parsed.imported || 0,
              total: parsed.total || 0
            };
          }
        } catch (e) {
          // Not JSON — sync_token is a real Gmail token
        }
      }
      return { status: "idle", imported: 0, total: 0 };
    }
    
    if (data.sync_status) {
      return {
        status: (data.sync_status as any) || "idle",
        imported: data.sync_progress_imported || 0,
        total: data.sync_progress_total || 0
      };
    }
    
    // Fallback to sync_token parsing when columns exist but are empty
    if (data.sync_token) {
      try {
        const parsed = JSON.parse(data.sync_token);
        if (parsed && typeof parsed === "object") {
          return {
            status: parsed.status || "idle",
            imported: parsed.imported || 0,
            total: parsed.total || 0
          };
        }
      } catch (e) {
        // Not JSON, ignore
      }
    }
  } catch (err) {
    console.error("[getSyncStatus] Error:", err);
  }
  
  return { status: "idle", imported: 0, total: 0 };
}

export async function updateSyncStatus(accountId: string, status: Partial<SyncStatus>): Promise<void> {
  if (!supabaseAdmin) return;
  
  try {
    const current = await getSyncStatus(accountId);
    const next = { ...current, ...status };
    
    // Try updating new columns
    const { error } = await supabaseAdmin
      .from("gmail_accounts")
      .update({
        sync_status: next.status,
        sync_progress_imported: next.imported,
        sync_progress_total: next.total
      })
      .eq("id", accountId);
      
    if (error) {
      console.warn("[updateSyncStatus] Updating columns failed, falling back to sync_token:", error.message);
      // Fallback to sync_token
      await supabaseAdmin
        .from("gmail_accounts")
        .update({
          sync_token: JSON.stringify(next)
        })
        .eq("id", accountId);
    }
  } catch (err) {
    console.error("[updateSyncStatus] Error:", err);
  }
}

export async function runBackgroundSyncProcess(accountId: string): Promise<void> {
  if (activeServerSyncs.get(accountId)) {
    console.log(`[Background Sync] Sync already running in memory for account ${accountId}`);
    return;
  }
  
  activeServerSyncs.set(accountId, true);
  console.log(`[Background Sync] Started sync task in memory for account ${accountId}`);
  
  try {
    // 1. Ensure token is fresh
    const accessToken = await refreshGmailAccessTokenIfNeeded(accountId);
    
    // 2. Fetch account DB state (without sync_status to avoid missing column errors)
    const { data: account, error: accountError } = await supabaseAdmin!
      .from("gmail_accounts")
      .select("id, gmail_history_id, sync_token")
      .eq("id", accountId)
      .single();
      
    if (accountError || !account) {
      throw new Error(`Gmail account not found: ${accountError?.message}`);
    }
    
    // Use getSyncStatus which handles missing columns gracefully
    const syncStatusData = await getSyncStatus(accountId);
    let currentStatus = syncStatusData.status;

    // If completed or idle, check if we already have emails
    const { count, error: countError } = await supabaseAdmin!
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("gmail_account_id", accountId);
      
    const hasEmails = !countError && typeof count === "number" && count > 0;
    
    // If it was completed, and we have emails, perform incremental sync instead of full sync
    if ((currentStatus === "completed" || currentStatus === "idle") && hasEmails && account.gmail_history_id) {
      console.log(`[Background Sync] Performing incremental sync for ${accountId}`);
      await updateSyncStatus(accountId, { status: "syncing", imported: 0, total: 100 });
      const result = await syncIncremental(accountId, accessToken, Number(account.gmail_history_id));
      await updateSyncStatus(accountId, { status: "completed", imported: result.syncedCount, total: result.syncedCount });
      
      // Update historyId and sync timestamp
      await updateHistoryIdAndLastSynced(accountId, accessToken);

      // Trigger Phase 2 (Categorization) and Phase 3 (AI Summarization) in the background!
      runBackgroundCategorization(accountId)
        .then(() => runBackgroundSummarization(accountId))
        .catch((err) => {
          console.error(`[Background Processing Error] during incremental sync for ${accountId}:`, err);
        });

      return;
    }
    
    // Otherwise, start or resume a full/two-phase sync
    if (currentStatus === "idle" || currentStatus === "completed" || currentStatus === "error") {
      currentStatus = "syncing_recent";
      await updateSyncStatus(accountId, { status: "syncing_recent", imported: 0, total: 0 });
    }
    
    if (currentStatus === "syncing_recent") {
      console.log(`[Background Sync] Phase 1: Syncing recent emails for ${accountId}`);
      await syncRecentEmailsPhase(accountId, accessToken);
      currentStatus = "syncing_historical";
      await updateSyncStatus(accountId, { status: "syncing_historical" });
    }
    
    if (currentStatus === "syncing_historical") {
      console.log(`[Background Sync] Phase 2: Syncing historical emails for ${accountId}`);
      await syncHistoricalEmailsPhase(accountId, accessToken);
      currentStatus = "completed";
      await updateSyncStatus(accountId, { status: "completed" });
    }
    
    // Update historyId and sync timestamp
    await updateHistoryIdAndLastSynced(accountId, accessToken);

    // Trigger Phase 2 (Categorization) and Phase 3 (AI Summarization) in the background!
    runBackgroundCategorization(accountId)
      .then(() => runBackgroundSummarization(accountId))
      .catch((err) => {
        console.error(`[Background Processing Error] during full sync for ${accountId}:`, err);
      });
      
  } catch (err) {
    console.error(`[Background Sync Process Failed] for ${accountId}:`, err);
    await updateSyncStatus(accountId, { status: "error" });
  } finally {
    activeServerSyncs.delete(accountId);
    console.log(`[Background Sync] Finished sync task in memory for account ${accountId}`);
  }
}

/**
 * Bulk imports a batch of Gmail messages/threads into the database as fast as possible.
 * Uses controlled concurrency for Gmail fetching and Supabase bulk upserts.
 */
async function syncBatchMessages(
  accountId: string,
  accessToken: string,
  messages: { id: string; threadId: string }[]
): Promise<number> {
  if (messages.length === 0) return 0;
  if (!supabaseAdmin) throw new Error("Database connection unavailable.");

  const CONCURRENCY = 4;
  const BATCH_SIZE = 100;
  let processedCount = 0;

  for (let offset = 0; offset < messages.length; offset += BATCH_SIZE) {
    const chunk = messages.slice(offset, offset + BATCH_SIZE);

    // Fetch details in parallel with controlled concurrency
    const detailsResults = await concurrentMap(chunk, CONCURRENCY, async (msg) => {
      try {
        const details = await fetchGmailMessageDetails(accessToken, msg.id);
        return { msg, details, success: true };
      } catch (err) {
        console.error(`[Gmail Sync] Failed to fetch details for msg ${msg.id}:`, err);
        return { msg, details: null, success: false };
      }
    });

    const validDetails = detailsResults.filter((r) => r.success && r.details);
    if (validDetails.length === 0) continue;

    // Deduplicate thread payloads in memory (getting the max/latest receivedAt)
    const threadsToUpsertMap = new Map<string, any>();
    for (const item of validDetails) {
      const details = item.details;
      const internalDateMs = Number(details.internalDate);
      const receivedAt = !isNaN(internalDateMs) && internalDateMs > 0
        ? new Date(internalDateMs).toISOString()
        : new Date().toISOString();

      const existing = threadsToUpsertMap.get(item.msg.threadId);
      if (!existing || receivedAt > existing.last_message_at) {
        threadsToUpsertMap.set(item.msg.threadId, {
          gmail_account_id: accountId,
          gmail_thread_id: item.msg.threadId,
          last_message_at: receivedAt,
        });
      }
    }

    // Bulk upsert threads
    const { data: dbThreads, error: threadsErr } = await supabaseAdmin
      .from("email_threads")
      .upsert(Array.from(threadsToUpsertMap.values()), {
        onConflict: "gmail_account_id,gmail_thread_id",
      })
      .select("id, gmail_thread_id");

    if (threadsErr || !dbThreads) {
      console.error("[Gmail Sync] Bulk thread upsert failed:", threadsErr?.message);
      continue;
    }

    const threadIdMap = new Map<string, string>();
    dbThreads.forEach((t) => {
      threadIdMap.set(t.gmail_thread_id, t.id);
    });

    // Extract and build email payloads
    const emailPayloads: any[] = [];
    for (const item of validDetails) {
      const details = item.details;
      const headers = details.payload?.headers || [];
      const subject = getHeaderValue(headers, "subject");
      const fromRaw = getHeaderValue(headers, "from");
      const fromAddress = parseFromAddress(fromRaw);

      if (!fromAddress) continue;

      const toAddresses = parseRecipientAddresses(getHeaderValue(headers, "to"));
      const ccAddresses = parseRecipientAddresses(getHeaderValue(headers, "cc"));
      const bccAddresses = parseRecipientAddresses(getHeaderValue(headers, "bcc"));
      const inReplyTo = getHeaderValue(headers, "in-reply-to");

      const referencesRaw = getHeaderValue(headers, "references");
      const referencesHeader = referencesRaw
        ? referencesRaw.split(/\s+/).map((r) => r.trim()).filter(Boolean)
        : [];

      const internalDateMs = Number(details.internalDate);
      const receivedAt = !isNaN(internalDateMs) && internalDateMs > 0
        ? new Date(internalDateMs).toISOString()
        : new Date().toISOString();

      const body = parseMessageBody(details.payload);
      const labels = details.labelIds || [];

      const dbThreadId = threadIdMap.get(item.msg.threadId);
      if (!dbThreadId) continue;

      emailPayloads.push({
        gmail_account_id: accountId,
        thread_id: dbThreadId,
        gmail_message_id: item.msg.id,
        from_address: fromAddress,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses,
        bcc_addresses: bccAddresses,
        subject: subject || "(No Subject)",
        body_text: body.text || null,
        body_html: body.html || null,
        labels: labels,
        in_reply_to: inReplyTo || null,
        references_header: referencesHeader,
        received_at: receivedAt,
      });
    }

    if (emailPayloads.length === 0) continue;

    // Bulk upsert emails
    const { error: emailsErr } = await supabaseAdmin
      .from("emails")
      .upsert(emailPayloads, {
        onConflict: "gmail_account_id,gmail_message_id",
      });

    if (emailsErr) {
      console.error("[Gmail Sync] Bulk email upsert failed:", emailsErr.message);
      continue;
    }

    processedCount += validDetails.length;
  }

  return processedCount;
}

async function syncRecentEmailsPhase(accountId: string, accessToken: string): Promise<void> {
  // Query Gmail for last 90 days
  const messagesUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  messagesUrl.searchParams.set("q", "newer_than:90d");
  messagesUrl.searchParams.set("maxResults", "100");
  
  let messagesToSync: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined = undefined;
  
  do {
    if (pageToken) {
      messagesUrl.searchParams.set("pageToken", pageToken);
    }
    const response = await fetch(messagesUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list recent messages from Gmail: ${text}`);
    }
    
    const data = await response.json();
    if (data.messages && data.messages.length > 0) {
      messagesToSync.push(...data.messages);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  
  console.log(`[Background Sync] Phase 1: Found ${messagesToSync.length} recent messages to sync.`);

  // Filter out emails we already have in our database
  let existingEmails: { gmail_message_id: string }[] = [];
  {
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: pageData } = await supabaseAdmin!
        .from("emails")
        .select("gmail_message_id")
        .eq("gmail_account_id", accountId)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (!pageData || pageData.length === 0) break;
      existingEmails.push(...pageData);
      page++;
      if (pageData.length < PAGE_SIZE) break;
    }
  }
  const existingIds = new Set((existingEmails || []).map(e => e.gmail_message_id));
  const newMessages = messagesToSync.filter(msg => !existingIds.has(msg.id));
  
  console.log(`[Background Sync] Phase 1: Filtered ${messagesToSync.length} -> ${newMessages.length} new messages.`);
  
  const alreadyImported = existingIds.size;
  await updateSyncStatus(accountId, {
    status: "syncing_recent",
    imported: alreadyImported,
    total: alreadyImported + newMessages.length
  });
  
  let imported = alreadyImported;
  const BATCH_SIZE = 100;
  for (let i = 0; i < newMessages.length; i += BATCH_SIZE) {
    const chunk = newMessages.slice(i, i + BATCH_SIZE);
    const count = await syncBatchMessages(accountId, accessToken, chunk);
    imported += count;
    await updateSyncStatus(accountId, { imported });
  }
}

async function syncHistoricalEmailsPhase(accountId: string, accessToken: string): Promise<void> {
  const messagesUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  messagesUrl.searchParams.set("maxResults", "100");
  
  let messagesToSync: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined = undefined;
  
  do {
    if (pageToken) {
      messagesUrl.searchParams.set("pageToken", pageToken);
    }
    const response = await fetch(messagesUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list messages from Gmail: ${text}`);
    }
    
    const data = await response.json();
    if (data.messages && data.messages.length > 0) {
      messagesToSync.push(...data.messages);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  
  // Filter out emails we already have in our database
  let existingEmails: { gmail_message_id: string }[] = [];
  {
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: pageData } = await supabaseAdmin!
        .from("emails")
        .select("gmail_message_id")
        .eq("gmail_account_id", accountId)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (!pageData || pageData.length === 0) break;
      existingEmails.push(...pageData);
      page++;
      if (pageData.length < PAGE_SIZE) break;
    }
  }
    
  const existingIds = new Set((existingEmails || []).map(e => e.gmail_message_id));
  const newMessages = messagesToSync.filter(msg => !existingIds.has(msg.id));
  
  console.log(`[Background Sync] Phase 2: Found ${messagesToSync.length} total messages, ${newMessages.length} are new historical messages.`);
  
  const alreadyImported = existingIds.size;
  await updateSyncStatus(accountId, {
    status: "syncing_historical",
    imported: alreadyImported,
    total: alreadyImported + newMessages.length
  });
  
  let imported = alreadyImported;
  const BATCH_SIZE = 100;
  for (let i = 0; i < newMessages.length; i += BATCH_SIZE) {
    const chunk = newMessages.slice(i, i + BATCH_SIZE);
    const count = await syncBatchMessages(accountId, accessToken, chunk);
    imported += count;
    await updateSyncStatus(accountId, { imported });
  }
}

async function syncSingleMessage(
  accountId: string,
  accessToken: string,
  msg: { id: string; threadId: string }
): Promise<boolean> {
  const details = await fetchGmailMessageDetails(accessToken, msg.id);
  const headers = details.payload?.headers || [];

  const subject = getHeaderValue(headers, "subject");
  const fromRaw = getHeaderValue(headers, "from");
  const fromAddress = parseFromAddress(fromRaw);

  if (!fromAddress) {
    console.warn(`[Gmail Sync] Message ${msg.id} has no from_address — skipping`);
    return false;
  }

  const toAddresses = parseRecipientAddresses(getHeaderValue(headers, "to"));
  const ccAddresses = parseRecipientAddresses(getHeaderValue(headers, "cc"));
  const bccAddresses = parseRecipientAddresses(getHeaderValue(headers, "bcc"));
  const inReplyTo = getHeaderValue(headers, "in-reply-to");

  const referencesRaw = getHeaderValue(headers, "references");
  const referencesHeader = referencesRaw
    ? referencesRaw.split(/\s+/).map((r) => r.trim()).filter(Boolean)
    : [];

  const internalDateMs = Number(details.internalDate);
  const receivedAt = !isNaN(internalDateMs) && internalDateMs > 0
    ? new Date(internalDateMs).toISOString()
    : new Date().toISOString();

  const body = parseMessageBody(details.payload);
  const labels = details.labelIds || [];

  // A. Upsert thread record
  const { data: dbThread, error: threadError } = await supabaseAdmin!
    .from("email_threads")
    .upsert(
      {
        gmail_account_id: accountId,
        gmail_thread_id: msg.threadId,
        last_message_at: receivedAt,
      },
      {
        onConflict: "gmail_account_id,gmail_thread_id",
      }
    )
    .select("id")
    .single();

  if (threadError || !dbThread) {
    console.error(`[Gmail Sync] Failed to upsert thread ${msg.threadId}:`, threadError?.message);
    return false;
  }

  // B. Upsert email record
  const emailPayload = {
    gmail_account_id: accountId,
    thread_id: dbThread.id,
    gmail_message_id: msg.id,
    from_address: fromAddress,
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    bcc_addresses: bccAddresses,
    subject: subject || "(No Subject)",
    body_text: body.text || null,
    body_html: body.html || null,
    labels: labels,
    in_reply_to: inReplyTo || null,
    references_header: referencesHeader,
    received_at: receivedAt,
  };

  const { data: dbEmail, error: emailError } = await supabaseAdmin!
    .from("emails")
    .upsert(emailPayload, {
      onConflict: "gmail_account_id,gmail_message_id",
    })
    .select("id")
    .single();

  if (emailError) {
    console.error(`[Gmail Sync] Failed to upsert email ${msg.id}:`, emailError.message);
    return false;
  }

  // C. Immediately categorize (deterministic, no API call, never fails)
  if (dbEmail?.id) {
    try {
      const category = classifyEmailCategoryLocal(
        labels,
        subject || "(No Subject)",
        fromAddress,
        body.text || ""
      );
      await supabaseAdmin!
        .from("email_categories")
        .upsert(
          {
            email_id: dbEmail.id,
            category,
            confidence_score: 0.75,
            reasoning: "Auto-classified during sync based on labels and content keywords",
          },
          { onConflict: "email_id" }
        );
    } catch (catErr) {
      console.error(`[Gmail Sync] Categorization failed for ${msg.id}:`, catErr);
      // Non-fatal — do not return false
    }
  }

  // D. Background AI enrichment (summarization + embedding) — deferred and rate-limited
  // Only schedule for emails that are likely important to avoid burning Gemini quota on bulk sync
  if (dbEmail?.id) {
    const isImportant = labels.includes("IMPORTANT") || labels.includes("STARRED");
    const isInbox = labels.includes("INBOX");
    // Only immediately summarize important/inbox emails; rest are handled by batch backfill
    if (isImportant || isInbox) {
      // Add jitter delay (up to 30s) to spread Gemini API calls during bulk sync
      const jitterMs = Math.floor(Math.random() * 30000);
      setTimeout(async () => {
        try {
          await summarizeAndSaveEmail(dbEmail.id, subject || "(No Subject)", body.text || "");
        } catch (e) {
          // Silently skip — backfill script will retry later
        }
        try {
          await generateAndSaveEmailEmbedding(dbEmail.id, dbThread.id, subject || "(No Subject)", body.text || "");
        } catch (e) {
          // Silently skip — backfill script will retry later
        }
      }, jitterMs);
    }
  }

  return true;
}

async function syncIncremental(
  accountId: string,
  accessToken: string,
  historyId: number
): Promise<{ success: boolean; syncedCount: number }> {
  console.log(`[Gmail Sync] Attempting incremental sync using historyId ${historyId}`);
  const historyUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
  historyUrl.searchParams.set("startHistoryId", String(historyId));
  historyUrl.searchParams.set("maxResults", "100");

  const response = await fetch(historyUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  let syncedCount = 0;
  if (response.ok) {
    const historyData = await response.json();
    const msgMap = new Map<string, string>();

    if (historyData.history) {
      for (const record of historyData.history) {
        if (record.messagesAdded) {
          for (const addition of record.messagesAdded) {
            if (addition.message?.id && addition.message?.threadId) {
              msgMap.set(addition.message.id, addition.message.threadId);
            }
          }
        }
      }
    }

    const messagesToSync = Array.from(msgMap.entries()).map(([id, threadId]) => ({ id, threadId }));
    console.log(`[Gmail Sync] Incremental: found ${messagesToSync.length} new messages`);

    if (messagesToSync.length > 0) {
      // Filter out emails we already have in our database
      let existingEmails: { gmail_message_id: string }[] = [];
      {
        let page = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          const { data: pageData } = await supabaseAdmin!
            .from("emails")
            .select("gmail_message_id")
            .eq("gmail_account_id", accountId)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
          if (!pageData || pageData.length === 0) break;
          existingEmails.push(...pageData);
          page++;
          if (pageData.length < PAGE_SIZE) break;
        }
      }
      const existingIds = new Set((existingEmails || []).map(e => e.gmail_message_id));
      const newMessages = messagesToSync.filter(msg => !existingIds.has(msg.id));

      console.log(`[Gmail Sync] Incremental: Filtered ${messagesToSync.length} -> ${newMessages.length} new messages.`);

      if (newMessages.length > 0) {
        syncedCount = await syncBatchMessages(accountId, accessToken, newMessages);
      }
    }
  } else {
    const errorText = await response.text();
    console.warn(`[Gmail Sync] Incremental API failed: ${errorText}.`);
  }
  
  return { success: true, syncedCount };
}

export async function refreshCachedGmailCounts(accountId: string, accessToken?: string): Promise<{
  totalThreads: number;
  unreadThreads: number;
  inboxUnreadThreads: number;
  inboxThreads: number;
}> {
  const token = accessToken || await refreshGmailAccessTokenIfNeeded(accountId);
  
  // 1. Get Profile
  const profile = await getGmailProfile(token);
  const totalThreads = profile.threadsTotal || 0;

  // 2. Get UNREAD threads count
  let unreadThreads = 0;
  const unreadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/UNREAD`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (unreadRes.ok) {
    const data = await unreadRes.json();
    unreadThreads = data.threadsTotal || 0;
  }

  // 3. Get INBOX threads count
  let inboxThreads = 0;
  const inboxRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (inboxRes.ok) {
    const data = await inboxRes.json();
    inboxThreads = data.threadsTotal || 0;
  }

  // 4. Get Inbox Unread Primary threads count using quick paged search
  let inboxUnreadThreads = 0;
  let pageToken = "";
  do {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=500&q=label:INBOX%20label:UNREAD%20category:primary${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) break;
    const data = await res.json();
    if (data.threads) {
      inboxUnreadThreads += data.threads.length;
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  const nextStatus = {
    status: "completed",
    imported: totalThreads,
    total: totalThreads,
    totalThreads,
    unreadThreads,
    inboxUnreadThreads,
    inboxThreads,
  };

  await supabaseAdmin!
    .from("gmail_accounts")
    .update({
      sync_token: JSON.stringify(nextStatus)
    })
    .eq("id", accountId);

  return { totalThreads, unreadThreads, inboxUnreadThreads, inboxThreads };
}

async function updateHistoryIdAndLastSynced(accountId: string, accessToken: string): Promise<void> {
  try {
    const profile = await getGmailProfile(accessToken);
    
    // Fetch and cache fresh thread counts
    try {
      const counts = await refreshCachedGmailCounts(accountId, accessToken);
      console.log(`[Gmail Sync] Fetched and cached fresh Gmail counts:`, counts);
    } catch (countsErr) {
      console.error(`[Gmail Sync] Failed to cache Gmail counts:`, countsErr);
    }

    const { error: updateError } = await supabaseAdmin!
      .from("gmail_accounts")
      .update({
        gmail_history_id: profile.historyId ? Number(profile.historyId) : null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (updateError) {
      console.error(`[Gmail Sync] Failed to update history ID:`, updateError.message);
    }
  } catch (err) {
    console.error(`[Gmail Sync] Failed to update historyId / syncedAt:`, err);
  }
}

export async function syncGmailAccount(accountId: string): Promise<{ success: boolean; syncedCount: number }> {
  // Backwards compatibility / manual trigger delegator
  // Starts background process and returns immediately
  runBackgroundSyncProcess(accountId).catch(err => {
    console.error(`[syncGmailAccount] Background sync error:`, err);
  });
  return { success: true, syncedCount: 0 };
}

/**
 * Summarizes a single email utilizing the Gemini API.
 */
export async function generateEmailSummary(subject: string, bodyText: string): Promise<{
  summary: string;
  key_takeaways: string[];
  action_items: string[];
}> {
  const { aiQuotaExceeded, nextRetryAt } = getQuotaStatus();
  if (aiQuotaExceeded) {
    throw new Error(`AI temporarily unavailable due to quota limits. Cooldown active until ${new Date(nextRetryAt!).toLocaleTimeString()}.`);
  }

  const env = getEnv();
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");

  const cleanBody = bodyText.slice(0, 5000);
  const prompt = `You are an AI email assistant. Summarize the following email and extract key takeaways and action items in structured JSON format.

Email Subject: ${subject}
Email Body:
${cleanBody}

Return ONLY a JSON object with this exact shape:
{
  "summary": "A concise one-sentence summary of the email.",
  "key_takeaways": ["Takeaway 1", "Takeaway 2"],
  "action_items": ["Action item 1", "Action item 2"]
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("quota") || errText.includes("Quota")) {
        setQuotaExceeded();
      }
      throw new Error(`Gemini API error: ${errText}`);
    }

    const resJson = await response.json();
    const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini.");

    return JSON.parse(text.trim());
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.warn("[generateEmailSummary] Gemini request timed out after 10s");
      throw new Error("Gemini API request timed out after 10s");
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("Quota")) {
      setQuotaExceeded();
    }
    throw err;
  }
}

/**
 * Summarizes a whole thread utilizing the Gemini API.
 */
export async function generateThreadSummary(messages: { sender: string; subject: string; body: string; date: string }[]): Promise<{
  summary: string;
  key_decisions: string[];
  action_items: string[];
}> {
  const { aiQuotaExceeded, nextRetryAt } = getQuotaStatus();
  if (aiQuotaExceeded) {
    throw new Error(`AI temporarily unavailable due to quota limits. Cooldown active until ${new Date(nextRetryAt!).toLocaleTimeString()}.`);
  }

  const env = getEnv();
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");

  const messagesText = messages.map((m, idx) => `
Message #${idx + 1}
From: ${m.sender}
Subject: ${m.subject}
Date: ${m.date}
Body:
${m.body.slice(0, 2000)}
`).join("\n---\n");

  const prompt = `You are an AI assistant. Analyze the following email thread, summarize it, and identify key decisions and action items in structured JSON format.

Conversation messages:
${messagesText}

Return ONLY a JSON object with this exact shape:
{
  "summary": "A consolidated summary of the entire conversation thread.",
  "key_decisions": ["Decision 1", "Decision 2"],
  "action_items": ["Action item 1 (assigned to who)", "Action item 2"]
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("quota") || errText.includes("Quota")) {
        setQuotaExceeded();
      }
      throw new Error(`Gemini API error: ${errText}`);
    }

    const resJson = await response.json();
    const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini.");

    return JSON.parse(text.trim());
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.warn("[generateThreadSummary] Gemini request timed out after 10s");
      throw new Error("Gemini API request timed out after 10s");
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("Quota")) {
      setQuotaExceeded();
    }
    throw err;
  }
}

/**
 * Triggers generating and storing email summaries.
 * Schema: email_summaries(email_id, summary, key_takeaways, action_items)
 */
export async function summarizeAndSaveEmail(dbEmailId: string, subject: string, bodyText: string) {
  if (!supabaseAdmin) throw new Error("Database connection unavailable");
  
  // 1. Check if summary already exists to avoid regeneration (DB error possible)
  let existingSummary;
  try {
    const { data, error } = await supabaseAdmin
      .from("email_summaries")
      .select("email_id")
      .eq("email_id", dbEmailId)
      .maybeSingle();

    if (error) throw error;
    existingSummary = data;
  } catch (dbErr) {
    console.error(`[Summarize Email] Database lookup failed for ${dbEmailId}:`, dbErr);
    throw new Error(`Database error checking existing summary: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
  }

  if (existingSummary) {
    console.log(`[Summarize Email] Summary already exists for email ${dbEmailId}. Skipping.`);
    return;
  }

  // 2. Generate summary via Gemini API (Gemini API error possible)
  let summaryData;
  try {
    summaryData = await generateEmailSummary(subject, bodyText);
  } catch (apiErr) {
    console.error(`[Summarize Email] Gemini API call failed for email ${dbEmailId}:`, apiErr);
    throw new Error(`Gemini API error: ${apiErr instanceof Error ? apiErr.message : String(apiErr)}`);
  }

  // 3. Save to database (DB error possible)
  try {
    const { error } = await supabaseAdmin
      .from("email_summaries")
      .upsert(
        {
          email_id: dbEmailId,
          summary: summaryData.summary,
          key_takeaways: summaryData.key_takeaways,
          action_items: summaryData.action_items,
        },
        { onConflict: "email_id" }
      );
    if (error) throw error;
  } catch (dbErr) {
    console.error(`[Summarize Email] Upsert failed for ${dbEmailId}:`, dbErr);
    throw new Error(`Database error saving summary: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
  }
}

/**
 * Generates and stores the vector embedding of a single email.
 */
export async function generateAndSaveEmailEmbedding(
  dbEmailId: string,
  dbThreadId: string,
  subject: string,
  bodyText: string
) {
  if (!supabaseAdmin) return;
  const { aiQuotaExceeded, nextRetryAt } = getQuotaStatus();
  if (aiQuotaExceeded) {
    console.warn(`[Embed Email] Gemini embedding call skipped: Quota exceeded cooldown active until ${new Date(nextRetryAt!).toLocaleTimeString()}.`);
    return;
  }

  try {
    // Check if embedding already exists to avoid regeneration
    const { data: existingEmbedding } = await supabaseAdmin
      .from("embeddings")
      .select("id")
      .eq("email_id", dbEmailId)
      .maybeSingle();

    if (existingEmbedding) {
      console.log(`[Embed Email] Embedding already exists for email ${dbEmailId}. Skipping.`);
      return;
    }

    const env = getEnv();
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) return;

    const textToEmbed = `Subject: ${subject || ""}\nContent: ${(bodyText || "").slice(0, 4000)}`;
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(embedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            parts: [{ text: textToEmbed }]
          },
          outputDimensionality: 768
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const resJson = await response.json();
        const vector = resJson.embedding?.values;
        if (vector && vector.length === 768) {
          const { error } = await supabaseAdmin.from("embeddings").insert({
            email_id: dbEmailId,
            thread_id: dbThreadId,
            chunk_index: 0,
            content: textToEmbed.slice(0, 1000),
            embedding: vector
          });
          if (error) {
            console.error(`[Embed Email] Insert failed for email ${dbEmailId}:`, error.message, error.details);
          } else {
            console.log(`[Embed Email] Successfully generated and stored embedding for email ${dbEmailId}.`);
          }
        }
      } else {
        const errText = await response.text();
        console.error(`[Embed Email] Gemini embedding API returned error: ${errText}`);
        if (response.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("quota") || errText.includes("Quota")) {
          setQuotaExceeded();
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.warn(`[Embed Email] Gemini embedding request timed out after 10s`);
      } else {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("Quota")) {
          setQuotaExceeded();
        }
        throw err;
      }
    }
  } catch (err) {
    console.error(`[Embed Email] Failed for email ${dbEmailId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Triggers generating and storing thread summaries.
 * Schema: thread_summaries(thread_id, summary, key_decisions, action_items, participants)
 */
export async function summarizeAndSaveThread(dbThreadId: string) {
  if (!supabaseAdmin) throw new Error("Database connection unavailable");

  // 1. Check if summary already exists (DB error possible)
  let existingSummary;
  try {
    const { data, error } = await supabaseAdmin
      .from("thread_summaries")
      .select("thread_id")
      .eq("thread_id", dbThreadId)
      .maybeSingle();

    if (error) throw error;
    existingSummary = data;
  } catch (dbErr) {
    console.error(`[Summarize Thread] Database lookup failed for thread ${dbThreadId}:`, dbErr);
    throw new Error(`Database error checking existing thread summary: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
  }

  if (existingSummary) {
    console.log(`[Summarize Thread] Summary already exists for thread ${dbThreadId}. Skipping.`);
    return;
  }

  // 2. Retrieve thread emails (DB error possible)
  let dbEmails;
  try {
    const { data, error } = await supabaseAdmin
      .from("emails")
      .select("from_address, subject, body_text, received_at")
      .eq("thread_id", dbThreadId)
      .order("received_at", { ascending: true });

    if (error) throw error;
    dbEmails = data;
  } catch (dbErr) {
    console.error(`[Summarize Thread] Failed to fetch emails for thread ${dbThreadId}:`, dbErr);
    throw new Error(`Database error fetching thread emails: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
  }

  if (!dbEmails || dbEmails.length === 0) {
    console.log(`[Summarize Thread] No emails found for thread ${dbThreadId}. Skipping.`);
    return;
  }

  const messages = dbEmails.map((e) => ({
    sender: e.from_address,
    subject: e.subject || "(No Subject)",
    body: e.body_text || "",
    date: e.received_at,
  }));

  // 3. Generate summary via Gemini API (Gemini API error possible)
  let summaryData;
  try {
    summaryData = await generateThreadSummary(messages);
  } catch (apiErr) {
    console.error(`[Summarize Thread] Gemini API call failed for thread ${dbThreadId}:`, apiErr);
    throw new Error(`Gemini API error: ${apiErr instanceof Error ? apiErr.message : String(apiErr)}`);
  }

  const participants = [...new Set(dbEmails.map((e) => e.from_address))];

  // 4. Save to database (DB error possible)
  try {
    const { error } = await supabaseAdmin
      .from("thread_summaries")
      .upsert(
        {
          thread_id: dbThreadId,
          summary: summaryData.summary,
          key_decisions: summaryData.key_decisions,
          action_items: summaryData.action_items,
          participants,
        },
        { onConflict: "thread_id" }
      );
    if (error) throw error;
  } catch (dbErr) {
    console.error(`[Summarize Thread] Upsert failed for thread ${dbThreadId}:`, dbErr);
    throw new Error(`Database error saving thread summary: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
  }
}

/**
 * Syncs all messages of a specific Gmail thread from the Gmail API.
 * Ensures the thread is fully populated in the local database.
 */
export async function syncGmailThread(accountId: string, gmailThreadId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error("Database connection unavailable.");

  // 1. Refresh token
  const accessToken = await refreshGmailAccessTokenIfNeeded(accountId);

  // 2. Fetch thread details from Gmail
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${gmailThreadId}?format=full`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch thread ${gmailThreadId} from Gmail: ${text}`);
  }

  const threadData = await response.json();
  const gmailMessages = threadData.messages || [];

  if (gmailMessages.length === 0) return;

  // 3. Find the latest message date in the threadData to set last_message_at correctly
  let maxReceivedAt = new Date(0).toISOString();
  for (const msg of gmailMessages) {
    const internalDateMs = Number(msg.internalDate);
    const msgReceivedAt = !isNaN(internalDateMs) && internalDateMs > 0
      ? new Date(internalDateMs).toISOString()
      : new Date().toISOString();
    if (msgReceivedAt > maxReceivedAt) {
      maxReceivedAt = msgReceivedAt;
    }
  }

  // 4. Upsert thread record
  const { data: dbThread, error: threadError } = await supabaseAdmin
    .from("email_threads")
    .upsert(
      {
        gmail_account_id: accountId,
        gmail_thread_id: gmailThreadId,
        last_message_at: maxReceivedAt,
      },
      {
        onConflict: "gmail_account_id,gmail_thread_id",
      }
    )
    .select("id")
    .single();

  if (threadError || !dbThread) {
    throw new Error(`Failed to upsert thread ${gmailThreadId}: ${threadError?.message}`);
  }

  // 5. Query existing messages in the DB for this thread to avoid redundant inserts
  const { data: existingEmails } = await supabaseAdmin
    .from("emails")
    .select("gmail_message_id, labels")
    .eq("thread_id", dbThread.id);

  const existingMap = new Map<string, string[]>();
  existingEmails?.forEach((e) => {
    existingMap.set(e.gmail_message_id, e.labels || []);
  });

  const emailsToSummarize: { emailId: string; subject: string; bodyText: string }[] = [];

  // 6. Process messages in thread
  for (const msg of gmailMessages) {
    const headers = msg.payload?.headers || [];
    const subject = getHeaderValue(headers, "subject");
    const fromRaw = getHeaderValue(headers, "from");
    const fromAddress = parseFromAddress(fromRaw);

    if (!fromAddress) continue;

    const toAddresses = parseRecipientAddresses(getHeaderValue(headers, "to"));
    const ccAddresses = parseRecipientAddresses(getHeaderValue(headers, "cc"));
    const bccAddresses = parseRecipientAddresses(getHeaderValue(headers, "bcc"));
    const inReplyTo = getHeaderValue(headers, "in-reply-to");

    const referencesRaw = getHeaderValue(headers, "references");
    const referencesHeader = referencesRaw
      ? referencesRaw.split(/\s+/).map((r) => r.trim()).filter(Boolean)
      : [];

    const internalDateMs = Number(msg.internalDate);
    const receivedAt = !isNaN(internalDateMs) && internalDateMs > 0
      ? new Date(internalDateMs).toISOString()
      : new Date().toISOString();

    const body = parseMessageBody(msg.payload);
    const labels = msg.labelIds || [];

    const existingLabels = existingMap.get(msg.id);
    const hasChanged = !existingLabels || JSON.stringify(existingLabels.sort()) !== JSON.stringify(labels.sort());

    if (hasChanged) {
      const emailPayload = {
        gmail_account_id: accountId,
        thread_id: dbThread.id,
        gmail_message_id: msg.id,
        from_address: fromAddress,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses,
        bcc_addresses: bccAddresses,
        subject: subject || "(No Subject)",
        body_text: body.text || null,
        body_html: body.html || null,
        labels: labels,
        in_reply_to: inReplyTo || null,
        references_header: referencesHeader,
        received_at: receivedAt,
      };

      const { data: dbEmail, error: emailError } = await supabaseAdmin
        .from("emails")
        .upsert(emailPayload, {
          onConflict: "gmail_account_id,gmail_message_id",
        })
        .select("id")
        .single();

      if (emailError) {
        console.error(`[syncGmailThread] Failed to upsert email ${msg.id}:`, emailError.message);
        continue;
      }

      if (dbEmail?.id && !existingLabels) {
        emailsToSummarize.push({
          emailId: dbEmail.id,
          subject: subject || "(No Subject)",
          bodyText: body.text || "",
        });
      }
    }
  }

  // 7. Summarize and save emails and the thread in the background
  if (emailsToSummarize.length > 0) {
    Promise.resolve().then(async () => {
      for (const item of emailsToSummarize) {
        if (getQuotaStatus().aiQuotaExceeded) {
          console.warn("[syncGmailThread Summarization] AI Quota exceeded, skipping remaining email summaries in background.");
          break;
        }
        try {
          await summarizeAndSaveEmail(item.emailId, item.subject, item.bodyText);
        } catch (e) {
          console.error(`[syncGmailThread Summarization] Email ${item.emailId}:`, e);
        }
      }
      try {
        if (!getQuotaStatus().aiQuotaExceeded) {
          await summarizeAndSaveThread(dbThread.id);
        }
      } catch (e) {
        console.error(`[syncGmailThread Summarization] Thread ${dbThread.id}:`, e);
      }
    }).catch((e) => console.error("[syncGmailThread Summarization] Background error:", e));
  }
}

/**
 * Run email categorization in the background after import completes.
 * Updates category counts progressively.
 */
async function runBackgroundCategorization(accountId: string): Promise<void> {
  if (!supabaseAdmin) return;
  console.log(`[Gmail Sync Phase 2] Starting email categorization for ${accountId}`);
  
  try {
    // Left join email_categories to find emails lacking category
    const { data: emailsRaw, error: fetchErr } = await supabaseAdmin
      .from("emails")
      .select("id, subject, from_address, body_text, labels, email_categories(email_id)")
      .eq("gmail_account_id", accountId);
      
    if (fetchErr || !emailsRaw) {
      console.error("[Gmail Sync Phase 2] Failed to fetch emails for categorization:", fetchErr?.message);
      return;
    }
    
    const uncategorized = emailsRaw.filter((e: any) => {
      if (!e.email_categories) return true;
      if (Array.isArray(e.email_categories) && e.email_categories.length === 0) return true;
      return false;
    });
    
    console.log(`[Gmail Sync Phase 2] Found ${uncategorized.length} uncategorized emails for ${accountId}`);
    if (uncategorized.length === 0) return;
    
    const categoriesPayloads: any[] = [];
    for (const e of uncategorized) {
      const category = classifyEmailCategoryLocal(
        e.labels || [],
        e.subject || "(No Subject)",
        e.from_address || "",
        e.body_text || ""
      );
      categoriesPayloads.push({
        email_id: e.id,
        category,
        confidence_score: 0.75,
        reasoning: "Auto-classified during post-sync phase 2 based on labels and content keywords",
      });
    }
    
    // Bulk upsert categories in chunks of 200 to show progressive updates
    const BATCH_SIZE = 200;
    let categorizedCount = 0;
    for (let i = 0; i < categoriesPayloads.length; i += BATCH_SIZE) {
      const chunk = categoriesPayloads.slice(i, i + BATCH_SIZE);
      const { error: upsertErr } = await supabaseAdmin
        .from("email_categories")
        .upsert(chunk, { onConflict: "email_id" });
        
      if (upsertErr) {
        console.error(`[Gmail Sync Phase 2] Bulk categorization upsert failed at offset ${i}:`, upsertErr.message);
      } else {
        categorizedCount += chunk.length;
        console.log(`[Gmail Sync Phase 2] Categorized ${categorizedCount}/${categoriesPayloads.length} emails...`);
      }
    }
    console.log(`[Gmail Sync Phase 2] Categorization completed for ${categorizedCount} emails.`);
  } catch (err) {
    console.error("[Gmail Sync Phase 2] Categorization process failed:", err);
  }
}

/**
 * Run AI summaries in the background only.
 * Skip already summarized emails.
 * Respect Gemini quotas and stop retry storms.
 */
async function runBackgroundSummarization(accountId: string): Promise<void> {
  if (!supabaseAdmin) return;
  console.log(`[Gmail Sync Phase 3] Starting AI summarization for ${accountId}`);
  
  try {
    // 1. Fetch unsummarized emails (only IMPORTANT or INBOX emails)
    const { data: emailsRaw, error: fetchErr } = await supabaseAdmin
      .from("emails")
      .select("id, subject, body_text, labels, thread_id, email_summaries(email_id)")
      .eq("gmail_account_id", accountId);
      
    if (fetchErr || !emailsRaw) {
      console.error("[Gmail Sync Phase 3] Failed to fetch emails for summarization:", fetchErr?.message);
      return;
    }
    
    const unsummarizedEmails = emailsRaw.filter((e: any) => {
      const hasSummary = e.email_summaries && (!Array.isArray(e.email_summaries) || e.email_summaries.length > 0);
      if (hasSummary) return false;
      
      const labels = e.labels || [];
      const isImportant = labels.includes("IMPORTANT") || labels.includes("STARRED");
      const isInbox = labels.includes("INBOX");
      return isImportant || isInbox;
    });
    
    console.log(`[Gmail Sync Phase 3] Found ${unsummarizedEmails.length} emails requiring AI summaries for ${accountId}`);
    
    // 2. Fetch unsummarized threads
    const { data: threadsRaw, error: fetchThreadsErr } = await supabaseAdmin
      .from("email_threads")
      .select("id, thread_summaries(thread_id)")
      .eq("gmail_account_id", accountId);
      
    if (fetchThreadsErr || !threadsRaw) {
      console.error("[Gmail Sync Phase 3] Failed to fetch threads for summarization:", fetchThreadsErr?.message);
      return;
    }
    
    const unsummarizedThreads = threadsRaw.filter((t: any) => {
      const hasSummary = t.thread_summaries && (!Array.isArray(t.thread_summaries) || t.thread_summaries.length > 0);
      return !hasSummary;
    });
    
    console.log(`[Gmail Sync Phase 3] Found ${unsummarizedThreads.length} threads requiring AI summaries for ${accountId}`);
    
    // 3. Process email summaries sequentially
    for (const email of unsummarizedEmails) {
      if (getQuotaStatus().aiQuotaExceeded) {
        console.warn("[Gmail Sync Phase 3] AI Quota exceeded, stopping email summarization background task.");
        return;
      }
      
      try {
        await summarizeAndSaveEmail(email.id, email.subject || "(No Subject)", email.body_text || "");
        await new Promise((r) => setTimeout(r, 1000));
        
        await generateAndSaveEmailEmbedding(email.id, email.thread_id, email.subject || "(No Subject)", email.body_text || "");
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[Gmail Sync Phase 3] Summarization failed for email ${email.id}:`, err);
      }
    }
    
    // 4. Process thread summaries
    for (const thread of unsummarizedThreads) {
      if (getQuotaStatus().aiQuotaExceeded) {
        console.warn("[Gmail Sync Phase 3] AI Quota exceeded, stopping thread summarization background task.");
        return;
      }
      
      try {
        await summarizeAndSaveThread(thread.id);
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        console.error(`[Gmail Sync Phase 3] Summarization failed for thread ${thread.id}:`, err);
      }
    }
    
    console.log("[Gmail Sync Phase 3] Summarization phase completed.");
  } catch (err) {
    console.error("[Gmail Sync Phase 3] Summarization process failed:", err);
  }
}
