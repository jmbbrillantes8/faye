# CLAUDE.md — Faye

This file gives you full context on Faye before you touch any code.
Read this first. Always.

---

## What is Faye

Faye is a Taglish-first workplace wellness chatbot built for Filipino
employees and teams. It provides emotional check-ins, mood tracking,
thought reframing, guided breathing, and a safe space to process work
stress — in the language Filipinos actually think and feel in (a
natural mix of Tagalog and English).

The long-term vision is B2B: organizations (companies, universities)
embed Faye to surface aggregated, anonymized workforce wellness data.
The current focus is validating the core chat experience and building
toward a university pilot as the first institutional partner.

Faye is a solo founder project. Yohanna (the founder) is a PM, not
an engineer. Code changes must be intentional, minimal, and explained.
Do not over-engineer. Do not introduce new patterns without a reason.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) |
| Styling | Tailwind CSS |
| Backend / DB | Supabase (Postgres, service key on server only) |
| AI — main responses | `claude-sonnet-4-6` |
| AI — intent classification | `claude-haiku-4-5-20251001` |
| AI — memory summarization | `claude-haiku-4-5-20251001` |
| Auth | Anonymous UUID sessions (no login required) |
| Deployment | Vercel (linked as `jmbbrillantes-7275s-projects/faye`) |
| PWA | `@ducanh2912/next-pwa` with Workbox |

**No Telegram. No aiogram.** That stack is deprecated. Everything is
web-based.

---

## Repository structure

```
src/
  app/
    page.tsx              → Main chat UI (client component)
    layout.tsx            → Root layout
    manifest.ts           → PWA web manifest (name, icons, theme)
    privacy/              → Privacy policy page
    api/
      chat/route.ts       → Main route: intent classification, Claude call, DB writes
      memory/route.ts     → Creates user row in `users` table on page load
      history/route.ts    → Loads past messages for returning users
      consent/route.ts    → Logs consent acceptance
      feedback/route.ts   → Saves user feedback
      validate-org-code/  → Checks org/partner codes against `org_codes` table
  lib/
    validateSession.ts    → Validates anonymous_id is UUID + exists in `users` table
    supabaseBrowser.ts    → Supabase client for browser-side use (anon key)
public/
  sw.js                   → Generated Workbox service worker (do not edit manually)
  workbox-*.js            → Workbox runtime (do not edit manually)
  icons/
    icon-192.png          → PWA icon
    icon-512.png          → PWA icon
    icon-512-maskable.png → PWA maskable icon
next.config.ts            → Next.js config with next-pwa wrapper
CLAUDE.md                 → This file
```

**There is no `/skills` folder.** Faye's personality, tone, crisis
protocol, and skill definitions live directly in
`src/app/api/chat/route.ts` as constants (`FAYE_SYSTEM_PROMPT`,
`INTENT_CLASSIFIER_PROMPT`, `CRISIS_KEYWORDS`, `VALID_SKILLS`).

---

## Supabase schema (key tables)

| Table | Purpose |
|---|---|
| `users` | One row per anonymous user, keyed by `anonymous_id` (UUID) |
| `sessions` | One row per conversation session (3-hour gap = new session) |
| `messages` | Every user and Faye message, with skill, intent, event_type |
| `memory_summaries` | Rolling 3-4 sentence summary per user, injected into future sessions |
| `crisis_events` | Logged when crisis keywords or intent detected |
| `org_codes` | Organization codes for B2B institutional access |
| `user_org_codes` | Junction: which anonymous_id used which org code |

### Session identity

Users are identified by `anonymous_id` (UUID v4), generated on first
visit and stored in `localStorage` as `faye_user_id`. There is no
login, no email, no account.

Other localStorage keys:
- `faye_consent` — `"accepted"` once user accepts privacy policy
- `faye_org_code` — saved org/partner code

### Session gap logic

A new `sessions` row is created when the gap between the last activity
and now exceeds **3 hours** (`SESSION_GAP_MS`). Otherwise the existing
session continues.

---

## API routes

All logic goes through Next.js API routes. The browser never touches
Supabase directly — except one place: `supabaseBrowser` is used in
`page.tsx` to insert into `user_org_codes` at consent time.

The server-side Supabase client uses `SUPABASE_SERVICE_KEY` (bypasses
RLS). Be careful — any insert/update via the service key is
unrestricted.

---

## Chat route flow (`/api/chat`)

Each user message goes through these steps in order:

1. **Validate session** — `validateSession()` checks UUID format + user exists in `users`
2. **Validate org code** — if provided, checks `org_codes` table
3. **Get or create session** — finds active session or creates new one
4. **Intent classification** — fast crisis keyword check first (no LLM); then `classifyIntent()` via Haiku
5. **Fetch memory summary** — injects prior context into system prompt
6. **Call Claude** — `claude-sonnet-4-6`, max 1000 tokens, with last 10 messages as history
7. **Save messages** — inserts user + faye message rows together into `messages`
8. **Update session** — increments message count, updates skills_activated, ended_at
9. **Log crisis event** — if crisis triggered, inserts into `crisis_events`
10. **Rolling memory summary** — calls Haiku to summarize last 20 messages, upserts into `memory_summaries`
11. **Return** — `{ reply, sessionId, skillId, isCrisis }`

---

## Skills (intents)

Intent is classified per message into one of these skill IDs:

