import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that anonymousId is a well-formed UUID and exists in the users table.
 * Returns a 401 NextResponse if invalid, or null if the session is valid.
 */
export async function validateSession(
  anonymousId: unknown
): Promise<NextResponse | null> {
  if (!anonymousId || typeof anonymousId !== "string" || !UUID_REGEX.test(anonymousId)) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const { data } = await supabase
    .from("users")
    .select("anonymous_id")
    .eq("anonymous_id", anonymousId)
    .single();

  if (!data) {
    return NextResponse.json({ error: "Session not found." }, { status: 401 });
  }

  return null;
}
