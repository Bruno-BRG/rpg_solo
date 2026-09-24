# RPG Solo

A solo RPG platform: **Savage Worlds** rules engine, the **Mythic GM Emulator** oracle, and an **AI Game Master** with per-campaign RAG memory — all in a Docker-ready web app built for Coolify deployment.

## Features

| Module | Description |
|---|---|
| **AI Game Master** | Streaming GM chat that narrates, rolls dice, consults the oracle and manages the story via tool calling. Opens the adventure with narration on demand. Persists full chat history, replays it on reload and logs every AI oracle consultation. Narration renders as **markdown** (headings, lists, tables, bold). |
| **Dark theme** | Full dark mode with one click in the sidebar (follows system preference by default, persisted per browser, no flash on load). |
| **Savage Worlds engine** | Trait rolls with wild die and acing, derived stats (Pace/Parry/Toughness), ranks. Skills cap at d12 until Legendary; load limit is 20 lb per Strength step. |
| **Guided character creation** | Five steps with a live guide: 5 attribute points, 12 skill points, core skills free at d4, 1 free Edge, up to 4 points of Hindrances buying an Edge (2), an attribute step (2) or a skill step (1). Every option shows its cost, blocked options say why, and the API refuses an illegal sheet with the reasons. |
| **Combat** | Initiative from the Action Deck (54 cards, suit tiebreak, Joker acts anytime at +2 and forces a reshuffle), attack vs Parry, damage vs Toughness (incl. extras), raises → +1d6 damage, Soak (a Benny, Vigor at TN 4: a success soaks one wound, each raise another), Unshake. |
| **Grid combat** | Tactical encounters on a square grid: the GM opens the fight, paints walls, cover, difficult ground and hazards, places pieces and deals cards; distance, line of sight, cover, gang up, range bands, multi-action and wound penalties are all applied. The Combat tab shows the board, initiative with cards, the selected piece, range to a target and the action history, and the player can move pieces, fix wounds and paint terrain. |
| **Dramatic tasks** | SWADE timer with skill list, tokens per success/raise, round advancement, success/failure outcomes. |
| **Interludes** | Mythic interlude questions per PC + world outlook check with chaos-rank drift; awards a benny. |
| **Progression** | XP → advances → ranks (Novice → Legendary at 4/8/12/16), per-character XP tracking in the party panel. |
| **Mythic Oracle** | Fate chart with chaos rank, random events, detail checks (Action/Subject), scene setup — usable by player **and** AI. |
| **d100 tables** | 27 built-in tables across fantasy/scifi/western/horror/noir/universal + user-authored custom tables (CRUD, shareable, rollable by player and AI). |
| **NPC generator** | Genre-aware NPC with name, occupation, appearance, demeanor, Motivation and Mythic stance (Friendly/Neutral/Hostile). |
| **Journal** | The GM writes narrative journal entries as you play; entries form the story timeline. |
| **Campaign memory** | The GM keeps a notebook of durable facts (people, places, factions, items, promises, rulings, mysteries) recorded with a tool as play goes. Facts, threads, cast, party state and journal recaps are replayed every turn, and setting notes, backgrounds, journal entries and facts are indexed for retrieval. Search uses pgvector embeddings when available and text search otherwise; older campaigns are indexed on first access. The **Memory** tab lists and edits every fact. |
| **GM prep** | The GM prepares ahead like a table GM: story arcs, upcoming events, tension clocks and NPC agendas, managed with a tool. The prep is a guide the oracle and the player's choices can overturn, never a script. The **Prep** tab shows it behind a reveal button, since it is full of spoilers. |
| **Multi-user auth** | Email + password accounts (Auth.js, bcrypt, JWT sessions). |
| **Per-campaign AI settings** | Model, GM style/persona and narrative temperature per campaign (fall back to user defaults); campaigns can be deleted with typed confirmation. |
| **AI providers** | OpenAI API (official) or ChatGPT Plus subscription via Codex-style OAuth. |
| **Test suite** | `npm run test` covers rules, tools, DB and a full GM loop with a fake provider (knowledge digest, fact capture, prep, creation budgets, the card deck and grid combat); `npm run test:api` runs the HTTP end-to-end suite. |

## Stack

- **Next.js 14** (App Router, TypeScript) + Tailwind CSS — minimalist UI
- **PostgreSQL 16 + pgvector** (Prisma ORM)
- **Auth.js** (NextAuth v4, credentials provider)
- **OpenAI SDK** — chat, embeddings, function calling

## Quick start (local)

```bash
cp .env.example .env          # set NEXTAUTH_SECRET (openssl rand -base64 32)
npm install
docker compose up -d postgres # start only the database
npx prisma migrate deploy
npm run dev                   # http://localhost:3000
```

### Local dev without Docker (Windows)

`scripts/dev-postgres.ps1` manages a portable, user-space Postgres 16 with
pgvector (no admin rights needed):

```powershell
powershell -File scripts\dev-postgres.ps1 setup   # one-time initdb
powershell -File scripts\dev-postgres.ps1 start   # serve on 127.0.0.1:5433
powershell -File scripts\dev-postgres.ps1 stop
```

