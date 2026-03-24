import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { validateSession } from "@/lib/validateSession";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

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
❌ Do not handle crisis situations (instead, direct to local helplines like NCMH 1553).
❌ Do not replace therapy.
❌ Avoid productivity hacks or generic coaching unless directly related to well-being.
Core Capabilities:
- Emotional Check-In
- Thought Reframing (CBT-Lite)
- Micro-Journaling
- Gentle Coping Suggestions
- Positive Nudges
If user expresses suicidal thoughts or crisis-level distress, respond empathetically and redirect to the NCMH crisis hotline:
- Globe/TM: 0917-899-8727
- Smart/TNT: 0919-057-1553
- Landline: 1553
Keep answers short, engaging, and easy to follow.`;

export async function POST(req: NextRequest) {
  try {
  const { message, anonymousId, history } = await req.json();

  const authError = await validateSession(anonymousId);
  if (authError) return authError;

  // Fetch memory summary for this user
  const { data: summaryData } = await supabase
    .from("memory_summaries")
    .select("summary")
    .eq("anonymous_id", anonymousId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Build system prompt with memory if it exists
  const systemPrompt = summaryData?.summary
    ? `${FAYE_SYSTEM_PROMPT}\n\nWhat you remember about this user:\n${summaryData.summary}`
    : FAYE_SYSTEM_PROMPT;

  // Only pass last 10 messages to control tokens, starting from first user message
  const recentHistory = (history || []).slice(-10);
  const firstUserIdx = recentHistory.findIndex((m: { role: string }) => m.role === "user");
  const anthropicHistory = firstUserIdx >= 0 ? recentHistory.slice(firstUserIdx) : [];

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [
      ...anthropicHistory,
      { role: "user", content: message },
    ],
  });

  const reply =
    response.content[0].type === "text"
      ? response.content[0].text
      : "Sandali lang, ulit mo?";

  // Save user message and Faye's reply to Supabase
  await supabase.from("messages").insert([
    { anonymous_id: anonymousId, role: "user", content: message },
    { anonymous_id: anonymousId, role: "assistant", content: reply },
  ]);

  // Always save a rolling session summary after every message
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("anonymous_id", anonymousId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (recentMessages && recentMessages.length >= 2) {
    const summaryResponse = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 200,
      system: `Summarize this wellness conversation in 3-4 sentences. Focus on: the user's current emotional state, recurring concerns, and what helped. Be concise — this is injected into future sessions so Faye remembers this person. Output only plain prose, no labels, headers, or markdown formatting.`,
      messages: [
        {
          role: "user",
          content: recentMessages
            .reverse()
            .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
            .join("\n"),
        },
      ],
    });

    const summaryText =
      summaryResponse.content[0].type === "text"
        ? summaryResponse.content[0].text
        : "";

    // Upsert — update existing summary or create new one
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

  return NextResponse.json({ reply });
  } catch (error) {
    console.error("[/api/chat] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
