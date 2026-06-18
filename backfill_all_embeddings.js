import { createClient } from "@supabase/supabase-js";
import fs from "fs";

let apiKey = "";
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
      if (k === "GEMINI_API_KEY") {
        apiKey = v;
      }
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

if (!apiKey || !serviceRoleKey) {
  console.error("Missing GEMINI_API_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function backfill() {
  console.log("Fetching emails list from Supabase...");
  const { data: emails, error: eErr } = await supabase
    .from("emails")
    .select("id, thread_id, subject, body_text");

  if (eErr || !emails) {
    console.error("Failed to retrieve emails:", eErr);
    process.exit(1);
  }

  console.log(`Retrieved ${emails.length} total emails.`);

  console.log("Fetching existing embeddings...");
  const { data: embeds, error: emErr } = await supabase
    .from("embeddings")
    .select("email_id")
    .not("email_id", "is", null);

  if (emErr || !embeds) {
    console.error("Failed to retrieve embeddings list:", emErr);
    process.exit(1);
  }

  const existingSet = new Set(embeds.map(e => e.email_id).filter(Boolean));
  const missing = emails.filter(e => !existingSet.has(e.id));

  console.log(`Found ${missing.length} emails missing vector embeddings.`);
  if (missing.length === 0) {
    console.log("Everything is already backfilled! Exiting.");
    return;
  }

  console.log("Starting embedding generation in rate-limited sequential batches...");
  let count = 0;
  const total = missing.length;

  for (const email of missing) {
    count++;
    console.log(`[${count}/${total}] Embedding email id: ${email.id} (Subject: "${(email.subject || "").slice(0, 30)}...")`);

    const textToEmbed = `Subject: ${email.subject || ""}\nContent: ${(email.body_text || "").slice(0, 4000)}`;
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

    try {
      const response = await fetch(embedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: textToEmbed }] },
          outputDimensionality: 768
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Failed to generate embedding for ${email.id}: HTTP ${response.status} - ${errText}`);
        if (response.status === 429) {
          console.log("Rate limit hit! Sleeping for 15 seconds...");
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
        continue;
      }

      const resJson = await response.json();
      const vector = resJson.embedding?.values;

      if (vector && vector.length === 768) {
        const { error: insErr } = await supabase.from("embeddings").insert({
          email_id: email.id,
          thread_id: email.thread_id,
          chunk_index: 0,
          content: textToEmbed.slice(0, 1000),
          embedding: vector
        });

        if (insErr) {
          console.error(`Failed to insert embedding for ${email.id} into database:`, insErr.message);
        } else {
          console.log(`Successfully embedded and saved email id: ${email.id}`);
        }
      } else {
        console.error(`Unexpected vector format returned from API for email ${email.id}`);
      }

      // Small sleep to be nice to API limits (e.g. 50ms)
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      console.error(`Exception occurred for email ${email.id}:`, err);
    }
  }

  console.log("Backfill operation complete!");
}

backfill();
