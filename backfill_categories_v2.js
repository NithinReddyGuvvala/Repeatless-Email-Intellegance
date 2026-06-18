/**
 * backfill_categories_v2.js
 * 
 * Backfills the email_categories table for ALL emails that don't have a category yet.
 * Uses the same deterministic classifyEmailCategory logic as sync.ts — no API calls.
 * Should complete in < 60 seconds for ~4,843 emails.
 * 
 * Usage: node backfill_categories_v2.js
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const SUPABASE_URL = "https://nrkemmxqzcsptivedvyk.supabase.co";
let SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  try {
    const envContent = fs.readFileSync(".env.local", "utf8");
    const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)/);
    if (match) SERVICE_KEY = match[1].trim();
  } catch (e) { /* no .env.local */ }
}
const db = createClient(SUPABASE_URL, SERVICE_KEY);

/** Mirrors the classifyEmailCategory function from actions.ts */
function classifyEmailCategory(labels = [], subject = "", fromAddress = "", bodyText = "") {
  const upperLabels = labels.map(l => l.toUpperCase());
  const textToSearch = `${subject} ${fromAddress} ${bodyText}`.toLowerCase();

  // 1. Finance keywords
  const financeKeywords = [
    "invoice", "bill", "receipt", "statement", "payment", "bank", "transaction",
    "tax", "refund", "checkout", "order", "salary", "stripe", "paypal", "finance",
    "credit card", "wire transfer", "purchase confirmation", "receipts", "billing"
  ];
  if (financeKeywords.some(kw => textToSearch.includes(kw))) return "Finance";

  // 2. Job keywords
  const jobKeywords = [
    "job", "resume", "cv", "interview", "hiring", "recruitment", "recruiter",
    "career", "offer letter", "apply", "applied", "applicant", "application status",
    "linkedin job", "workday", "job offer"
  ];
  if (jobKeywords.some(kw => textToSearch.includes(kw))) return "Job";

  // 3. Newsletter / Promotions
  if (upperLabels.includes("CATEGORY_PROMOTIONS") || upperLabels.includes("PROMOTIONS")) return "Newsletter";
  const newsletterKeywords = ["newsletter", "subscribe", "unsubscribe", "digest", "promo", "coupon", "marketing", "substack"];
  if (newsletterKeywords.some(kw => textToSearch.includes(kw))) return "Newsletter";

  // 4. Notification keywords / labels
  if (upperLabels.includes("CATEGORY_UPDATES") || upperLabels.includes("UPDATES")) return "Notification";
  const notificationKeywords = ["notification", "alert", "security alert", "sign-in", "verification", "otp", "confirm your", "welcome to"];
  if (notificationKeywords.some(kw => textToSearch.includes(kw))) return "Notification";

  // 5. Personal labels
  if (
    upperLabels.includes("CATEGORY_PERSONAL") ||
    upperLabels.includes("CATEGORY_SOCIAL") ||
    upperLabels.includes("SOCIAL") ||
    upperLabels.includes("PERSONAL")
  ) return "Personal";

  // 6. Work labels
  if (upperLabels.includes("CATEGORY_FORUMS") || upperLabels.includes("FORUMS")) return "Work";

  // Default
  return "Work";
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Categorization Backfill v2 ===\n");

  // 1. Count emails without categories
  const { count: totalEmails } = await db
    .from("emails")
    .select("id", { count: "exact", head: true });

  const { count: alreadyCategorized } = await db
    .from("email_categories")
    .select("email_id", { count: "exact", head: true });

  console.log(`Total emails: ${totalEmails}`);
  console.log(`Already categorized: ${alreadyCategorized}`);
  console.log(`Need to categorize: ${totalEmails - alreadyCategorized}\n`);

  if (totalEmails === alreadyCategorized) {
    console.log("✅ All emails already categorized. Nothing to do.");
    return;
  }

  // 2. Find email IDs that don't have categories yet
  const categorizedEmailIds = new Set();
  let catPage = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: cats } = await db
      .from("email_categories")
      .select("email_id")
      .range(catPage * PAGE_SIZE, (catPage + 1) * PAGE_SIZE - 1);
    if (!cats || cats.length === 0) break;
    cats.forEach(c => categorizedEmailIds.add(c.email_id));
    catPage++;
    if (cats.length < PAGE_SIZE) break;
  }
  console.log(`Found ${categorizedEmailIds.size} already-categorized email IDs`);

  // 3. Fetch all emails in batches and categorize
  let processed = 0;
  let inserted = 0;
  let errors = 0;
  const BATCH_SIZE = 500;
  let page = 0;

  while (true) {
    const { data: emails, error: fetchErr } = await db
      .from("emails")
      .select("id, labels, subject, from_address, body_text")
      .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1)
      .order("received_at", { ascending: false });

    if (fetchErr) {
      console.error("Error fetching emails:", fetchErr.message);
      break;
    }
    if (!emails || emails.length === 0) break;

    // Filter to only uncategorized
    const toProcess = emails.filter(e => !categorizedEmailIds.has(e.id));

    if (toProcess.length > 0) {
      // Build upsert batch
      const upsertBatch = toProcess.map(email => ({
        email_id: email.id,
        category: classifyEmailCategory(
          email.labels || [],
          email.subject || "",
          email.from_address || "",
          email.body_text || ""
        ),
        confidence_score: 0.75,
        reasoning: "Auto-classified during backfill based on labels and content keywords",
      }));

      const { error: upsertErr } = await db
        .from("email_categories")
        .upsert(upsertBatch, { onConflict: "email_id" });

      if (upsertErr) {
        console.error(`Error upserting batch (page ${page}):`, upsertErr.message);
        errors++;
      } else {
        inserted += toProcess.length;
      }
    }

    processed += emails.length;
    process.stdout.write(`\r  Progress: ${processed}/${totalEmails} processed, ${inserted} newly categorized, ${errors} batch errors`);

    page++;
    if (emails.length < BATCH_SIZE) break;

    // Small delay to avoid hammering Supabase
    await sleep(50);
  }

  console.log("\n");

  // 4. Verify result
  const { count: finalCount } = await db
    .from("email_categories")
    .select("email_id", { count: "exact", head: true });

  console.log(`\n=== RESULTS ===`);
  console.log(`Total emails:      ${totalEmails}`);
  console.log(`Categorized now:   ${finalCount}`);
  console.log(`Newly inserted:    ${inserted}`);
  console.log(`Coverage:          ${Math.round((finalCount / totalEmails) * 100)}%`);
  console.log(`Batch errors:      ${errors}`);

  // 5. Category distribution
  const { data: dist } = await db
    .from("email_categories")
    .select("category");

  const catCounts = {};
  (dist || []).forEach(r => { catCounts[r.category] = (catCounts[r.category] || 0) + 1; });
  console.log("\nCategory breakdown:");
  Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([cat, cnt]) => {
    console.log(`  ${cat.padEnd(15)} ${cnt} (${Math.round(cnt / finalCount * 100)}%)`);
  });

  if (finalCount >= totalEmails * 0.99) {
    console.log("\n✅ Categorization complete! Dashboard Categorized count will now show correctly.");
  } else {
    console.log(`\n⚠️  Only ${finalCount}/${totalEmails} categorized. Re-run to categorize remaining.`);
  }
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
