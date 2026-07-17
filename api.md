# I-TRACK API Reference

Base URL: `http://localhost:4000/api/v1` (canonical)

The server also exposes the same application routes under `http://localhost:4000/api` for compatibility. Use `/api/v1` for new clients.

Swagger UI: `http://localhost:4000/api/docs`

OpenAPI JSON: `http://localhost:4000/api/v1/openapi.json`

## Authentication

Most endpoints require an I-TRACK JWT access token:

```http
Authorization: Bearer <token>
```

Get a token with `POST /auth/login`. Public auth endpoints are listed below as `Public`.

Roles:

- `admin`
- `manager`
- `engineer`
- `designer`

Each workspace also supports custom role slugs. Workspace administrators can create
custom roles and edit the permission set assigned to built-in or custom roles. The
built-in role names above are seeded automatically when a workspace is first used.

Role groups:

- `all`: `admin`, `manager`, `engineer`, `designer`
- `leaders`: `admin`, `manager`
- `admin`: `admin`

Endpoints marked `Requires confirmation` are destructive when called through the AI gateway. The AI gateway requires `confirmed: true` before executing them.

## AI Gateway

The AI gateway lets AI call API endpoints with the same JWT, organization scope, and role permissions as the current user.

Example read:

```json
{
  "method": "GET",
  "path": "/tickets"
}
```

Example confirmed destructive action:

```json
{
  "method": "DELETE",
  "path": "/tickets/65f000000000000000000001",
  "confirmed": true
}
```

Without confirmation, destructive actions return `409`:

```json
{
  "requiresConfirmation": true,
  "action": "DELETE /tickets/65f000000000000000000001",
  "message": "Confirm this destructive action before AI performs it."
}
```

## Auth

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | No |
| `POST` | `/auth/login` | Public | No |
| `POST` | `/auth/verify-otp` | Public | No |
| `POST` | `/auth/resend-otp` | Public | No |
| `POST` | `/auth/refresh` | Public | No |
| `POST` | `/auth/logout` | Public | No |
| `GET` | `/auth/me` | all | No |
| `POST` | `/auth/forgot-password` | Public | No |
| `POST` | `/auth/reset-password` | Public | No |
| `POST` | `/auth/change-password` | all | No |
| `PATCH` | `/auth/preferences` | all | No |
| `POST` | `/auth/accept-invite` | Public | No |
| `GET` | `/auth/sessions` | all | No |
| `DELETE` | `/auth/sessions/:id` | all | Requires confirmation |

## Workspaces

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/workspaces` | authenticated identity | No |
| `POST` | `/workspaces` | authenticated identity | No |
| `POST` | `/workspaces/:id/switch` | member | No |
| `POST` | `/workspaces/:id/onboarding/complete` | admin | No |
| `GET` | `/invitations/preview` | Public | No |
| `GET` | `/invitations/pending` | authenticated identity | No |

Access tokens are scoped to one active workspace. Switching workspaces returns replacement access and refresh tokens after validating the membership.

`GET /invitations/preview` expects the invitation token in the `token` query parameter.

## Organizations

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/companies` | all | No |
| `GET` | `/companies/:companyId/workspaces` | all | No |
| `GET` | `/companies/:companyId/members` | all | No |
| `POST` | `/companies/:companyId/workspaces` | admin | No |
| `GET` | `/companies/:companyId/groups` | all | No |
| `POST` | `/companies/:companyId/groups` | admin | No |
| `PATCH` | `/companies/:companyId/groups/:id` | admin | No |
| `DELETE` | `/companies/:companyId/groups/:id` | admin | Requires confirmation |
| `PUT` | `/companies/:companyId/groups/:id/members` | admin | No |
| `PUT` | `/companies/:companyId/groups/:id/workspaces` | admin | No |


