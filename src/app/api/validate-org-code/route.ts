import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  const { code } = await req.json();

  if (!code || typeof code !== "string") {
    return NextResponse.json({ valid: false });
  }

  const { data } = await supabase
    .from("org_codes")
    .select("code")
    .eq("code", code.trim().toUpperCase())
    .eq("active", true)
    .single();

  return NextResponse.json({ valid: !!data });
}
