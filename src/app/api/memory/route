import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export async function POST(req: NextRequest) {
  const { anonymousId } = await req.json();

  // Check if user exists
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("anonymous_id", anonymousId)
    .single();

  if (existing) {
    return NextResponse.json({ user: existing, isNew: false });
  }

  // Create new user
  const { data: newUser } = await supabase
    .from("users")
    .insert({ anonymous_id: anonymousId })
    .select()
    .single();

  return NextResponse.json({ user: newUser, isNew: true });
}