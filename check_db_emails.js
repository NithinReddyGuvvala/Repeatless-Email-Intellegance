import { createClient } from "@supabase/supabase-js";

import { readFileSync } from "fs";
const supabaseUrl = "https://nrkemmxqzcsptivedvyk.supabase.co";
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  try {
    const envContent = readFileSync(".env.local", "utf8");
    const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)/);
    if (match) serviceRoleKey = match[1].trim();
  } catch (e) { /* no .env.local */ }
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  console.log("Checking emails...");

  // 1. Total emails count
  const { count: totalEmails, error: eErr } = await supabase
    .from("emails")
    .select("*", { count: "exact", head: true });
  console.log("Total emails in DB:", totalEmails, eErr || "");

  // 2. Sample emails (newest and oldest)
  const { data: newestEmails } = await supabase
    .from("emails")
    .select("id, subject, received_at, from_address")
    .order("received_at", { ascending: false })
    .limit(5);
  console.log("Newest emails:\n", newestEmails);

  const { data: oldestEmails } = await supabase
    .from("emails")
    .select("id, subject, received_at, from_address")
    .order("received_at", { ascending: true })
    .limit(5);
  console.log("Oldest emails:\n", oldestEmails);

  // 3. Search specifically for "TCS" in subject or body
  const { data: tcsEmails } = await supabase
    .from("emails")
    .select("id, subject, received_at, from_address")
    .ilike("subject", "%TCS%")
    .limit(5);
  console.log("TCS emails:\n", tcsEmails);

  // 4. Total embeddings count
  const { count: totalEmbeds, error: emErr } = await supabase
    .from("embeddings")
    .select("*", { count: "exact", head: true });
  console.log("Total embeddings in DB:", totalEmbeds, emErr || "");

  // 5. Emails with embeddings count
  const { data: sampleEmbeds } = await supabase
    .from("embeddings")
    .select("email_id")
    .limit(5);
  console.log("Sample embedded email IDs:", sampleEmbeds);
}

check();
