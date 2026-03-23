import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export async function POST(req: NextRequest) {
  const { anonymousId } = await req.json();

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("anonymous_id", anonymousId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: summary } = await supabase
    .from("memory_summaries")
    .select("summary")
    .eq("anonymous_id", anonymousId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    history: messages ? messages.reverse() : [],
    summary: summary?.summary || null,
  });
}
