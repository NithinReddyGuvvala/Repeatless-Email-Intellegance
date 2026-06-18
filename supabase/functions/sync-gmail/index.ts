// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

// Retrieve environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  // Only allow POST or GET request depending on cron setup (typically GET or POST is fine)
  console.log(`[Sync Gmail Cron] Received trigger request: ${req.method}`);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration environment variables.");
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error("Missing Google OAuth client credentials.");
    }

    // 1. Fetch all connected Gmail accounts
    const { data: accounts, error: accountsError } = await supabase
      .from("gmail_accounts")
      .select("id, email_address, refresh_token, access_token, token_expires_at, gmail_history_id");

    if (accountsError) {
      throw new Error(`Failed to query Gmail accounts: ${accountsError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No connected Gmail accounts found." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[Sync Gmail Cron] Found ${accounts.length} account(s) to synchronize.`);
    const syncResults = [];

    // 2. Process each account sequentially (continue even if one fails)
    for (const account of accounts) {
      try {
        console.log(`[Sync Gmail Cron] Syncing account: ${account.email_address}`);
        const result = await syncAccount(account);
        syncResults.push({
          email: account.email_address,
          success: true,
          syncedCount: result.syncedCount,
          type: result.type,
        });
      } catch (err) {
        console.error(`[Sync Gmail Cron] Failed to sync account ${account.email_address}:`, err);
        syncResults.push({
          email: account.email_address,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results: syncResults }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (globalError) {
    console.error("[Sync Gmail Cron] Global process error:", globalError);
    return new Response(JSON.stringify({ success: false, error: globalError instanceof Error ? globalError.message : String(globalError) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// Sync logic for a single Gmail account
async function syncAccount(account: any) {
  // A. Refresh token if expired
  const accessToken = await refreshAccessTokenIfNeeded(account);

  // B. Load details for incremental vs full
  const historyId = account.gmail_history_id;
  
  // Quick count to check if we have existing emails
  const { count, error: countError } = await supabase
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("gmail_account_id", account.id);

  const hasEmails = !countError && typeof count === "number" && count > 0;
  
  let messagesToSync: { id: string; threadId: string }[] = [];
  let useIncremental = false;

  // C. Incremental fetch using historyId
  if (historyId && hasEmails) {
    try {
      console.log(`[Sync Deno] Attempting incremental sync using historyId: ${historyId}`);
      const historyUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
      historyUrl.searchParams.set("startHistoryId", String(historyId));
      historyUrl.searchParams.set("maxResults", "100");

      const response = await fetch(historyUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const msgMap = new Map<string, string>();
        if (data.history) {
          for (const record of data.history) {
            if (record.messagesAdded) {
              for (const addition of record.messagesAdded) {
                if (addition.message?.id && addition.message?.threadId) {
                  msgMap.set(addition.message.id, addition.message.threadId);
                }
              }
            }
          }
        }
        messagesToSync = Array.from(msgMap.entries()).map(([id, threadId]) => ({ id, threadId }));
        useIncremental = true;
        console.log(`[Sync Deno] Incremental: found ${messagesToSync.length} new messages.`);
      } else {
        console.warn(`[Sync Deno] Incremental endpoint failed (${response.status}). Falling back to full.`);
      }
    } catch (err) {
      console.error("[Sync Deno] Incremental fetch error, falling back to full sync:", err);
    }
  }

  // D. Full sync list fallback
  if (!useIncremental) {
    console.log(`[Sync Deno] Performing full sync for latest messages.`);
    const messagesUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    messagesUrl.searchParams.set("maxResults", "100"); // Limit background cron check to latest 100 messages

    const response = await fetch(messagesUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list messages from Gmail API: ${await response.text()}`);
    }

    const data = await response.json();
    if (data.messages) {
      messagesToSync = data.messages;
    }
  }

  console.log(`[Sync Deno] Processing ${messagesToSync.length} messages.`);
  let syncedCount = 0;
  const emailsToSummarize = [];

  // E. Fetch message details and upsert
  for (const msg of messagesToSync) {
    try {
      const details = await fetchGmailMessageDetails(accessToken, msg.id);
      const headers = details.payload?.headers || [];
      const subject = getHeaderValue(headers, "subject") || "(No Subject)";
      const fromRaw = getHeaderValue(headers, "from");
      const fromAddress = parseFromAddress(fromRaw);

      if (!fromAddress) continue;

      const toAddresses = parseRecipientAddresses(getHeaderValue(headers, "to"));
      const ccAddresses = parseRecipientAddresses(getHeaderValue(headers, "cc"));
      const bccAddresses = parseRecipientAddresses(getHeaderValue(headers, "bcc"));
      const inReplyTo = getHeaderValue(headers, "in-reply-to");
      const referencesRaw = getHeaderValue(headers, "references");
      const referencesHeader = referencesRaw
        ? referencesRaw.split(/\s+/).map((r: string) => r.trim()).filter(Boolean)
        : [];

      const internalDateMs = Number(details.internalDate);
      const receivedAt = !isNaN(internalDateMs) && internalDateMs > 0
        ? new Date(internalDateMs).toISOString()
        : new Date().toISOString();

      const body = parseMessageBody(details.payload);
      const labels = details.labelIds || [];

      // E1. Upsert thread
      const { data: dbThread, error: threadError } = await supabase
        .from("email_threads")
        .upsert(
          {
            gmail_account_id: account.id,
            gmail_thread_id: msg.threadId,
            last_message_at: receivedAt,
          },
          { onConflict: "gmail_account_id,gmail_thread_id" }
        )
        .select("id")
        .single();

      if (threadError || !dbThread) {
        console.error(`[Sync Deno] Thread upsert failed for ${msg.threadId}:`, threadError?.message);
        continue;
      }

      // E2. Upsert email
      const emailPayload = {
        gmail_account_id: account.id,
        thread_id: dbThread.id,
        gmail_message_id: msg.id,
        from_address: fromAddress,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses,
        bcc_addresses: bccAddresses,
        subject,
        body_text: body.text || null,
        body_html: body.html || null,
        labels: labels,
        in_reply_to: inReplyTo || null,
        references_header: referencesHeader,
        received_at: receivedAt,
      };

      const { data: dbEmail, error: emailError } = await supabase
        .from("emails")
        .upsert(emailPayload, { onConflict: "gmail_account_id,gmail_message_id" })
        .select("id")
        .single();

      if (emailError) {
        console.error(`[Sync Deno] Email upsert failed for ${msg.id}:`, emailError.message);
        continue;
      }

      syncedCount++;

      if (dbEmail?.id) {
        emailsToSummarize.push({
          emailId: dbEmail.id,
          threadId: dbThread.id,
          subject,
          bodyText: body.text || "",
        });
      }
    } catch (msgError) {
      console.error(`[Sync Deno] Error syncing message ${msg.id}:`, msgError);
    }
  }

  // F. Update historyId and last synced timestamp
  try {
    const profile = await getGmailProfile(accessToken);
    await supabase
      .from("gmail_accounts")
      .update({
        gmail_history_id: profile.historyId ? Number(profile.historyId) : null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", account.id);
  } catch (profileErr) {
    console.error(`[Sync Deno] Failed to refresh profile for historyId update:`, profileErr);
    // Fallback to update timestamp only
    await supabase
      .from("gmail_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", account.id);
  }

  // G. Summaries trigger via Gemini API (Fire and forget optional step)
  if (GEMINI_API_KEY && emailsToSummarize.length > 0) {
    // Run summarization asynchronously in the Deno context or process a few
    for (const email of emailsToSummarize.slice(0, 5)) { // Limit summaries in background to prevent rate limits
      try {
        await summarizeEmailDeno(email.emailId, email.subject, email.bodyText);
      } catch (sumErr) {
        console.error(`[Sync Deno] Summarization error for email ${email.emailId}:`, sumErr);
      }
    }
  }

  return {
    syncedCount,
    type: useIncremental ? "incremental" : "full",
  };
}

// Helper: Refresh expired Google access token
async function refreshAccessTokenIfNeeded(account: any): Promise<string> {
  const tokenExpiresAt = account.token_expires_at ? new Date(account.token_expires_at) : new Date(0);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (tokenExpiresAt.getTime() - now.getTime() > bufferMs && account.access_token) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error("Refresh token missing from account record. Re-authorization required.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Google OAuth token: ${await response.text()}`);
  }

  const data = await response.json();
  const newExpiry = new Date();
  newExpiry.setSeconds(newExpiry.getSeconds() + data.expires_in);

  const { error } = await supabase
    .from("gmail_accounts")
    .update({
      access_token: data.access_token,
      token_expires_at: newExpiry.toISOString(),
    })
    .eq("id", account.id);

  if (error) {
    throw new Error(`Failed to save refreshed token to database: ${error.message}`);
  }

  return data.access_token;
}

// Helpers for Gmail fetching and parsing
async function fetchGmailMessageDetails(accessToken: string, messageId: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to load message details: ${await response.text()}`);
  }
  return response.json();
}

async function getGmailProfile(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${await response.text()}`);
  }
  return response.json();
}

function decodeBase64Url(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

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

function getHeaderValue(headers: any[], name: string): string {
  if (!headers) return "";
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : "";
}

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

function parseFromAddress(fromHeader: string): string {
  if (!fromHeader) return "";
  const emailRegex = /<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const match = emailRegex.exec(fromHeader);
  if (match) {
    return (match[1] || match[2]).trim().toLowerCase();
  }
  return fromHeader.trim().toLowerCase();
}

// Call Gemini 2.5 Flash to summarize email inside Edge Function
async function summarizeEmailDeno(emailId: string, subject: string, bodyText: string) {
  const prompt = `Write a short 1-2 sentence summary of the following email.
Subject: ${subject}
Content: ${bodyText.slice(0, 1500)}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) return;

  const data = await response.json();
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (summary) {
    await supabase.from("email_summaries").upsert({
      email_id: emailId,
      summary,
    }, { onConflict: "email_id" });
  }
}
