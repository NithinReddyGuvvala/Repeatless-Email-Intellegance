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
serviceRoleKey = serviceRoleKey || "";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function test() {
  console.log("Fetching a sample email...");
  const { data: emails, error: eErr } = await supabase.from("emails").select("id, thread_id, subject, body_text").limit(1);
  if (eErr || !emails || emails.length === 0) {
    console.error("No emails found:", eErr);
    return;
  }
  const email = emails[0];
  console.log("Found email ID:", email.id);

  const textToEmbed = `Subject: ${email.subject}\n\nContent: ${email.body_text || ""}`;
  console.log("Generating embedding...");
  const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const response = await fetch(embedUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: {
        parts: [{ text: textToEmbed.slice(0, 5000) }]
      },
      outputDimensionality: 768
    })
  });

  if (!response.ok) {
    console.error("Embedding generation failed:", await response.text());
    return;
  }

  const embedData = await response.json();
  const vector = embedData.embedding?.values;
  console.log("Vector length:", vector?.length);

  console.log("Inserting embedding into DB...");
  const { data: inserted, error: iErr } = await supabase.from("embeddings").insert({
    email_id: email.id,
    thread_id: email.thread_id,
    chunk_index: 0,
    content: textToEmbed.slice(0, 500),
    embedding: vector
  }).select("*");

  console.log("Inserted:", inserted, "Error:", iErr);
}

test();
