import { readFileSync } from "fs";

// Parse .env.local manually at the absolute top of the module file execution
try {
  const envContent = readFileSync(".env.local", "utf8");
  envContent.split("\n").forEach(line => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let val = parts.slice(1).join("=").trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
  console.log("[Debug Sync] Loaded environment variables from .env.local");
} catch (e) {
  console.error("[Debug Sync] Failed to read .env.local:", e);
}

import { test } from "vitest";

test("diagnose sync process", async () => {
  console.log("[Debug Sync] Starting diagnostic...");
  
  // Dynamically import to ensure process.env was populated first
  const { supabaseAdmin } = await import("../lib/supabase/server.server");
  const { runBackgroundSyncProcess } = await import("../lib/gmail/sync");

  if (!supabaseAdmin) {
    console.error("[Debug Sync] supabaseAdmin is not defined!");
    return;
  }

  // 1. Get first account
  const { data: accounts, error: aErr } = await supabaseAdmin
    .from("gmail_accounts")
    .select("id, email_address, gmail_history_id")
    .limit(1);

  if (aErr || !accounts || accounts.length === 0) {
    console.error("[Debug Sync] No Gmail accounts found:", aErr?.message);
    return;
  }

  const account = accounts[0];
  console.log("[Debug Sync] Selected account:", account.email_address, "ID:", account.id);

  // 2. Trigger sync process
  try {
    await runBackgroundSyncProcess(account.id);
    console.log("[Debug Sync] Sync process finished execution.");
  } catch (err) {
    console.error("[Debug Sync] Error during sync process:", err);
  }

  // 3. Query emails count at the end
  const { count, error: cErr } = await supabaseAdmin
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("gmail_account_id", account.id);
  console.log("[Debug Sync] Final emails count in database:", count, cErr?.message || "");
}, 120000); // 2 minutes timeout
