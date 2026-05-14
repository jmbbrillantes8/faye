import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { validateSession } from "@/lib/validateSession";
import { FAYE_SYSTEM_PROMPT } from "@/prompts/faye";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Session gap: 3 hours of inactivity = new session
const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

// Valid skill IDs
const VALID_SKILLS = [
  "emotional_checkin",
  "thought_reframing",
  "coping_suggestions",
  "guided_breathing",
  "mood_tracking",
  "crisis_escalation",
] as const;

type SkillId = (typeof VALID_SKILLS)[number];

// Crisis keyword detection (fast check before LLM routing)
const CRISIS_KEYWORDS = [
  "gusto ko nang mawala",
  "gusto ko na lang mawala",
  "i want to disappear",
  "wala nang silbi ang buhay ko",
  "life isn't worth living",
  "life isnt worth living",
  "gusto kong masaktan ang sarili ko",
  "i want to hurt myself",
  "i want to end it",
  "i don't want to be here anymore",
  "i dont want to be here anymore",
  "wala na akong silbi",
  "ayaw ko na",
  "pagod na ko sa buhay",
  "i want to die",
  "gusto ko nang mamatay",
  "papatayin ko sarili ko",
  "kill myself",
];

// ============================================================
// PROMPTS
// ============================================================

const INTENT_CLASSIFIER_PROMPT = fs.readFileSync(
  path.join(process.cwd(), "src/prompts/intent-classifier.md"),
  "utf-8"
);

// ============================================================
// HELPER: Check for crisis keywords (fast, no LLM needed)
// ============================================================

function detectCrisisKeywords(message: string): string | null {
  const lower = message.toLowerCase().trim();
  for (const keyword of CRISIS_KEYWORDS) {
    if (lower.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

// ============================================================
// HELPER: Classify intent via LLM
// ============================================================

async function classifyIntent(message: string): Promise<SkillId> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: INTENT_CLASSIFIER_PROMPT,
      messages: [{ role: "user", content: message }],
    });

    const raw =
      response.content[0].type === "text"
        ? response.content[0].text.trim().toLowerCase()
        : "";

    // Validate the response is a known skill ID
    if (VALID_SKILLS.includes(raw as SkillId)) {
      return raw as SkillId;
    }

    // Default fallback
    return "emotional_checkin";
  } catch (error) {
    console.error("[Intent Classification] Error:", error);
    return "emotional_checkin";
  }
}

// ============================================================
// HELPER: Get or create session
// ============================================================

async function getOrCreateSession(anonymousId: string, orgCode: string | null): Promise<{
  sessionId: string;
  isNew: boolean;
  previousSkill: string | null;
  previousSessionId: string | null;
}> {
  // Find the most recent session for this user
  const { data: lastSession } = await supabase
    .from("sessions")
    .select("id, ended_at, started_at, skills_activated")
    .eq("anonymous_id", anonymousId)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  const now = new Date();

  if (lastSession) {
    // Check if session is still active (within 3-hour gap)
    const lastActivity = lastSession.ended_at
      ? new Date(lastSession.ended_at)
      : new Date(lastSession.started_at);

    const gap = now.getTime() - lastActivity.getTime();

    if (gap < SESSION_GAP_MS) {
      // Continue existing session
      const skills: string[] = lastSession.skills_activated || [];
      const previousSkill = skills.length > 0 ? skills[skills.length - 1] : null;
      return {
        sessionId: lastSession.id,
        isNew: false,
        previousSkill,
        previousSessionId: null,
      };
    }
  }

  const previousSessionId = lastSession?.id ?? null;

  // Create new session
  const { data: newSession, error } = await supabase
    .from("sessions")
    .insert({
      anonymous_id: anonymousId,
      started_at: now.toISOString(),
      message_count: 0,
      skills_activated: [],
      crisis_triggered: false,
      platform: "web",
      ...(orgCode ? { org_code: orgCode } : {}),
    })
    .select("id")
    .single();

  if (error || !newSession) {
    console.error("[Session Creation] Error:", error);
    throw new Error("Failed to create session");
  }

  return {
    sessionId: newSession.id,
    isNew: true,
    previousSkill: null,
    previousSessionId,
  };
}

