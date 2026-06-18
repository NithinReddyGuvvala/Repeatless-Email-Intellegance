/**
 * backfill_summaries_v2.mjs
 * 
 * Generates AI summaries for emails that don't have one yet.
 * Runs 1 email at a time (sequential) with 2s delay to stay within Gemini free-tier rate limits.
 * 
 * Usage: 
 *   node backfill_summaries_v2.mjs              # Process up to 50 emails
 *   node backfill_summaries_v2.mjs --limit 100  # Process up to 100 emails
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = "https://nrkemmxqzcsptivedvyk.supabase.co";
let SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  try {
    const envContent = readFileSync(".env.local", "utf8");
    const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)/);
    if (match) SERVICE_KEY = match[1].trim();
  } catch (e) { /* no .env.local */ }
}
const db = createClient(SUPABASE_URL, SERVICE_KEY);
 
// Parse CLI args
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const MAX_EMAILS = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 50;

// Load Gemini API key from env or .env.local
let GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  try {
    const envContent = readFileSync(".env.local", "utf8");
    const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.+)/);
    if (match) GEMINI_API_KEY = match[1].trim();
  } catch (e) { /* no .env.local */ }
}

const DELAY_BETWEEN_REQUESTS_MS = 8000; // 8s = ~7.5 RPM, within gemini-2.0-flash-lite free tier (15 RPM)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function summarizeEmail(subject, bodyText) {
  const truncatedBody = (bodyText || "").slice(0, 1500);
  const prompt = `Summarize this email in 1-2 sentences. Be concise and factual.

Subject: ${subject || "(No Subject)"}

Body:
${truncatedBody || "(empty body)"}

Summary:`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 100, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const code = err?.error?.code || response.status;
    const msg = err?.error?.message || "Unknown error";
    throw new Error(`Gemini ${code}: ${msg.slice(0, 100)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return text.trim();
}

async function main() {
  console.log(`=== AI Summary Backfill (sequential, limit: ${MAX_EMAILS}) ===\n`);

  if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in environment or .env.local");
    process.exit(1);
  }
  console.log("✅ Gemini API key loaded\n");

  // Check current counts
  const { count: totalEmails } = await db.from("emails").select("id", { count: "exact", head: true });
  const { count: existingSummaries } = await db.from("email_summaries").select("email_id", { count: "exact", head: true });

  console.log(`Total emails:       ${totalEmails}`);
  console.log(`Existing summaries: ${existingSummaries}`);
  console.log(`Need summaries:     ${totalEmails - existingSummaries}`);
  console.log(`Will process:       up to ${MAX_EMAILS}\n`);

  if (existingSummaries >= totalEmails) {
    console.log("✅ All emails already have summaries.");
    return;
  }

  // Build set of already-summarized email IDs
  const summarizedIds = new Set();
  let page = 0;
  while (true) {
    const { data: sums } = await db
      .from("email_summaries")
      .select("email_id")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!sums || sums.length === 0) break;
    sums.forEach(s => summarizedIds.add(s.email_id));
    page++;
    if (sums.length < 1000) break;
  }

  // Fetch candidate emails: prioritize IMPORTANT, then INBOX, then newest
  const { data: importantEmails } = await db
    .from("emails")
    .select("id, subject, body_text, from_address")
    .contains("labels", ["IMPORTANT"])
    .order("received_at", { ascending: false })
    .limit(MAX_EMAILS * 2);

  const { data: inboxEmails } = await db
    .from("emails")
    .select("id, subject, body_text, from_address")
    .contains("labels", ["INBOX"])
    .order("received_at", { ascending: false })
    .limit(MAX_EMAILS * 2);

  const seen = new Set();
  const toProcess = [];
  for (const email of [...(importantEmails || []), ...(inboxEmails || [])]) {
    if (seen.has(email.id) || summarizedIds.has(email.id)) continue;
    seen.add(email.id);
    toProcess.push(email);
    if (toProcess.length >= MAX_EMAILS) break;
  }

  console.log(`Processing ${toProcess.length} emails sequentially (${DELAY_BETWEEN_REQUESTS_MS / 1000}s delay each)...\n`);

  let succeeded = 0;
  let failed = 0;
  let rateLimitHits = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const email = toProcess[i];
    process.stdout.write(`[${i + 1}/${toProcess.length}] Summarizing "${(email.subject || "(No Subject)").slice(0, 40)}"...`);

    try {
      const summary = await summarizeEmail(email.subject, email.body_text);
      const { error } = await db
        .from("email_summaries")
        .upsert({ email_id: email.id, summary_text: summary, summary_type: "brief" }, { onConflict: "email_id" });

      if (error) {
        console.log(` ❌ DB: ${error.message}`);
        failed++;
      } else {
        console.log(` ✅ done`);
        succeeded++;
      }
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("429")) {
        rateLimitHits++;
        console.log(` ⏳ Rate limit, waiting 15s...`);
        await sleep(15000); // Extra wait on rate limit
        i--; // Retry this email
        continue;
      }
      console.log(` ❌ ${msg.slice(0, 80)}`);
      failed++;
    }

    // Delay between requests
    if (i < toProcess.length - 1) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  console.log("\n");

  // Final count
  const { count: finalSummaries } = await db.from("email_summaries").select("email_id", { count: "exact", head: true });

  console.log("=== RESULTS ===");
  console.log(`Emails processed:   ${toProcess.length}`);
  console.log(`Succeeded:          ${succeeded}`);
  console.log(`Failed:             ${failed}`);
  console.log(`Rate limit hits:    ${rateLimitHits}`);
  console.log(`Total summaries:    ${finalSummaries}`);

  if (finalSummaries > 0) {
    console.log("\n✅ Dashboard 'AI Summaries' count will now show correctly.");
    console.log(`   Run again to generate more: node backfill_summaries_v2.mjs --limit ${MAX_EMAILS}`);
  }
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
