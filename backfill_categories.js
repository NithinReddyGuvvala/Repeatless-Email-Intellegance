import { createClient } from "@supabase/supabase-js";
import fs from "fs";

let supabaseUrl = "";
let serviceRoleKey = "";

if (fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf-8");
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > -1) {
      const k = trimmed.substring(0, idx).trim();
      const v = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (k === "VITE_SUPABASE_URL" || k === "SUPABASE_URL") {
        supabaseUrl = v;
      }
      if (k === "SUPABASE_SERVICE_ROLE_KEY") {
        serviceRoleKey = v;
      }
    }
  }
}

supabaseUrl = supabaseUrl || "https://nrkemmxqzcsptivedvyk.supabase.co";
supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
serviceRoleKey = serviceRoleKey || "";

const supabase = createClient(supabaseUrl, serviceRoleKey);

function classifyEmailCategory(
  labels = [],
  subject = "",
  fromAddress = "",
  bodyText = ""
) {
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

  return "Work";
}

async function run() {
  console.log("Fetching emails...");
  const { data: emails, error: eErr } = await supabase
    .from("emails")
    .select("id, labels, subject, from_address, body_text");

  if (eErr || !emails) {
    console.error("Error fetching emails:", eErr);
    return;
  }

  console.log(`Classifying ${emails.length} emails...`);
  const records = [];
  for (const email of emails) {
    const category = classifyEmailCategory(email.labels, email.subject, email.from_address, email.body_text);
    records.push({
      email_id: email.id,
      category: category,
      confidence_score: 1.0,
      reasoning: "Rule-based category classification during backfill"
    });
  }

  console.log("Upserting categories in batches...");
  // Upsert in batches of 200
  const batchSize = 200;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error: iErr } = await supabase
      .from("email_categories")
      .upsert(batch, { onConflict: "email_id" });
    if (iErr) {
      console.error(`Error upserting batch starting at index ${i}:`, iErr);
    } else {
      console.log(`Upserted batch starting at index ${i}`);
    }
  }
  console.log("Backfill complete!");
}

run();
