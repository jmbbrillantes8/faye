import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ok = (body = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Entity {
  name: string;
  type: string;
  context: string;
  status: string;
}

interface OpenLoop {
  description: string;
  status: string;
}

interface ExtractionResult {
  entities?: Entity[];
  open_loops?: OpenLoop[];
  emotional_themes?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { anonymousId, sessionId } = await req.json();

    if (!anonymousId || !sessionId) {
      console.error("[extract-memory] Missing anonymousId or sessionId");
      return ok({ ok: false, reason: "missing_params" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

    // Fetch last 20 messages for this session
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(10);

    if (messagesError) {
      console.error("[extract-memory] Failed to fetch messages:", messagesError);
      return ok({ ok: false, reason: "messages_fetch_failed" });
    }

    if (!messages || messages.length === 0) {
      console.log("[extract-memory] No messages for session:", sessionId);
      return ok({ ok: true, skipped: true });
    }

    console.log(`[extract-memory] Fetched ${messages.length} messages for session ${sessionId}`);

    // Fetch existing entities and open loops in parallel
    const [{ data: existingEntities }, { data: existingOpenLoops }] = await Promise.all([
      supabase
        .from("user_entities")
        .select("name, type, context, status")
        .eq("anonymous_id", anonymousId),
      supabase
        .from("open_loops")
        .select("description")
        .eq("anonymous_id", anonymousId)
        .eq("status", "open"),
    ]);

    // Format conversation for the prompt
    const conversation = messages
      .map((m: { role: string; content: string }) =>
        `[${m.role === "faye" ? "Faye" : "User"}]: ${m.content}`
      )
      .join("\n\n");

    const existingEntitiesText =
      existingEntities && existingEntities.length > 0
        ? existingEntities
            .map((e: Entity) => `${e.name} (${e.type}, ${e.status}): ${e.context}`)
            .join("\n")
        : "None — this is the first memory extraction for this user.";

    const existingOpenLoopsText =
      existingOpenLoops && existingOpenLoops.length > 0
        ? existingOpenLoops.map((l: { description: string }) => `- ${l.description}`).join("\n")
        : "None.";

    const prompt = `You are summarizing a therapy-adjacent conversation for a wellness companion called Faye.
Your output will be injected into Faye's memory at the start of the user's next session.
Faye speaks Taglish (Filipino-English code-switching) and works with Filipino college students and young adults.

You must return TWO things, in this exact order:

1. A prose narrative summary (4–6 sentences)
2. A JSON block on its own line starting with |||JSON

---

PROSE SUMMARY RULES:
- Write in second person addressed to Faye: "The user has been dealing with..."
- Cover: named people and their ongoing situations, the user's current emotional state, what's actually happening in their life (not just feelings), and what helped or resonated in this session.
- Named people MUST keep their names. Never replace "Jimmy" with "her employer."
- Unresolved situations MUST be marked as ongoing. Never imply resolution that didn't happen.
- If the user mentioned suicidal ideation, passive or active, include it explicitly: "The user mentioned suicidal ideation linked to [trigger]."
- 3–4 sentences. Dense and specific. No filler.

---

JSON RULES:
Return this exact structure after the prose summary, on its own line starting with |||JSON:

|||JSON
{
  "entities": [
    {
      "name": "string",
      "type": "person | org | situation",
      "context": "string — 1-2 sentences: who/what they are and their significance to the user",
      "status": "active | resolved"
    }
  ],
  "open_loops": [
    {
      "description": "string — one sentence Faye could use as a follow-up",
      "status": "open"
    }
  ],
  "emotional_themes": [
    "string — short phrase capturing a structural pattern"
  ]
}

ENTITY RULES:
- Include every named person, org, or situation with emotional weight.
- status is "resolved" ONLY if the user explicitly confirmed it in this session.
- context must be 1 sentence, specific: "Jaz is a former colleague who took the user's job at Longtail while the user was burning out, seen as a betrayal" — not just "a colleague."
- If a person has multiple roles, capture both in that 1 sentence.

OPEN LOOP RULES:
- Write as a follow-up Faye could use: "Whether Matt replied to the user's job inquiry" — so Faye opens with "Hey, did Matt ever reply?"
- Do NOT close loops the user didn't resolve.
- Max 3, prioritized by emotional weight.

EMOTIONAL THEMES RULES:
- 2–3 short phrases, structural life patterns — not situational feelings from today.

---

Here is the conversation to summarize:

<conversation>
${conversation}
</conversation>

Existing entities from previous sessions (do not remove — only update status if explicitly resolved):
<existing_entities>
${existingEntitiesText}
</existing_entities>

Existing open loops (do not close unless explicitly resolved in this conversation):
<existing_open_loops>
${existingOpenLoopsText}
</existing_open_loops>`;

    console.log("[extract-memory] Calling Haiku...");

    // Call Haiku
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const output = response.content[0].type === "text" ? response.content[0].text : "";
    console.log("[extract-memory] Haiku output length:", output.length);
    console.log("[extract-memory] Contains |||JSON:", output.includes("|||JSON"));

    // Parse prose + structured JSON
    let prose = output.trim();
    let parsed: ExtractionResult | null = null;

    if (output.includes("|||JSON")) {
      const parts = output.split("|||JSON");
      prose = parts[0].trim();
      const jsonStr = parts[1].trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        console.error("[extract-memory] JSON parse failed:", e, "\nRaw:", jsonStr);
        // Prose is still saved below; structured writes are skipped
      }
    } else {
      console.error("[extract-memory] |||JSON delimiter not found — saving prose only");
    }

    const now = new Date().toISOString();

    // 1. Upsert memory_summaries
    const { data: existingSummary, error: summarySelectError } = await supabase
      .from("memory_summaries")
      .select("id")
      .eq("anonymous_id", anonymousId)
      .limit(1)
      .single();

    if (summarySelectError && summarySelectError.code !== "PGRST116") {
      console.error("[extract-memory] memory_summaries select error:", summarySelectError);
    }

    if (existingSummary) {
      const { error: updateError } = await supabase
        .from("memory_summaries")
        .update({ summary: prose })
        .eq("id", existingSummary.id);
      if (updateError) console.error("[extract-memory] memory_summaries update error:", updateError);
      else console.log("[extract-memory] memory_summaries updated");
    } else {
      const { error: insertError } = await supabase
        .from("memory_summaries")
        .insert({ anonymous_id: anonymousId, summary: prose });
      if (insertError) console.error("[extract-memory] memory_summaries insert error:", insertError);
      else console.log("[extract-memory] memory_summaries inserted");
    }

    if (parsed) {
      // 2. Upsert user_entities (unique on anonymous_id + name)
      if (parsed.entities && parsed.entities.length > 0) {
        for (const entity of parsed.entities) {
          const { error: entityError } = await supabase
            .from("user_entities")
            .upsert(
              {
                anonymous_id: anonymousId,
                name: entity.name,
                type: entity.type,
                context: entity.context,
                status: entity.status,
                last_seen_at: now,
              },
              { onConflict: "anonymous_id,name" }
            );
          if (entityError) {
            console.error("[extract-memory] Entity upsert error:", entityError);
          }
        }
      }

      // 3. Insert new open loops
      if (parsed.open_loops && parsed.open_loops.length > 0) {
        const loopsToInsert = parsed.open_loops.map((loop: OpenLoop) => ({
          anonymous_id: anonymousId,
          description: loop.description,
          status: "open",
          created_at: now,
        }));
        const { error: loopsError } = await supabase.from("open_loops").insert(loopsToInsert);
        if (loopsError) {
          console.error("[extract-memory] Open loops insert error:", loopsError);
        }
      }
    }

    return ok({ ok: true });
  } catch (error) {
    console.error("[extract-memory] Unhandled error:", error);
    return ok({ ok: false, reason: "unhandled_error" });
  }
});
