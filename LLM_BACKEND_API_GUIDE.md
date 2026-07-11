# LLM Backend API Guide

This guide explains how an LLM agent should connect to and safely operate the I-TRACK backend.

## Connection details

| Item | Value |
| --- | --- |
| Local server | `http://localhost:4000` |
| Versioned API base | `http://localhost:4000/api/v1` |
| Health check | `GET /api/v1/health` |
| OpenAPI document | `GET /api/v1/openapi.json` |
| Interactive documentation | `http://localhost:4000/api/docs` |
| Content type | `application/json` |
| Authentication | JWT bearer token |

Use `/api/v1` for all new integrations. The unversioned `/api` routes exist for compatibility only.

## Recommended LLM connection flow

1. Log in with `POST /auth/login` and securely retain the returned `token` and `refreshToken`.
2. Send the access token as `Authorization: Bearer <token>`.
3. Discover the current user's permitted operations with `GET /ai/endpoints`.
4. Select only an operation returned by that endpoint.
5. Execute it through `POST /ai/execute`.
6. If the gateway returns `409 requiresConfirmation`, explain the exact action to the user and wait for explicit approval.
7. Retry the same call with `confirmed: true` only after approval.
8. On an expired access token, obtain a new token pair with `POST /auth/refresh` and retry once.

The gateway preserves the authenticated user's organization scope and role permissions. It also records non-GET AI executions in the audit log.

## 1. Authenticate

Request:

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "maya@itrack.dev",
  "password": "Password123!"
}
```

Relevant response fields:

```json
{
  "token": "<8-hour-jwt-access-token>",
  "refreshToken": "<30-day-refresh-token>",
  "user": {
    "id": "<user-id>",
    "email": "maya@itrack.dev",
    "role": "admin",
    "organization": "<organization-id>"
  },
  "organization": {
    "id": "<organization-id>",
    "name": "I-TRACK Demo"
  }
}
```

Never place credentials, access tokens, refresh tokens, or the server's `OPENAI_API_KEY` in an LLM system prompt, logs, source control, or browser storage that is accessible to unrelated code. Inject the access token into the HTTP tool at runtime.

Refresh an expired access token:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refresh-token>"
}
```

The refresh token is rotated. Replace both stored tokens with the newly returned pair.

## 2. Discover allowed endpoints

```http
GET /api/v1/ai/endpoints
Authorization: Bearer <token>
```

Example response:

```json
{
  "endpoints": [
    {
      "method": "GET",
      "path": "/tickets",
      "group": "tickets",
      "roles": ["admin", "manager", "engineer", "designer"],
      "requiresConfirmation": false
    },
    {
      "method": "DELETE",
      "path": "/tickets/:id",
      "group": "tickets",
      "roles": ["admin", "manager"],
      "requiresConfirmation": true
    }
  ]
}
```

Treat this response as the runtime allowlist. Replace placeholders such as `:id` with real resource IDs. Do not invent IDs; obtain them from a list or lookup response first.

## 3. Execute an operation

All LLM gateway calls use one HTTP endpoint:

```http
POST /api/v1/ai/execute
Authorization: Bearer <token>
Content-Type: application/json
```

Request shape:

```json
{
  "method": "GET | POST | PUT | PATCH | DELETE",
  "path": "/versionless/backend/path?optional=query",
  "body": {},
  "confirmed": false
}
```

- `method` and `path` are required.
- `body` is used for `POST`, `PUT`, and `PATCH` requests.
- Put GET query parameters in `path`, for example `/tickets?status=Backlog`.
- Paths may include `/api` or `/api/v1`, but versionless paths such as `/tickets` are preferred.
- The gateway cannot call `/ai/execute` recursively.
- The response status and JSON payload are the same as the underlying backend operation.

Read example:

```json
{
  "method": "GET",
  "path": "/tickets?status=Backlog"
}
```

Write example:

```json
{
  "method": "PATCH",
  "path": "/tickets/65f000000000000000000001/status",
  "body": {
    "status": "In Progress"
  }
}
```

## Destructive-action confirmation

All `DELETE` operations and other destructive operations flagged by `/ai/endpoints` require explicit confirmation. The first attempt must omit `confirmed` or set it to `false`.

The gateway responds:

```json
{
  "requiresConfirmation": true,
  "action": "DELETE /tickets/65f000000000000000000001",
  "message": "Confirm this destructive action before AI performs it."
}
```

The LLM must then:

1. State the exact resource and action that will be affected.
2. Ask the user for explicit confirmation.
3. Make no destructive call until the user confirms.
4. Retry the unchanged request with `"confirmed": true`.

Confirmation is single-action approval. Do not reuse it for another resource, path, method, or later request.

## Suggested LLM tool definition

Expose the following function to the model. The application—not the model—should translate it into an authenticated request to `/api/v1/ai/execute`.

