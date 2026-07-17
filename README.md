# I-TRACK

I-TRACK is a full-stack workspace for planning and delivering software with explainable sprint intelligence. It combines a React client, a versioned Express API, PostgreSQL persistence, workspace-scoped permissions, and an optional OpenAI-compatible AI assistant.

## What it includes

- Workspace onboarding, switching, invitations, team management, and role-based access.
- Projects, backlogs, tickets, labels, dependencies, comments, work logs, attachments, and audit history.
- Sprint boards, cycles, sprint planning, capacity and velocity data, SLA tracking, and risk analysis.
- Reports, dashboard metrics, notifications, integrations, resources, settings, import, and export flows.
- An AI assistant with conversation history persistence that can explain workspace data, generate ticket plans, and execute permitted API operations with confirmation for destructive actions.

## Technology

- Client: React, TypeScript, Vite, React Router, Recharts, and Lucide React.
- API: Node.js, Express, TypeScript, Zod, JWT, rate limiting, Helmet, and OpenAPI.
- Data: PostgreSQL through the `pg` client, with optional Supabase PostgreSQL and local PostgreSQL fallback.
- AI: OpenAI JavaScript client against an OpenAI-compatible provider.

## Repository layout

```text
client/       React/Vite application
server/       Express API, database models, routes, seed data, and tests
supabase/     PostgreSQL migrations
docs/         Architecture, RBAC, and subsystem documentation
api.md        Complete API endpoint reference
LLM_BACKEND_API_GUIDE.md  Guide for LLM backend integrations
scripts/      Repository-level utility scripts
docker-compose.postgres.yml
              Local PostgreSQL service definition
```

## Prerequisites

- Node.js 20 or newer
- npm
- Docker Desktop, if using the included local PostgreSQL service
- An OpenAI-compatible API key, only if using AI endpoints

## Local setup

Install dependencies for both applications:

```powershell
npm run install:all
```

Create the server environment file:

```powershell
Copy-Item server\.env.local.example server\.env
```

At minimum, set a long random `JWT_SECRET`. For local PostgreSQL, the example connection string already matches the included Docker service. For hosted PostgreSQL, set `SUPABASE_DATABASE_URL` or `DATABASE_URL` to the appropriate connection string.

The server tries `SUPABASE_DATABASE_URL` first. If it is missing or unavailable during startup, it tries `DATABASE_URL`.

Do not put database credentials, JWT secrets, or AI keys in the client. The client defaults to the same-origin `/api/v1` path. The Vite proxy only applies during development; for a split production deployment, copy `client/.env.example` to `client/.env.production` and set `VITE_API_BASE_URL` to the deployed API origin and path, or configure the production web server to rewrite `/api/v1` to the API service.

## Start PostgreSQL and seed demo data

Start the local database:

```powershell
docker compose -f docker-compose.postgres.yml up -d
```

Apply the schema and load the demo workspace:

```powershell
Set-Location server
npm run db:local:schema
npm run seed
Set-Location ..
```

`npm run seed` clears the configured database tables before inserting demo data. Use it only with a development database.

The seeded demo account is:

```text
Email:    maya@itrack.dev
Password: Password123!
```

## Run the application

Run the API and client together:

```powershell
npm start
```

Or use separate terminals:

```powershell
npm run dev:server
npm run dev:client
```

The client is available at [http://localhost:5173](http://localhost:5173).

The API listens on port `4000` by default:

- Health: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)
- Swagger UI: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- OpenAPI JSON: [http://localhost:4000/api/v1/openapi.json](http://localhost:4000/api/v1/openapi.json)

The canonical API base URL is `http://localhost:4000/api/v1`. The legacy `/api` route prefix remains available for compatibility.

## Configuration

The server environment template documents the available settings:

- `PORT` and `CLIENT_ORIGIN` — API port and allowed client origin.
- `DATABASE_URL` — local or primary PostgreSQL connection string.
- `SUPABASE_DATABASE_URL` — optional hosted PostgreSQL connection string tried first.
- `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_POOL_MAX`, and `DATABASE_IDLE_TIMEOUT_MS` — connection pool settings.
- `JWT_SECRET` — signing key for access and refresh tokens.
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_CHAT_MODEL` — optional AI provider settings.
- `VITE_API_BASE_URL` — client build-time API base URL; defaults to `/api/v1` for same-origin deployments.

For a complete list of endpoints and request examples, see [api.md](./api.md). For integrating an external LLM with the authenticated AI gateway, see [LLM_BACKEND_API_GUIDE.md](./LLM_BACKEND_API_GUIDE.md).

## Validation

Run the repository checks from the root:

```powershell
npm run typecheck
npm run build
npm --prefix server test
npm --prefix client test
```

The client test currently runs the button accessibility check. The server test suite covers API contracts, permissions, AI validation, and sprint/SLA services.

The authenticated PostgreSQL integration flow is opt-in and must target a disposable local/test database:

```powershell
$env:RUN_DB_INTEGRATION_TESTS = "1"
$env:INTEGRATION_DATABASE_URL = "postgresql://itrack:itrack@127.0.0.1:5432/itrack_test"
npm --prefix server run test:integration
```

It exercises login, dashboard loading, SLA evaluation, populated ticket updates, comments, work logs, invitations, and organization deletion. It is skipped by the regular test command unless both variables are set.

Useful smoke checks after starting the API:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health
Invoke-RestMethod http://localhost:4000/api/v1/openapi.json
```

## API and authentication

Most API endpoints require a JWT access token:

```http
Authorization: Bearer <token>
```

Supported workspace roles are `admin`, `manager`, `engineer`, and `designer`. Access tokens are scoped to the active workspace; switching workspaces returns replacement tokens after membership validation.

AI-generated ticket plans are validated and returned without persistence. A plan is written only through the confirmation endpoint. Destructive operations invoked through the AI gateway require explicit confirmation.

## Contributing

Keep changes scoped to the relevant client, server, database migration, or documentation surface. Update `api.md` when changing public API behavior, add or update tests for server behavior, and run the validation commands above before opening a pull request.
