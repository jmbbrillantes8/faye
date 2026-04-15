# Faye — Workplace Wellness Companion for Filipino Teams

> A mental health chatbot built for the way Filipinos actually talk about how they're feeling.

**Live:** [faye-gamma.vercel.app](https://faye-gamma.vercel.app)

---

## Why Faye Exists

Mental health support in Philippine workplaces is either too clinical, too formal, or built for a Western context. Existing tools ask Filipinos to express vulnerability in a language and tone that doesn't feel natural.

Faye meets users where they are — in Taglish, with cultural nuance, without requiring an account or a reason to show up.

---

## What It Does

Faye is a workplace wellness chatbot that helps Filipino employees check in emotionally, track their mood over time, and access support — anonymously, without friction.

**Core capabilities:**
- Emotional check-in with culturally grounded responses
- Mood tracking across sessions
- Crisis escalation with local mental health resources
- Rolling conversation memory without requiring login
- Optional org code for workplace deployment

---

## How It's Built

Faye is a working MVP, built and deployed end-to-end.

| Layer | Stack |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Backend | Supabase (Postgres + Edge Functions) |
| AI | Anthropic Claude API |
| Deployment | Vercel |

**Key architectural decisions:**

**Anonymous-first design** — Users get a UUID-based session on first visit. No sign-up, no email, no barrier to entry. This was a deliberate product decision: the first job of a mental health tool is to be approachable.

**Claude over OpenAI** — Evaluated both for Taglish tone fidelity. Claude produced more natural, culturally resonant responses in mixed-language conversation. This wasn't a default choice — it was tested.

**Rolling summarization** — Instead of passing full conversation history to the API on every message, Faye summarizes context progressively. This keeps latency low and costs manageable without losing continuity.

**Org code validation via Edge Function** — Workplace clients can deploy Faye with an org code for anonymous usage tracking. Validation happens server-side without exposing org data to the client.

---

## B2B Positioning

Faye is designed for HR and People teams who want to offer mental health support without the overhead of a full EAP (Employee Assistance Program). The anonymous architecture means employees are more likely to actually use it — and org-level mood data gives HR teams signal without compromising individual privacy.

---

## Status

Working MVP — deployed and accessible. Currently iterating on crisis escalation depth and cultural nuance in emotional responses.

---

## Built By

**Johanna Mae Brillantes** — AI Product Manager  
[LinkedIn](https://linkedin.com/in/) · [GitHub](https://github.com/jmbbrillantes8)

> This project is part of my PM portfolio. I scoped it, made the product and architectural decisions, and built it end-to-end to validate that I can ship — not just spec.