```json
{
  "name": "execute_itrack_api",
  "description": "Execute an allowed I-TRACK backend operation as the signed-in user. Discover allowed operations first. Destructive operations require explicit user confirmation.",
  "parameters": {
    "type": "object",
    "additionalProperties": false,
    "required": ["method", "path"],
    "properties": {
      "method": {
        "type": "string",
        "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]
      },
      "path": {
        "type": "string",
        "description": "Versionless API path returned by /ai/endpoints, with real path parameters and optional query string."
      },
      "body": {
        "type": "object",
        "additionalProperties": true
      },
      "confirmed": {
        "type": "boolean",
        "default": false,
        "description": "True only after the user explicitly approves this exact destructive action."
      }
    }
  }
}
```

The host application should separately fetch `/ai/endpoints` at login and after a role change. It may provide the returned allowlist to the model as tool context.

## Suggested system instructions

```text
You are an I-TRACK assistant operating as the currently authenticated user.
Use only endpoints returned by GET /ai/endpoints.
Respect role and organization boundaries.
Read existing resources before changing them, and never invent resource IDs.
Prefer the smallest operation that fulfills the request.
Before any operation marked requiresConfirmation, describe the exact action and
wait for explicit user approval. Set confirmed=true only for that approved call.
Do not expose credentials or tokens. Report backend errors accurately and do not
claim success unless the backend returned a successful status.
```

## JavaScript integration example

```js
const API_BASE = "http://localhost:4000/api/v1";

async function itrackRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.ITRACK_ACCESS_TOKEN}`,
      ...options.headers,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message ?? data?.error?.message ?? `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

const allowed = await itrackRequest("/ai/endpoints");

const result = await itrackRequest("/ai/execute", {
  method: "POST",
  body: JSON.stringify({ method: "GET", path: "/tickets?status=Backlog" }),
});
```

## PowerShell smoke test

```powershell
$base = "http://localhost:4000/api/v1"
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (@{
  email = "maya@itrack.dev"
  password = "Password123!"
} | ConvertTo-Json)

$headers = @{ Authorization = "Bearer $($login.token)" }
$allowed = Invoke-RestMethod -Method Get -Uri "$base/ai/endpoints" -Headers $headers
$tickets = Invoke-RestMethod -Method Post -Uri "$base/ai/execute" -Headers $headers -ContentType "application/json" -Body (@{
  method = "GET"
  path = "/tickets"
} | ConvertTo-Json)
```

## Roles and access

Roles are `admin`, `manager`, `engineer`, and `designer`.

- Admin-only operations include organization management, users, invitations, integrations, audit logs, import, and export.
- Admin and manager roles can create or modify projects, sprints, resources, and ticket records.
- All signed-in roles can read ordinary project data and use permitted ticket collaboration actions.

Do not hard-code this summary as an authorization mechanism. The backend and `/ai/endpoints` response are authoritative.

## Error handling

| Status | Meaning | LLM behavior |
| --- | --- | --- |
| `400` | Invalid method, path, body, or validation | Correct the request from the error details; do not blindly retry. |
| `401` | Missing, invalid, or expired access token | Refresh once, then require sign-in if refresh fails. |
| `403` | The user's role cannot perform the operation | Stop and explain the permission limitation. Never switch roles or bypass it. |
| `404` | Endpoint or scoped resource not found | Re-read the relevant list; do not guess another ID. |
| `409` | Confirmation required or resource conflict | Ask for confirmation only when `requiresConfirmation` is `true`; otherwise report the conflict. |
| `422` | Generated content failed schema validation | Correct or regenerate the content using the returned issues. |
| `429` | Rate limit exceeded | Back off and retry later. The server limit is 120 requests per minute. |
| `500` | Backend or provider failure | Report the failure and retry only if the operation is safe and idempotent. |
| `503` | External model provider unavailable or unconfigured | Report provider configuration/availability; do not treat it as an I-TRACK auth error. |

Error bodies are not completely uniform. Read both `message` and `error.message`, and preserve `issues`, `detail`, `allowedRoles`, and `requiresConfirmation` when present.

## Direct API mode

An agent may call a catalog endpoint directly instead of using `/ai/execute`:

```http
GET /api/v1/tickets
Authorization: Bearer <token>
```

Direct calls still enforce JWT authentication, organization scope, and role-based access. However, the direct API does not provide the AI gateway's confirmation checkpoint. For autonomous or chat-driven agents, use `/ai/execute` so destructive actions remain confirmation-gated and writes are identified in the audit log.

For the complete route list, request `/api/v1/openapi.json`, open `/api/docs`, or see [api.md](./api.md).

## Operational checklist

- Verify `/api/v1/health` before starting a session.
- Use HTTPS outside local development.
- Keep the JWT and refresh token in server-side secret storage.
- Fetch the allowed endpoint list instead of assuming permissions.
- Validate all model-produced method, path, and body values before sending them.
- Require explicit confirmation for each flagged destructive action.
- Use idempotent reads to recover from uncertain network failures; do not automatically replay writes.
- Treat backend responses—not model narration—as the source of truth for success.
