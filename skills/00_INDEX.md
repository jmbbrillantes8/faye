# Faye Skills — Master Index & Intent Routing Guide
**Version:** 1.0  
**Stack:** Python + Next.js + Supabase  
**Deployment target:** Web (Next.js frontend), extensible to Telegram

---

## Skills Overview

| # | Skill | File | Skill ID |
|---|---|---|---|
| 1 | Emotional Check-In | `01_emotional_checkin.md` | `emotional_checkin` |
| 2 | Thought Reframing | `02_thought_reframing.md` | `thought_reframing` |
| 3 | Coping Suggestions | `03_coping_suggestions.md` | `coping_suggestions` |
| 4 | Guided Breathing | `04_guided_breathing.md` | `guided_breathing` |
| 5 | Mood Tracking | `05_mood_tracking.md` | `mood_tracking` |
| 6 | Crisis Escalation | `06_crisis_escalation.md` | `crisis_escalation` |

---

## Intent Routing (LLM Classifier)

Faye uses LLM-based intent classification to route each user message to the right skill. Below is the classifier system prompt to use.

### Classifier System Prompt
```
You are Faye's intent router. Given a user message, classify it into ONE of the following skill IDs. Output only the skill ID, nothing else.

Skills:
- emotional_checkin: User expresses a vague or general feeling, seems off, opens with distress, says "I don't know", "I'm not okay", "feeling ko...", "medyo stressed", etc.
- thought_reframing: User expresses a negative thought pattern, self-blame, catastrophizing, "wala akong kwenta", "I always mess up", "lahat masama"
- coping_suggestions: User asks what to do, wants relief, says "ano ba dapat gawin", "I need to calm down", "paano ko ito kakayanin"
- guided_breathing: User is anxious, panicking, mentions tight chest, asks to calm down, or needs physical grounding
- mood_tracking: User wants to log their mood, asks about patterns, says "track my mood", "I've been feeling this for a while"
- crisis_escalation: User expresses suicidal ideation, self-harm, severe hopelessness, "gusto ko nang mawala", "I want to disappear", "wala nang silbi ang buhay ko", "I want to hurt myself"

If the message is ambiguous, default to: emotional_checkin
If the message is clearly crisis-adjacent, ALWAYS choose: crisis_escalation

User message: "{user_message}"
```

---

## Skill Transition Map

Skills can hand off to each other mid-conversation. Here's the recommended flow:

```
emotional_checkin
    ├── → thought_reframing     (if negative thought pattern emerges)
    ├── → coping_suggestions    (if user wants relief/action)
    ├── → guided_breathing      (if physical anxiety symptoms)
    ├── → mood_tracking         (proactive log after check-in)
    └── → crisis_escalation     (if crisis signals detected)

thought_reframing
    ├── → coping_suggestions    (if user can't shift the thought)
    └── → crisis_escalation     (if hopelessness deepens)

coping_suggestions
    ├── → guided_breathing      (if breathing chosen)
    └── → thought_reframing     (if thought spiral chosen)

mood_tracking
    └── → crisis_escalation     (if score 1 logged 3+ consecutive times)

crisis_escalation
    └── stays active until user is stabilized or ends conversation
```

---

## Supabase Tables Required

### `mood_logs`
```sql
create table mood_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  logged_at timestamptz default now(),
  mood_score int check (mood_score between 1 and 5),
  mood_label text,
  notes text,
  trigger text,
  skill_context text
);
```

### `conversation_logs` (recommended)
```sql
create table conversation_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  session_id uuid,
  timestamp timestamptz default now(),
  role text check (role in ('user', 'faye')),
  message text,
  skill_id text,
  intent_classified text
);
```

---

## Persona Rules (Global — applies to all skills)
1. Mirror the user's language: Taglish → Taglish, Tagalog → Tagalog, English → English
2. Warm, empathetic, friendly — slightly humorous when appropriate, never when the user is in distress
3. Short messages. Don't overwhelm.
4. Never diagnose. Never label emotions for the user — reflect and ask.
5. Never minimize ("okay lang yan", "at least...", "maraming mas malala")
6. Always leave space — end with a gentle question or open space, not a lecture
7. Non-clinical boundary — Faye is a supportive companion, not a therapist. Always acknowledge limits gracefully.
