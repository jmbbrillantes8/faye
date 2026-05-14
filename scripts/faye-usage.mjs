/**
 * Faye Usage Dashboard
 * Queries Supabase for all key usage metrics and prints a formatted report.
 * Usage: node scripts/faye-usage.mjs
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local");
  process.exit(1);
}

// ── Supabase REST helper ─────────────────────────────────────────────────────
async function query(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error on ${path}: ${err}`);
  }
  const count = res.headers.get("content-range")?.split("/")[1] ?? null;
  const data = await res.json();
  return { data, count: count ? parseInt(count) : null };
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function isoToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isoStartOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Formatting helpers ───────────────────────────────────────────────────────
function pct(n, total) {
  if (!total) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function bar(n, max, width = 20) {
  const filled = max ? Math.round((n / max) * width) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function sep(label = "") {
  const line = "─".repeat(50);
  return label ? `\n${line}\n  ${label}\n${line}` : line;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🌿 Faye Usage Dashboard");
  console.log(`   Generated: ${new Date().toLocaleString()}`);

  // ── 1. Totals ──────────────────────────────────────────────────────────────
  const [{ count: totalSessions }, { count: totalMessages }] = await Promise.all([
    query("sessions?select=id"),
    query("messages?select=id"),
  ]);

  const { data: uniqueUserRows } = await query(
    "sessions?select=anonymous_id"
  );
  const uniqueUsers = new Set(uniqueUserRows.map((r) => r.anonymous_id)).size;

  console.log(sep("TOTALS"));
  console.log(`  Sessions:      ${totalSessions?.toLocaleString() ?? "?"}`);
  console.log(`  Messages:      ${totalMessages?.toLocaleString() ?? "?"}`);
  console.log(`  Unique users:  ${uniqueUsers.toLocaleString()}`);

  // ── 2. Active users ────────────────────────────────────────────────────────
  const [{ data: todaySessions }, { data: weekSessions }] = await Promise.all([
    query(`sessions?select=anonymous_id&started_at=gte.${isoToday()}`),
    query(`sessions?select=anonymous_id&started_at=gte.${isoStartOfWeek()}`),
  ]);

  const activeToday = new Set(todaySessions.map((r) => r.anonymous_id)).size;
  const activeWeek = new Set(weekSessions.map((r) => r.anonymous_id)).size;

  console.log(sep("ACTIVE USERS"));
  console.log(`  Today:         ${activeToday}`);
  console.log(`  This week:     ${activeWeek}`);

  // ── 2b. AHA users (≥3 user messages sent in period) ───────────────────────
  const [{ data: ahaTodayMsgs }, { data: ahaWeekMsgs }] = await Promise.all([
    query(`messages?select=sessions!inner(anonymous_id)&role=eq.user&sessions.started_at=gte.${isoToday()}`),
    query(`messages?select=sessions!inner(anonymous_id)&role=eq.user&sessions.started_at=gte.${isoStartOfWeek()}`),
  ]);

  function countAHA(rows) {
    const counts = {};
    for (const row of rows) {
      const id = row.sessions?.anonymous_id;
      if (id) counts[id] = (counts[id] || 0) + 1;
    }
    return Object.values(counts).filter((c) => c >= 3).length;
  }

  console.log(sep("ACTIVE USER (AHA)  (≥3 messages sent)"));
  console.log(`  Today:         ${countAHA(ahaTodayMsgs)}`);
  console.log(`  This week:     ${countAHA(ahaWeekMsgs)}`);

  // ── 3. Skill breakdown ─────────────────────────────────────────────────────
  const { data: skillRows } = await query(
    "messages?select=skill_id&role=eq.user"
  );
  const skillCounts = {};
  for (const { skill_id } of skillRows) {
    if (skill_id) skillCounts[skill_id] = (skillCounts[skill_id] || 0) + 1;
  }
  const totalSkillMessages = Object.values(skillCounts).reduce((a, b) => a + b, 0);
  const maxSkill = Math.max(...Object.values(skillCounts));

  const SKILL_LABELS = {
    emotional_checkin: "Emotional Check-In",
    thought_reframing: "Thought Reframing",
    coping_suggestions: "Coping Suggestions",
    guided_breathing:   "Guided Breathing",
    mood_tracking:      "Mood Tracking",
    crisis_escalation:  "Crisis Escalation",
  };

  console.log(sep("SKILL ACTIVATION  (user messages)"));
  for (const [skill, count] of Object.entries(skillCounts).sort((a, b) => b[1] - a[1])) {
    const label = (SKILL_LABELS[skill] || skill).padEnd(22);
    console.log(`  ${label} ${bar(count, maxSkill)} ${count} (${pct(count, totalSkillMessages)})`);
  }

  // ── 4. Crisis events ───────────────────────────────────────────────────────
  const { count: crisisCount } = await query("crisis_events?select=id");
  const { data: crisisRows } = await query(
    "crisis_events?select=trigger_type"
  );
  const crisisByType = {};
  for (const { trigger_type } of crisisRows) {
    crisisByType[trigger_type] = (crisisByType[trigger_type] || 0) + 1;
  }

  console.log(sep("CRISIS EVENTS"));
  console.log(`  Total:         ${crisisCount?.toLocaleString() ?? "?"}`);
  console.log(`  Rate:          ${pct(crisisCount ?? 0, uniqueUsers)} of users`);
  for (const [type, count] of Object.entries(crisisByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(28)} ${count}`);
  }

  // ── 5. Session depth & engagement ─────────────────────────────────────────
  const { data: sessionDepths } = await query(
    "sessions?select=message_count,anonymous_id"
  );

  const msgCounts = sessionDepths.map((s) => s.message_count || 0);
  const avgDepth = msgCounts.length
    ? (msgCounts.reduce((a, b) => a + b, 0) / msgCounts.length).toFixed(1)
    : 0;

  // Sessions per active user
  const sessionsPerUser = uniqueUsers
    ? (totalSessions / uniqueUsers).toFixed(2)
    : 0;

  // Return session rate: users with >1 session
  const userSessionCounts = {};
  for (const { anonymous_id } of sessionDepths) {
    userSessionCounts[anonymous_id] = (userSessionCounts[anonymous_id] || 0) + 1;
  }
  const returningUsers = Object.values(userSessionCounts).filter((c) => c > 1).length;
  const returnRate = pct(returningUsers, uniqueUsers);

  console.log(sep("ENGAGEMENT"));
  console.log(`  Avg session depth:   ${avgDepth} messages`);
  console.log(`  Sessions per user:   ${sessionsPerUser}`);
  console.log(`  Return session rate: ${returnRate} (${returningUsers}/${uniqueUsers} users)`);

  // ── 6. Dropoff point ───────────────────────────────────────────────────────
  const depthBuckets = { "1": 0, "2-3": 0, "4-6": 0, "7-10": 0, "11+": 0 };
  for (const count of msgCounts) {
    if (count <= 1) depthBuckets["1"]++;
    else if (count <= 3) depthBuckets["2-3"]++;
    else if (count <= 6) depthBuckets["4-6"]++;
    else if (count <= 10) depthBuckets["7-10"]++;
    else depthBuckets["11+"]++;
  }
  const maxBucket = Math.max(...Object.values(depthBuckets));

  console.log(sep("DROPOFF POINT  (messages per session)"));
  for (const [bucket, count] of Object.entries(depthBuckets)) {
    const label = bucket.padEnd(6);
    console.log(`  ${label} ${bar(count, maxBucket)} ${count} sessions (${pct(count, msgCounts.length)})`);
  }

  // ── 7. Org code usage ─────────────────────────────────────────────────────
  const { data: orgRows } = await query(
    "sessions?select=org_code&org_code=not.is.null"
  );
  const orgCounts = {};
  for (const { org_code } of orgRows) {
    if (org_code) orgCounts[org_code] = (orgCounts[org_code] || 0) + 1;
  }

  console.log(sep("ORG CODE USAGE"));
  if (Object.keys(orgCounts).length === 0) {
    console.log("  No org code sessions yet.");
  } else {
    const maxOrg = Math.max(...Object.values(orgCounts));
    for (const [code, count] of Object.entries(orgCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${code.padEnd(20)} ${bar(count, maxOrg, 15)} ${count} sessions`);
    }
  }

  console.log(`\n${"─".repeat(50)}\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
