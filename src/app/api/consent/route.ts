import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Requires a `consent_given_at` timestamptz column on the `users` table:
// ALTER TABLE users ADD COLUMN consent_given_at timestamptz;

export async function POST(req: NextRequest) {
  const { anonymousId } = await req.json();

  const { error } = await supabase
    .from("users")
    .update({ consent_given_at: new Date().toISOString() })
    .eq("anonymous_id", anonymousId);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
