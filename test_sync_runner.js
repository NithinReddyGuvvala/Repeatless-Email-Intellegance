import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// 1. Load env vars
let supabaseUrl = "";
let serviceRoleKey = "";
try {
  const envContent = readFileSync(".env.local", "utf8");
  const urlMatch = envContent.match(/SUPABASE_URL\s*=\s*(.+)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)/);
  if (keyMatch) serviceRoleKey = keyMatch[1].trim();
  
  // Clean quotes and rest/v1 paths
  if (supabaseUrl.startsWith('"') || supabaseUrl.startsWith("'")) supabaseUrl = supabaseUrl.slice(1, -1);
  if (serviceRoleKey.startsWith('"') || serviceRoleKey.startsWith("'")) serviceRoleKey = serviceRoleKey.slice(1, -1);
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
} catch (e) {
  console.error("Failed to read .env.local:", e);
  process.exit(1);
}

console.log("Supabase URL:", supabaseUrl);
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  // Get first account
  const { data: accounts } = await supabase.from("gmail_accounts").select("*").limit(1);
  if (!accounts || accounts.length === 0) {
    console.error("No Gmail accounts found.");
    return;
  }
  
  const account = accounts[0];
  console.log("Found account:", account.email_address);
  
  // Get access token (or refresh it)
  let accessToken = account.access_token;
  const tokenExpiresAt = account.token_expires_at ? new Date(account.token_expires_at) : new Date(0);
  const now = new Date();
  
  if (tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log("Refreshing token...");
    // we can get client credentials to refresh manually
    const clientContent = readFileSync(".env.local", "utf8");
    const idMatch = clientContent.match(/GOOGLE_CLIENT_ID\s*=\s*(.+)/);
    const secretMatch = clientContent.match(/GOOGLE_CLIENT_SECRET\s*=\s*(.+)/);
    let clientId = idMatch ? idMatch[1].trim() : "";
    let clientSecret = secretMatch ? secretMatch[1].trim() : "";
    if (clientId.startsWith('"') || clientId.startsWith("'")) clientId = clientId.slice(1, -1);
    if (clientSecret.startsWith('"') || clientSecret.startsWith("'")) clientSecret = clientSecret.slice(1, -1);
    
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    
    if (refreshResponse.ok) {
      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;
      console.log("Token refreshed successfully.");
    } else {
      console.error("Failed to refresh token:", await refreshResponse.text());
      return;
    }
  }
  
  // Try fetching some messages from Gmail
  console.log("Listing messages from Gmail...");
  const messagesResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!messagesResponse.ok) {
    console.error("Failed to list messages:", await messagesResponse.text());
    return;
  }
  
  const messagesData = await messagesResponse.json();
  const messages = messagesData.messages || [];
  console.log(`Fetched ${messages.length} messages from Gmail.`);
  
  if (messages.length === 0) return;
  
  // Trial details fetch
  const testMsg = messages[0];
  console.log(`Fetching details for test message ${testMsg.id}...`);
  const detailsRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${testMsg.id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!detailsRes.ok) {
    console.error("Failed to fetch message details:", await detailsRes.text());
    return;
  }
  
  const details = await detailsRes.json();
  const internalDateMs = Number(details.internalDate);
  const receivedAt = !isNaN(internalDateMs) && internalDateMs > 0
    ? new Date(internalDateMs).toISOString()
    : new Date().toISOString();
    
  console.log(`Test message subject: ${details.payload?.headers?.find(h => h.name.toLowerCase() === 'subject')?.value}`);
  
  // Try upserting a thread
  console.log("Upserting thread into DB...");
  const threadUpsert = await supabase
    .from("email_threads")
    .upsert({
      gmail_account_id: account.id,
      gmail_thread_id: testMsg.threadId,
      last_message_at: receivedAt,
    }, { onConflict: "gmail_account_id,gmail_thread_id" })
    .select("id, gmail_thread_id");
    
  console.log("Thread upsert result:", threadUpsert.data, "Error:", threadUpsert.error);
}

run();
