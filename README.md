# Passage Key

A pixel-art, pseudo-3D typing roguelite. Slay a horde of falling words, level up,
pick skills, and fight bosses — with versus-AI and online multiplayer in progress.

![status](https://img.shields.io/badge/status-in%20development-orange)

## Features

**Single player**
- **Adventure** — endless run where a boss guards every 5th level
- **Classic** — pure endless survival
- Three animated boss species with HP bars, phrase volleys, and enrage phases
- Procedural content: words, sentences, and code snippets that effectively never repeat
- Skill system — 5 active skills (3 slots) + 6 stacking passives, chosen on level-up
- Mana ultimate that clears the screen, elemental VFX, monster voice synthesis

**Versus AI** — four bot tiers (Rookie 22 WPM → Typist 98 WPM)
- **Royal Rumble** — up to 6 fighters. Combos launch word volleys at a random
  rival; unanswered pressure drains their health. Last one standing wins.
- **Tower 4v4** — teams share one word pool. Each cleared word deals 5 damage
  to the enemy tower (50 HP). Words claimed by another player are locked and
  dimmed. Best of 3 rounds, each opening with a skill draft. No ultimate.

**Online multiplayer** — same two formats over Supabase Realtime
- Create or join a room with a 5-character code
- Live presence roster; host starts the match

**Accounts** — email sign-up, profiles, and score submission

## Attack economy

| Combo | Words sent |
|---|---|
| 5 | 1 |
| 10 | 2 |
| 15 | 3 |
| 20+ | 4 |

## Controls

| Input | Action |
|---|---|
| Any letter/symbol | Type the falling text |
| `Ctrl` + `1` | Mana ultimate (clears all enemies) |
| `Ctrl` + `2/3/4` | Skill slots 1–3 |
| Mouse | All skills are also clickable |

> Some browsers reserve `Ctrl`+number for tab switching. Clicking the mana orb
> or a skill slot always works as a fallback.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview the production build
```

The game runs fully offline. Online features stay disabled until Supabase is configured.

## Online setup (optional)

### 1. Create a Supabase project

Free tier at [supabase.com](https://supabase.com).

### 2. Apply the schema

Dashboard → **SQL Editor** → paste [`supabase/schema.sql`](supabase/schema.sql) → **Run**.

This creates `profiles` and `scores` with Row Level Security enabled, plus a
trigger that auto-creates a profile on signup.

### 3. Add environment variables

```bash
cp .env.example .env
```

Fill in from Dashboard → **Settings → API Keys**:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

> Supabase renamed its API keys: **`sb_publishable_...` is the modern replacement
> for the legacy `anon` JWT** — they serve the same purpose. The app accepts
> either name (`VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`).

> ⚠️ **Never expose the secret key** (`sb_secret_...` / `service_role`) or your
> database password. Both bypass Row Level Security and grant full database
> access — they must never appear in frontend code or a committed file.
> `.env` is gitignored.

## Deploying to Vercel

1. Push to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repository.
3. Vercel auto-detects Vite. Confirm:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Add both `VITE_*` variables under **Environment Variables**.
5. Deploy.

Every push to `main` redeploys automatically.

## Tech stack

| Layer | Tool |
|---|---|
| Build | Vite |
| Rendering | Canvas 2D (hand-rolled pixel sprites) |
| Audio | Web Audio API (fully synthesized — no audio files) |
| Auth / DB / Realtime | Supabase |
| Hosting | Vercel |

## Project structure

```
src/
  game.js      core loop, state, progression, HUD
  sprites.js   canvas setup, 3D background, monsters, hero
  boss.js      boss definitions, phases, sprites
  versus.js    AI opponents, attack economy, Rumble + Tower rules
  online.js    Supabase Realtime rooms, presence, match events
  wordgen.js   procedural word/sentence/code generation
  audio.js     synthesis, SFX, monster voices, adaptive music
  supabase.js  auth, profiles, leaderboards
  style.css    UI theme
supabase/
  schema.sql   tables, RLS policies, triggers
  migrations/  incremental schema changes
```

## Multiplayer design note

Online play is peer-broadcast, not server-authoritative: each client simulates
only its own board, and just "I sent you N words" plus status crosses the wire.
That keeps it free (no game server) and latency-tolerant. The trade-off is that
a modified client could misreport its combo — fine for casual play. Hardening
would mean moving match state into an authoritative server or Edge Function.