Point `DATABASE_URL` at `postgresql://postgres:postgres@localhost:5433/rpg_solo?schema=public`.


## Deploy on Coolify

1. Push this repo; in Coolify create a **Docker Compose** service pointing at it.
2. Set env vars: `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (your public URL), optionally `OPENAI_API_KEY`.
3. Deploy — the app container runs `prisma migrate deploy` on start; Postgres (pgvector) is included in the compose file.

The `Dockerfile` is a multi-stage build producing a slim standalone server; `/api/health` is the healthcheck endpoint.

## AI providers

### OpenAI API (default)
Set `OPENAI_API_KEY` (env var or per-user in **Settings → AI**). Pay per token; fully supported.

### ChatGPT Plus (Codex-style OAuth)
Select **ChatGPT (Plus subscription)** in Settings, then click
**Connect ChatGPT account**. The server starts a callback listener on
`localhost:1455` (the only redirect URI registered for the Codex
client id — the same port the Codex CLI uses), sends you to the
OpenAI login, captures the token automatically and stores it
per-user with automatic refresh.

If the local callback cannot be captured (port busy, headless
server), copy the `http://localhost:1455/auth/callback?code=…` URL
from the browser address bar after authorizing and paste it into the
**Manual fallback** field in Settings.

Verified working models on a Plus account (Sept 2026 — gating is
per-account, picked from a dropdown in Settings, no typing needed):
`gpt-6-astra` (default), `gpt-5.6-sol`, `gpt-5.6-terra`,
`gpt-5.6-luna`, `gpt-5.5`.

> ⚠️ The ChatGPT subscription flow relies on undocumented endpoints (the same mechanism Codex clients use). It may break or be restricted; all logic is isolated in `src/lib/ai/chatgpt-oauth.ts`. The OpenAI API provider is the stable fallback.

## Architecture

```
src/
├── app/                    # pages + API routes
│   ├── (auth)/             # login / register
│   ├── (app)/              # dashboard, campaigns, characters, settings
│   └── api/                # REST: campaigns, oracle, dice, chat, settings
├── components/             # UI (minimalist: flat, bordered, no gradients)
├── lib/
│   ├── ai/                 # provider abstraction (Strategy/Factory)
│   │   ├── provider.ts     #   interface + metadata
│   │   ├── openai-api.ts   #   official API adapter
│   │   ├── chatgpt-oauth.ts#   ChatGPT subscription adapter (isolated)
│   │   ├── tools.ts        #   function-calling schemas + executors
│   │   └── factory.ts      #   resolve + build provider per user
│   ├── gm/engine.ts        # GM orchestration (context → tools → effects)
│   ├── gm/knowledge.ts     # campaign notebook digest (facts + prep, budgeted)
│   ├── rules/              # Savage Worlds: dice, ranks, derived stats
│   ├── oracle/             # Mythic: fate chart, random events, scenes
│   └── rag/                # chunk → embed → pgvector search
└── middleware.ts           # route protection
```

### Key design decisions

- **Strategy pattern for AI providers** — game logic never knows which backend is active; adding a provider = one file.
- **Tools as Commands** — each AI tool has a Zod schema (validation + JSON schema for the model) and a pure executor; side effects are applied by the GM engine.
- **Mythic oracle as a service** — the same fate chart serves the UI buttons and the AI's `ask_oracle` tool; every consultation is logged (`OracleLog`).
- **RAG via pgvector** — embeddings stored with `vector(1536)`; cosine search through raw SQL, with text search for sources without embeddings or when the embedding service is unavailable.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✔ | Postgres connection (pgvector) |
| `NEXTAUTH_SECRET` | ✔ | Session signing |
| `NEXTAUTH_URL` | ✔ | Public URL |
| `OPENAI_API_KEY` | – | API provider + embeddings |
| `EMBEDDINGS_MODEL` | – | Default `text-embedding-3-small` |
| `CHATGPT_OAUTH_CLIENT_ID` | – | ChatGPT subscription flow |

## Testing

```bash
npm run test        # rules + tools + DB + full GM loop (fake provider)
npm run test:rules  # individual suites: test:rules|tools|db|gm
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run test:api    # HTTP end-to-end (needs `npm run dev` running)
```

## Roadmap

- [x] GM opens the adventure with narration ("Begin the adventure")
- [x] GM owns the chaos rank, scenes and character conditions via tools
- [x] Model picker dropdown per provider (no manual model ids)
- [x] Custom oracle tables (user-authored d100 tables)
- [x] Savage Worlds dramatic tasks & interludes
- [x] Combat subsystem (initiative, attack, damage, Soak, Unshake)
- [x] Character progression (XP → advances → ranks) with party panel
- [x] Genre NPC generator + built-in d100 table library
- [x] Full chat history persistence and replay
- [x] Guided character creation with enforced SWADE budgets
- [x] Grid combat with the official Action Deck
- [x] Campaign knowledge notebook (facts) and GM prep (arcs, events, clocks, agendas)
- [ ] PDF rules ingestion for RAG
- [ ] Export journal as markdown/EPUB
- [ ] Vehicle/chase rules (SWADE chase deck)
- [ ] Quick Encounters / mass combat rules for extras
