/**
 * Backfill memory extraction for existing sessions.
 * Runs the extract-memory Edge Function for the most recent completed
 * session per user, in batches to avoid rate-limiting.
 *
 * Usage: node scripts/backfill-memory.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const envLines = readFileSync(envPath, "utf-8").split("\n");
for (const line of envLines) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/extract-memory`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local");
  process.exit(1);
}

// ── Supabase REST helper ─────────────────────────────────────────────────────
async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Delay helper ─────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching sessions...");

  // Fetch all sessions with message_count > 0, ordered oldest-first
  const sessions = await supabaseGet(
    "sessions?select=id,anonymous_id,started_at,message_count&message_count=gt.0&order=started_at.asc"
  );

  console.log(`Found ${sessions.length} sessions with messages.`);

  // Keep only the most recent session per user
  const latestPerUser = new Map();
  for (const session of sessions) {
    latestPerUser.set(session.anonymous_id, session);
  }

  const targets = Array.from(latestPerUser.values());
  console.log(`Processing ${targets.length} users (most recent session each).\n`);

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const { id: sessionId, anonymous_id: anonymousId } = targets[i];
    const label = `[${i + 1}/${targets.length}]`;

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ anonymousId, sessionId }),
      });

      const body = await res.json();

      if (body.skipped) {
        console.log(`${label} SKIPPED  ${sessionId} (no messages)`);
        skipped++;
      } else if (body.ok) {
        console.log(`${label} OK       ${sessionId}`);
        succeeded++;
      } else {
        console.log(`${label} FAILED   ${sessionId} — reason: ${body.reason}`);
        failed++;
      }
    } catch (err) {
      console.error(`${label} ERROR    ${sessionId} — ${err.message}`);
      failed++;
    }

    // 1.5s between calls to stay within Anthropic rate limits
    if (i < targets.length - 1) await delay(1500);
  }

  console.log(`
──────────────────────────────────────
  BACKFILL COMPLETE
──────────────────────────────────────
  Succeeded: ${succeeded}
  Skipped:   ${skipped}
  Failed:    ${failed}
──────────────────────────────────────`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