// ============================================================
// HELPER: Update session metadata
// ============================================================

async function updateSession(
  sessionId: string,
  skillId: SkillId,
  isCrisis: boolean
): Promise<void> {
  // Fetch current session data
  const { data: session } = await supabase
    .from("sessions")
    .select("message_count, skills_activated, crisis_triggered")
    .eq("id", sessionId)
    .single();

  if (!session) return;

  const currentSkills: string[] = session.skills_activated || [];
  const updatedSkills = currentSkills.includes(skillId)
    ? currentSkills
    : [...currentSkills, skillId];

  await supabase
    .from("sessions")
    .update({
      message_count: (session.message_count || 0) + 2, // user + faye message
      skills_activated: updatedSkills,
      crisis_triggered: session.crisis_triggered || isCrisis,
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

// ============================================================
// HELPER: Log crisis event
// ============================================================

async function logCrisisEvent(
  anonymousId: string,
  sessionId: string,
  triggerType: "keyword" | "mood_pattern" | "skill_transition" | "explicit_disclosure" | "other",
  triggerDetail: string
): Promise<void> {
  await supabase.from("crisis_events").insert({
    anonymous_id: anonymousId,
    session_id: sessionId,
    trigger_type: triggerType,
    trigger_detail: triggerDetail,
    resources_presented: ["NCMH_1553", "Hopeline_0917_558_4673"],
    user_continued_after: null, // updated on next message
  });
}

// ============================================================
// HELPER: Update crisis follow-up (did user continue after?)
// ============================================================

async function updateCrisisFollowUp(
  anonymousId: string,
  sessionId: string
): Promise<void> {
  // Find the most recent crisis event in this session that hasn't been updated
  const { data: openCrisis } = await supabase
    .from("crisis_events")
    .select("id")
    .eq("anonymous_id", anonymousId)
    .eq("session_id", sessionId)
    .is("user_continued_after", null)
    .order("triggered_at", { ascending: false })
    .limit(1)
    .single();

  if (openCrisis) {
    await supabase
      .from("crisis_events")
      .update({ user_continued_after: true })
      .eq("id", openCrisis.id);
  }
}

// ============================================================
// HELPER: Build memory context from all three memory tables
// ============================================================

async function buildMemoryContext(anonymousId: string): Promise<string> {
  const [
    { data: summaryData },
    { data: entities },
    { data: openLoops },
  ] = await Promise.all([
    supabase
      .from("memory_summaries")
      .select("summary")
      .eq("anonymous_id", anonymousId)
      .limit(1)
      .single(),
    supabase
      .from("user_entities")
      .select("name, type, context, status")
      .eq("anonymous_id", anonymousId)
      .eq("status", "active"),
    supabase
      .from("open_loops")
      .select("description")
      .eq("anonymous_id", anonymousId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const parts: string[] = [];

  if (summaryData?.summary) {
    parts.push(`What you remember about this user:\n${summaryData.summary}`);
  }

  if (entities && entities.length > 0) {
    const entityLines = entities
      .map((e: { name: string; type: string; context: string }) =>
        `- ${e.name} (${e.type}): ${e.context}`
      )
      .join("\n");
    parts.push(`People and situations in their life:\n${entityLines}`);
  }

  if (openLoops && openLoops.length > 0) {
    const loopLines = openLoops
      .map((l: { description: string }) => `- ${l.description}`)
      .join("\n");
    parts.push(`Open threads to follow up on:\n${loopLines}`);
  }

  return parts.join("\n\n");
}

// ============================================================
// MAIN ROUTE
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const { message, anonymousId, history, orgCode } = await req.json();

    const authError = await validateSession(anonymousId);
    if (authError) return authError;

    // ---- Step 1: Session management ----
    // Validate org code if provided
    let validatedOrgCode: string | null = null;
    if (orgCode) {
      const { data: orgRow } = await supabase
        .from("org_codes")
        .select("code")
        .eq("code", orgCode)
        .eq("active", true)
        .single();
      validatedOrgCode = orgRow ? orgCode : null;
    }

    const { sessionId, previousSkill, previousSessionId } = await getOrCreateSession(anonymousId, validatedOrgCode);

    if (previousSessionId) {
      fetch(`${process.env.SUPABASE_URL}/functions/v1/extract-memory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ anonymousId, sessionId: previousSessionId }),
      }).catch((e) => console.error("[extract-memory] Fire-and-forget failed:", e));
    }

    // ---- Step 2: Intent classification ----
    // Fast crisis keyword check first (no LLM call needed)
    const crisisKeyword = detectCrisisKeywords(message);
    let skillId: SkillId;
    let isCrisis = false;

    if (crisisKeyword) {
      skillId = "crisis_escalation";
      isCrisis = true;
    } else {
      skillId = await classifyIntent(message);
      isCrisis = skillId === "crisis_escalation";
    }

    // Determine if a skill transition happened
    const skillTransitionFrom =
      previousSkill && previousSkill !== skillId ? previousSkill : null;

    // ---- Step 3: Build event type ----
    let eventType = "message";
    if (isCrisis) {
      eventType = "crisis_triggered";
    }

    // ---- Step 4: Build memory context ----
    const memoryContext = await buildMemoryContext(anonymousId);

    // Build system prompt with memory + active skill context
    let systemPrompt = FAYE_SYSTEM_PROMPT;
    if (memoryContext) {
      systemPrompt += `\n\n${memoryContext}`;
    }
    systemPrompt += `\n\nCurrent active skill: ${skillId}`;
    if (skillTransitionFrom) {
      systemPrompt += `\nTransitioned from: ${skillTransitionFrom}`;
    }

    // ---- Step 5: Call Claude for Faye's response ----
    const recentHistory = (history || []).slice(-10);
    const firstUserIdx = recentHistory.findIndex(
      (m: { role: string }) => m.role === "user"
    );
    const anthropicHistory =
      firstUserIdx >= 0 ? recentHistory.slice(firstUserIdx) : [];

    // Map 'faye' role back to 'assistant' for Anthropic API compatibility
    // Filter out messages with empty/undefined content to avoid Anthropic API errors
    const apiHistory = anthropicHistory
      .map((m: { role: string; content: string }) => ({
        role: m.role === "faye" ? "assistant" : m.role,
        content: m.content,
      }))
      .filter((m: { role: string; content: string }) => m.content && m.content.trim());

    // Ensure history doesn't end with a user message (would create consecutive user messages)
    while (apiHistory.length > 0 && apiHistory[apiHistory.length - 1].role === "user") {
      apiHistory.pop();
    }

    const userMessageAt = new Date().toISOString();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [...apiHistory, { role: "user", content: message }],
    });

    const fayeMessageAt = new Date().toISOString();

    const reply =
      response.content[0].type === "text"
        ? response.content[0].text
        : "Sandali lang, ulit mo?";

    // ---- Step 6: Save messages to Supabase ----
    await supabase.from("messages").insert([
      {
        anonymous_id: anonymousId,
        role: "user",
        content: message,
        session_id: sessionId,
        skill_id: skillId,
        intent_classified: skillId,
        event_type: eventType,
        skill_transition_from: skillTransitionFrom,
        created_at: userMessageAt,
      },
      {
        anonymous_id: anonymousId,
        role: "faye",
        content: reply,
        session_id: sessionId,
        skill_id: skillId,
        intent_classified: skillId,
        event_type: "message",
        skill_transition_from: null,
        created_at: fayeMessageAt,
      },
    ]);

    // ---- Step 7: Update session metadata ----
    await updateSession(sessionId, skillId, isCrisis);

    // ---- Step 8: Log crisis event if triggered ----
    if (isCrisis) {
      const triggerType = crisisKeyword ? "keyword" : "skill_transition";
      const triggerDetail = crisisKeyword || `Classified as crisis by intent router`;
      await logCrisisEvent(anonymousId, sessionId, triggerType, triggerDetail);
    } else {
      // If NOT crisis, check if there's an open crisis event to mark as continued
      await updateCrisisFollowUp(anonymousId, sessionId);
    }

    // ---- Step 9: Return response with metadata ----
    return NextResponse.json({
      reply,
      sessionId,
      skillId,
      isCrisis,
    });
  } catch (error) {
    console.error("[/api/chat] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
