# RPG Solo

A solo RPG platform: **Savage Worlds** rules engine, the **Mythic GM Emulator** oracle, and an **AI Game Master** with per-campaign RAG memory — all in a Docker-ready web app built for Coolify deployment.

## Features

| Module | Description |
|---|---|
| **AI Game Master** | Streaming GM chat that narrates, rolls dice, consults the oracle and manages the story via tool calling. |
| **Savage Worlds engine** | Trait rolls with wild die and acing, derived stats (Pace/Parry/Toughness), ranks, guided character creation. |
| **Mythic Oracle** | Fate chart with chaos rank, random events, detail checks (Action/Subject), scene setup — usable by player **and** AI. |
| **Journal** | The GM writes narrative journal entries as you play; entries form the story timeline. |
| **RAG memory** | Setting notes, character backgrounds and journal entries are chunked, embedded (pgvector) and searchable by the GM. |
| **Multi-user auth** | Email + password accounts (Auth.js, bcrypt, JWT sessions). |
| **AI providers** | OpenAI API (official) or ChatGPT Plus subscription via Codex-style OAuth. |

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

## Deploy on Coolify

1. Push this repo; in Coolify create a **Docker Compose** service pointing at it.
2. Set env vars: `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (your public URL), optionally `OPENAI_API_KEY`.
3. Deploy — the app container runs `prisma migrate deploy` on start; Postgres (pgvector) is included in the compose file.

The `Dockerfile` is a multi-stage build producing a slim standalone server; `/api/health` is the healthcheck endpoint.

## AI providers

### OpenAI API (default)
Set `OPENAI_API_KEY` (env var or per-user in **Settings → AI**). Pay per token; fully supported.

### ChatGPT Plus (Codex-style OAuth)
Select **ChatGPT (Plus subscription)** in Settings. Requires OAuth client credentials on the server:

```
CHATGPT_OAUTH_CLIENT_ID=…
# optional override:
CHATGPT_OAUTH_REDIRECT_URI=https://your-domain/api/ai/oauth/callback
```

Click **Connect ChatGPT account** → authorize → tokens are stored per-user and refreshed automatically.

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
│   ├── rules/              # Savage Worlds: dice, ranks, derived stats
│   ├── oracle/             # Mythic: fate chart, random events, scenes
│   └── rag/                # chunk → embed → pgvector search
└── middleware.ts           # route protection
```

### Key design decisions

- **Strategy pattern for AI providers** — game logic never knows which backend is active; adding a provider = one file.
- **Tools as Commands** — each AI tool has a Zod schema (validation + JSON schema for the model) and a pure executor; side effects are applied by the GM engine.
- **Mythic oracle as a service** — the same fate chart serves the UI buttons and the AI's `ask_oracle` tool; every consultation is logged (`OracleLog`).
- **RAG via pgvector** — embeddings stored with `vector(1536)`; cosine search through raw SQL; keyword fallback when embeddings are unavailable.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✔ | Postgres connection (pgvector) |
| `NEXTAUTH_SECRET` | ✔ | Session signing |
| `NEXTAUTH_URL` | ✔ | Public URL |
| `OPENAI_API_KEY` | – | API provider + embeddings |
| `EMBEDDINGS_MODEL` | – | Default `text-embedding-3-small` |
| `CHATGPT_OAUTH_CLIENT_ID` | – | ChatGPT subscription flow |

## Roadmap

- [ ] Custom oracle tables (user-authored d100 tables)
- [ ] Savage Worlds dramatic tasks & interludes
- [ ] PDF rules ingestion for RAG
- [ ] Export journal as markdown/EPUB
