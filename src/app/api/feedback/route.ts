import { NextRequest, NextResponse } from "next/server";

const NOTION_DATABASE_ID = "eefc891149d4495f98b43a69b6752e9a";

export async function POST(req: NextRequest) {
  const { feedback, anonymousId } = await req.json();

  if (!feedback?.trim()) {
    return NextResponse.json({ error: "Feedback is required" }, { status: 400 });
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        Feedback: {
          title: [{ text: { content: feedback.trim() } }],
        },
        "Anonymous ID": {
          rich_text: [{ text: { content: anonymousId || "unknown" } }],
        },
        Status: {
          select: { name: "New" },
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("[feedback] Notion error:", JSON.stringify(err));
    return NextResponse.json({ error: err.message || "Failed to submit" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
