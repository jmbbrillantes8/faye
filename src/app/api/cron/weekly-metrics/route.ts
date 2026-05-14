import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Returns the Monday 00:00 UTC of the week prior to now,
// and the Monday 00:00 UTC of the current week (exclusive end).
function getPreviousWeek(): { start: Date; end: Date } {
  const now = new Date();
  const daysToMonday = (now.getUTCDay() + 6) % 7;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - daysToMonday);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);

  return { start: prevMonday, end: thisMonday };
}

// "May 5 – May 11, 2026"
function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${monday.toLocaleDateString("en-US", opts)} – ${sunday.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { start, end } = getPreviousWeek();

  const { data, error } = await supabase.rpc("get_meaningful_weekly_metrics", {
    week_start: start.toISOString(),
    week_end: end.toISOString(),
  });

  if (error) {
    console.error("[weekly-metrics] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data?.[0] ?? { meaningful_sessions: 0, meaningful_users: 0 };
  const sessions = Number(row.meaningful_sessions);
  const users = Number(row.meaningful_users);

  const notionRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_METRICS_DATABASE_ID },
      properties: {
        Week: { title: [{ text: { content: formatWeekLabel(start) } }] },
        "Week Start": { date: { start: start.toISOString().split("T")[0] } },
        "Meaningful Users": { number: users },
        "Meaningful Sessions": { number: sessions },
      },
    }),
  });

  if (!notionRes.ok) {
    const err = await notionRes.text();
    console.error("[weekly-metrics] Notion error:", err);
    return NextResponse.json({ error: err }, { status: 500 });
  }

  console.log(`[weekly-metrics] ${formatWeekLabel(start)} → ${users} users, ${sessions} sessions`);
  return NextResponse.json({ ok: true, week: formatWeekLabel(start), users, sessions });
}
