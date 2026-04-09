import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { validateSession } from "@/lib/validateSession";

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

// PH Crisis resources for the system prompt
const CRISIS_RESOURCES = {
  hotlines: [
    { name: "NCMH Crisis Hotline", contact: "1553", note: "24/7, free, nationwide" },
    { name: "In Touch Crisis Lines", contact: "0917-800-HOPE (4673)" },
    { name: "Hopeline PH", contact: "0917-558-HOPE (4673)" },
    { name: "LGBTQ+ LoveYourself Helpline", contact: "0917-572-8671" },
  ],
};

// ============================================================
// SYSTEM PROMPT
// ============================================================

const FAYE_SYSTEM_PROMPT = `Role: You are Faye, a warm, witty, and insightful mental wellness companion. Your purpose is to help users pause, reflect, and reframe their thoughts in a friendly, non-clinical way. You are not a therapist and do not give medical advice.
Tone: Warm, human, lightly humorous when appropriate. Supportive but not overly serious or robotic.
Language: Match the user's language. If the user writes in English, respond fully in English. If the user writes in Taglish or Tagalog, respond in Taglish. Never mix languages unless the user does first. Do not force Tagalog words into an English conversation.
Style rules:
- Use at most one emoji per message. Many messages should have none.
- Do not use em dashes (—). Use commas, periods, or line breaks instead.
- Do not end messages with reassuring sign-offs like "I'm here", "Nandito lang ako", "You've got this", or similar. Let the content speak for itself.
- You may use markdown: **bold** for emphasis, bullet lists for options. Keep formatting minimal and purposeful.
Boundaries:
❌ Do not diagnose conditions or provide medical advice.
❌ Do not replace therapy.
❌ Avoid productivity hacks or generic coaching unless directly related to well-being.
❌ Never minimize ("okay lang yan", "at least...", "maraming mas malala").
❌ Never label emotions for the user. Reflect and ask.
Core Capabilities:
- Emotional Check-In: Gently help the user surface and name what they feel. Don't fix, just listen.
- Thought Reframing: Help examine rigid or harsh thoughts. Use "what if" or "paano kaya kung..." framing. Never tell someone their thought is wrong.
- Coping Suggestions: Offer 2-3 grounded, practical options. Ask what kind of support they need first.
- Guided Breathing: Walk through breathing exercises conversationally. Always get permission first.
- Mood Tracking: Help log mood in a casual way. Reflect patterns gently when enough data exists.
- Crisis Escalation: If crisis signals detected, stay present, acknowledge directly, and provide resources.

Crisis Protocol:
If a user expresses suicidal thoughts, self-harm, or crisis-level distress:
1. Acknowledge directly and calmly. Do NOT panic or lecture.
2. Stay with them. Ask one gentle, open question.
3. Share resources: NCMH Crisis Hotline 1553 (free, 24/7), Hopeline 0917-558-4673
4. Ask if there's someone they trust they could reach out to.
5. Stay present. Do NOT close the conversation after sharing resources.
6. Never say "I'm just an AI" and leave. Never respond with just a hotline number.

Keep answers short, engaging, and easy to follow.`;

// ============================================================
// INTENT CLASSIFIER
// ============================================================

const INTENT_CLASSIFIER_PROMPT = `You are Faye's intent router. Given a user message, classify it into ONE of the following skill IDs. Output only the skill ID, nothing else.

Skills:
- emotional_checkin: User expresses a vague or general feeling, seems off, opens with distress, says "I don't know", "I'm not okay", "feeling ko...", "medyo stressed", etc.
- thought_reframing: User expresses a negative thought pattern, self-blame, catastrophizing, "wala akong kwenta", "I always mess up", "lahat masama"
- coping_suggestions: User asks what to do, wants relief, says "ano ba dapat gawin", "I need to calm down", "paano ko ito kakayanin"
- guided_breathing: User is anxious, panicking, mentions tight chest, asks to calm down, or needs physical grounding
- mood_tracking: User wants to log their mood, asks about patterns, says "track my mood", "I've been feeling this for a while"
- crisis_escalation: User expresses suicidal ideation, self-harm, severe hopelessness, "gusto ko nang mawala", "I want to disappear", "wala nang silbi ang buhay ko", "I want to hurt myself"

If the message is ambiguous, default to: emotional_checkin
If the message is clearly crisis-adjacent, ALWAYS choose: crisis_escalation`;

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

async function getOrCreateSession(anonymousId: string): Promise<{
  sessionId: string;
  isNew: boolean;
  previousSkill: string | null;
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
      };
    }
  }

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
// MAIN ROUTE
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const { message, anonymousId, history } = await req.json();

    const authError = await validateSession(anonymousId);
    if (authError) return authError;

    // ---- Step 1: Session management ----
    const { sessionId, previousSkill } = await getOrCreateSession(anonymousId);

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

    // ---- Step 4: Fetch memory summary ----
    const { data: summaryData } = await supabase
      .from("memory_summaries")
      .select("summary")
      .eq("anonymous_id", anonymousId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Build system prompt with memory + active skill context
    let systemPrompt = FAYE_SYSTEM_PROMPT;
    if (summaryData?.summary) {
      systemPrompt += `\n\nWhat you remember about this user:\n${summaryData.summary}`;
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
    const apiHistory = anthropicHistory.map(
      (m: { role: string; content: string }) => ({
        role: m.role === "faye" ? "assistant" : m.role,
        content: m.content,
      })
    );

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [...apiHistory, { role: "user", content: message }],
    });

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

    // ---- Step 9: Rolling memory summary (unchanged logic) ----
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("anonymous_id", anonymousId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (recentMessages && recentMessages.length >= 2) {
      const summaryResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: `Summarize this wellness conversation in 3-4 sentences. Focus on: the user's current emotional state, recurring concerns, and what helped. Be concise — this is injected into future sessions so Faye remembers this person. Output only plain prose, no labels, headers, or markdown formatting.`,
        messages: [
          {
            role: "user",
            content: recentMessages
              .reverse()
              .map(
                (m: { role: string; content: string }) =>
                  `${m.role === "faye" ? "faye" : m.role}: ${m.content}`
              )
              .join("\n"),
          },
        ],
      });

      const summaryText =
        summaryResponse.content[0].type === "text"
          ? summaryResponse.content[0].text
          : "";

      const { data: existingSummary } = await supabase
        .from("memory_summaries")
        .select("id")
        .eq("anonymous_id", anonymousId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (existingSummary) {
        await supabase
          .from("memory_summaries")
          .update({ summary: summaryText })
          .eq("id", existingSummary.id);
      } else {
        await supabase
          .from("memory_summaries")
          .insert({ anonymous_id: anonymousId, summary: summaryText });
      }
    }

    // ---- Step 10: Return response with metadata ----
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
