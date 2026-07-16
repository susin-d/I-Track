# I-TRACK

I-TRACK is a full-stack React and Express workspace for explainable sprint intelligence. The API uses PostgreSQL-compatible storage and can fail over from Supabase to a local Docker database during startup.

## Stack

- Client: React, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts, React Flow, TanStack Query, Zustand, Framer Motion, Sonner.
- Server: Express, TypeScript, PostgreSQL/Supabase, JWT, Zod, OpenAI JavaScript client.
- Palette: midnight navy, electric blue, cyan, and rose accents, with the prohibited hue family excluded from UI tokens.

## Project Layout

- `client/` — Vite React application.
- `server/` — Express API, PostgreSQL models, schema scripts, seed data, and OpenAPI output.
- `supabase/` — hosted database configuration and SQL migrations.
- `api.md` — human-readable API reference.
- `LLM_BACKEND_API_GUIDE.md` — integration guide for agents and external LLM clients.

## Setup

```powershell
npm run install:all
Copy-Item server\.env.local.example server\.env
Copy-Item client\.env.local.example client\.env.local
```

Update `server\.env` with a strong `JWT_SECRET`, database URLs, and optional OpenAI-compatible provider values. Copying `server\.env.local.example` is suitable for local development; `server\.env.example` documents the same variables with safer placeholders. The server tries `SUPABASE_DATABASE_URL` first and automatically uses the local `DATABASE_URL` when Supabase is missing or unavailable during startup:

```env
DATABASE_URL=postgresql://jiira:jiira_dev_password@127.0.0.1:5433/jiira
SUPABASE_DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
DATABASE_CONNECT_TIMEOUT_MS=5000
OPENAI_API_KEY=ocz_your_api_key
OPENAI_BASE_URL=https://opencode.ai/zen/v1
OPENAI_MODEL=ask-me-before-selecting-a-model
```

Do not put API keys in the client env file.

## Run

Start PostgreSQL locally and apply the schema:

```powershell
docker compose -f docker-compose.postgres.yml up -d
cd server
npm run db:local:schema
npm run seed
```

Run the API and client concurrently in a single terminal:

```powershell
npm start
```

Or run them in separate terminals if preferred:

```powershell
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173` and sign in with:

- Email: `maya@itrack.dev`
- Password: `Password123!`

## Test And Verify

```powershell
npm run typecheck
npm run build
```

Useful API checks (the `/api/v1` path is canonical; `/api` remains available as a compatibility alias):

```powershell
Invoke-RestMethod http://localhost:4000/api/health
Invoke-RestMethod http://localhost:4000/api/v1/health
```

AI ticket generation requires an `OPENAI_API_KEY` and a real provider model. Inspect available models with `GET /api/v1/ai/models`; generate a validated, unsaved plan with `POST /api/v1/ai/generate-tickets`, then persist it with `POST /api/v1/ai/confirm-ticket-plan`.

For an external LLM or agent integration, follow [LLM_BACKEND_API_GUIDE.md](./LLM_BACKEND_API_GUIDE.md). Interactive Swagger documentation is available at [http://localhost:4000/api/docs](http://localhost:4000/api/docs), and the complete endpoint catalog is in [api.md](./api.md).
# I-Track