## Current User

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/me` | all | No |

## Users

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/team` | all | No |
| `POST` | `/team` | admin | No |
| `GET` | `/users` | all | No |
| `GET` | `/users/:id` | all | No |
| `PATCH` | `/users/:id` | admin | No |
| `POST` | `/users/:id/deactivate` | admin | Requires confirmation |
| `POST` | `/users/:id/reactivate` | admin | No |
| `DELETE` | `/users/:id` | admin | Requires confirmation |
| `POST` | `/invitations` | admin | No |
| `POST` | `/invitations/:id/resend` | admin | No |
| `DELETE` | `/invitations/:id` | admin | Requires confirmation |

## Roles and permissions

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/roles` | all | No |
| `POST` | `/roles` | admin | No |
| `PATCH` | `/roles/:id` | admin | No |
| `DELETE` | `/roles/:id` | admin | Requires confirmation |

`POST /roles` accepts `name`, optional `description`, and a `permissions` array.
`PATCH /roles/:id` updates the role name, description, and permissions. Built-in
roles cannot be deleted; the Administrator role always retains full access. A
custom role cannot be deleted while it is assigned to users, invitations, or
organization-group workspace grants.

## Projects

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/projects` | all | No |
| `POST` | `/projects` | leaders | No |
| `GET` | `/projects/:id` | all | No |
| `PATCH` | `/projects/:id` | leaders | No |
| `DELETE` | `/projects/:id` | leaders | Requires confirmation |
| `PUT` | `/projects/:id/members` | leaders | No |
| `POST` | `/projects/:id/archive` | leaders | Requires confirmation |
| `POST` | `/projects/:id/restore` | leaders | No |

## Planning

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/backlog` | all | No |
| `GET` | `/sprints` | all | No |
| `POST` | `/sprints` | leaders | No |
| `PATCH` | `/sprints/:id` | leaders | No |
| `DELETE` | `/sprints/:id` | leaders | Requires confirmation |
| `POST` | `/sprints/:id/start` | leaders | No |
| `POST` | `/sprints/:id/complete` | leaders | Requires confirmation |
| `POST` | `/sprints/:id/reopen` | leaders | No |
| `GET` | `/cycles` | all | No |
| `POST` | `/cycles` | leaders | No |
| `GET` | `/cycles/:id` | all | No |
| `PATCH` | `/cycles/:id` | leaders | No |
| `DELETE` | `/cycles/:id` | leaders | Requires confirmation |

## Tickets

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/tickets` | all | No |
| `POST` | `/tickets` | leaders | No |
| `GET` | `/tickets/:ticketId` | all | No |
| `PATCH` | `/tickets/:id` | leaders | No |
| `DELETE` | `/tickets/:id` | leaders | Requires confirmation |
| `POST` | `/tickets/bulk` | leaders | No |
| `POST` | `/tickets/:id/assign` | all | No |
| `PATCH` | `/tickets/:id/status` | all | No |
| `PATCH` | `/tickets/:id/rank` | all | No |
| `POST` | `/tickets/:id/links` | all | No |
| `POST` | `/tickets/:id/archive` | leaders | Requires confirmation |
| `POST` | `/tickets/:id/restore` | leaders | No |
| `POST` | `/tickets/:id/clone` | leaders | No |
| `POST` | `/tickets/:id/watch` | all | No |
| `DELETE` | `/tickets/:id/watch` | all | Requires confirmation |
| `GET` | `/tickets/:id/history` | all | No |
| `POST` | `/tickets/:id/comments` | all | No |
| `PATCH` | `/tickets/:id/comments/:commentId` | all | No |
| `DELETE` | `/tickets/:id/comments/:commentId` | all | Requires confirmation |
| `POST` | `/tickets/:id/work-logs` | all | No |
| `PATCH` | `/tickets/:id/work-logs/:logId` | all | No |
| `DELETE` | `/tickets/:id/work-logs/:logId` | all | Requires confirmation |
| `PATCH` | `/tickets/:id/dependencies` | leaders | No |
| `POST` | `/tickets/:id/attachments` | all | No |
| `DELETE` | `/tickets/:id/attachments/:attachmentId` | all | Requires confirmation |