| Skill ID | When used |
|---|---|
| `emotional_checkin` | Default — vague distress, "I'm not okay", "feeling ko..." |
| `thought_reframing` | Self-blame, catastrophizing, "wala akong kwenta" |
| `coping_suggestions` | "Ano dapat gawin", wants relief or grounding |
| `guided_breathing` | Anxiety, panic, tight chest |
| `mood_tracking` | Wants to log mood, asks about patterns |
| `crisis_escalation` | Suicidal ideation, self-harm, severe hopelessness |

Crisis keywords are checked first (fast path, no LLM). If matched,
`crisis_escalation` is used without calling the classifier.

---

## PWA setup

Faye is a fully configured PWA:

- **Manifest**: `src/app/manifest.ts` — name "Faye", theme `#037EF3`, standalone display
- **Service worker**: auto-generated by `@ducanh2912/next-pwa` into `public/sw.js`
- **Icons**: `public/icons/` — 192px, 512px, 512px maskable
- **PWA disabled in development**: `disable: process.env.NODE_ENV === "development"` in `next.config.ts`

### PWA install behavior

- **Android Chrome**: `beforeinstallprompt` event can trigger an in-app install button
- **iOS Safari**: No automatic prompt — user must use Share → Add to Home Screen manually
- **iOS isolated storage**: Installed PWA on iOS gets its own localStorage, separate from
  Safari. A user who chatted in Safari before installing will start fresh (new anonymous_id).
  This is a known limitation.

### Push notifications (not yet built)

PWAs support push notifications (Web Push API). Would require:
- `push_subscriptions` table in Supabase
- `/api/subscribe` route — saves device push endpoint tied to `anonymous_id`
- `/api/notify` route — sends push via `web-push` library
- Permission request UI in the chat

---

## Tone and language

Faye speaks in **Taglish** — warm, natural, not clinical. Think:
a kind ate or kuya who genuinely listens. Not a therapist. Not a
chatbot. A thoughtful companion.

- Filipino: grounded, emotionally intelligent, community-oriented
- English: used for clarity, not formality
- Code-switching is intentional and natural — do not "clean it up"
- No toxic positivity. No generic responses. No "I'm just an AI."
- No em dashes (—). No reassuring sign-offs ("I'm here", "You've got this").
- At most one emoji per message. Many messages should have none.

---

## Crisis protocol

If crisis signals are detected (keyword match OR LLM classification):

1. Acknowledge directly and calmly — do not panic or lecture
2. Stay present — ask one gentle open question
3. Share PH-specific resources:
   - NCMH Crisis Hotline: **1553** (24/7, free, nationwide)
   - Hopeline PH: **0917-558-HOPE (4673)**
   - In Touch Crisis Lines: **0917-800-HOPE (4673)**
   - LGBTQ+ LoveYourself: **0917-572-8671**
4. Ask if there's someone they trust they could reach out to
5. Stay present — do NOT close the conversation after sharing resources
6. Never say "I'm just an AI" and leave

**Do not substitute international hotlines.** Use PH-specific resources only.

---

## What Faye is NOT

- Not a crisis service (but escalates appropriately to real ones)
- Not a therapist or clinical tool
- Not a general-purpose chatbot
- Not a consumer social app

---

## Current status (as of 2026-04-24)

Faye is live in production. Vercel project linked locally.

Core flows that work:
- Anonymous session creation and persistence
- Consent flow with optional org code
- Intent classification (6 skills)
- Crisis detection (keyword + LLM)
- Rolling memory summarization
- Returning user history load
- PWA installable (manifest + service worker + icons)
- A/B test variant on headline (`useABTest` hook)

In progress / known issues:
- Push notifications not yet built
- iOS PWA isolated storage causes returning users to lose history on install
- Investigating: occasional missed Faye responses (validateSession 401 or Anthropic API error)

---

## Development workflow

```bash
# Local development (PWA disabled, uses .env.local)
npm run dev

# Preview deployment (PWA enabled, HTTPS, safe to test install prompt)
vercel deploy

# Production deployment
vercel deploy --prod

# View live error logs
vercel logs --follow --level error

# Search past errors
vercel logs --query "[/api/chat] Error"
```

**Vercel is linked** — project: `jmbbrillantes-7275s-projects/faye`
**Production domain**: `faye-gamma.vercel.app`
**`.env.local`** is already populated — do not overwrite with `vercel env pull`.

---

## Development rules

1. **Read before writing.** Understand the existing pattern before
   adding anything new.
2. **Reuse components.** Don't recreate what exists — find it first.
3. **Service key is unrestricted.** All server-side Supabase calls use
   the service key. Be deliberate about what you insert or update.
4. **anonymous_id is the only user identity.** Never assume a logged-in
   user. Never store PII.
5. **Mobile-first.** Most Filipino users are on mobile. Test layouts
   at 375px width.
6. **No new dependencies without reason.** Check if the need can be
   met by what's already installed.
7. **Explain changes.** After implementing anything non-trivial,
   summarize what you changed and why.
8. **Do not edit `public/sw.js` or `public/workbox-*.js` manually.**
   These are generated by the PWA build. Edit `next.config.ts` instead.

---

## Out of scope (do not build unless told)

- User accounts / login / email auth
- Payment or subscription flows
- Admin dashboard (planned, not started)
- Native mobile app (Faye is PWA-first)
- Any Telegram or bot-platform integration
- Push notifications (planned, not started)