## Resources

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/resources/:kind` | all | No |
| `POST` | `/resources/:kind` | leaders | No |
| `GET` | `/resources/:kind/:id` | all | No |
| `PATCH` | `/resources/:kind/:id` | leaders | No |
| `DELETE` | `/resources/:kind/:id` | leaders | Requires confirmation |

## Operations

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/notifications` | all | No |
| `PATCH` | `/notifications/:id/read` | all | No |
| `POST` | `/notifications/read-all` | all | No |
| `GET` | `/audit-logs` | admin | No |
| `GET` | `/audit-logs/export` | admin | No |
| `GET` | `/integrations/:kind` | admin | No |
| `POST` | `/integrations/:kind` | admin | No |
| `DELETE` | `/integrations/:kind/:id` | admin | Requires confirmation |
| `GET` | `/settings` | all | No |
| `PATCH` | `/settings` | admin | No |
| `GET` | `/sla` | all | No |
| `PATCH` | `/sla/policy` | leaders | No |
| `PATCH` | `/organization` | admin | No |
| `DELETE` | `/organization` | admin | Requires confirmation |
| `GET` | `/organization/usage` | admin | No |
| `GET` | `/export` | admin | No |
| `POST` | `/import/resources` | admin | No |
| `GET` | `/reports` | all | No |
| `GET` | `/reports/cycle-time` | all | No |
| `GET` | `/dashboard` | all | No |
| `GET` | `/my-work` | all | No |

## Intelligence

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `POST` | `/analysis/sprint-risk` | leaders | No |
| `GET` | `/analysis/examples` | all | No |
| `GET` | `/ai/endpoints` | all | No |
| `POST` | `/ai/execute` | all | No |
| `GET` | `/ai/models` | all | No |
| `GET` | `/ai/conversations` | all | No |
| `GET` | `/ai/conversations/:id/messages` | all | No |
| `DELETE` | `/ai/conversations/:id` | all | Requires confirmation |
| `POST` | `/ai/chat` | all | No |
| `POST` | `/ai/generate-tickets` | all | No |
| `POST` | `/ai/confirm-ticket-plan` | leaders | No |

### Ticket list filters

`GET /tickets` accepts `page`, `limit` (maximum `100`), `search`, and `sort`, plus the optional filters `status`, `priority`, `project`, `sprint`, `assignee`, and `label`. Search matches ticket titles, ticket ids, and labels. Responses include `{ tickets, meta: { page, limit, total, pages } }`.

### AI ticket planning

Generate a plan without writing tickets:

```http
POST /ai/generate-tickets
Content-Type: application/json
```

```json
{
  "prompt": "Create a detailed sprint plan for a password reset flow with validation, email delivery, and audit logging.",
  "model": "provider-model-id"
}
```

The response is `{ "plan": { "epic": ..., "stories": [...] } }`. The plan contains stories and tasks with acceptance criteria, lowercase priorities, story points, labels, and dependencies. It is not persisted until confirmed.

Persist an unchanged generated plan as admin or manager:

```json
{
  "plan": { "epic": { "title": "...", "description": "..." }, "stories": [] },
  "projectId": "project-id",
  "sprintId": "sprint-id",
  "assigneeId": "user-id"
}
```

`GET /ai/models` returns provider model ids. It returns `503` when the provider cannot be inspected. AI endpoints require `OPENAI_API_KEY`; `OPENAI_BASE_URL` and `OPENAI_MODEL` configure the OpenAI-compatible provider.

## Common Responses

`400 Bad Request`

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request"
  }
}
```

`401 Unauthorized`

```json
{
  "message": "Missing bearer token"
}
```

`403 Forbidden`

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Your role cannot access this endpoint"
  }
}
```

`404 Not Found`

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Endpoint not found"
  }
}
```
