# I-TRACK API Reference

Base URL: `http://localhost:4000/api/v1`

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
| `POST` | `/auth/refresh` | Public | No |
| `POST` | `/auth/logout` | Public | No |
| `GET` | `/auth/me` | all | No |
| `POST` | `/auth/forgot-password` | Public | No |
| `POST` | `/auth/reset-password` | Public | No |
| `POST` | `/auth/change-password` | all | No |
| `POST` | `/auth/accept-invite` | Public | No |
| `GET` | `/auth/sessions` | all | No |
| `DELETE` | `/auth/sessions/:id` | all | Requires confirmation |

## Users

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `GET` | `/users` | all | No |
| `GET` | `/users/:id` | all | No |
| `PATCH` | `/users/:id` | admin | No |
| `POST` | `/users/:id/deactivate` | admin | Requires confirmation |
| `POST` | `/users/:id/reactivate` | all | No |
| `DELETE` | `/users/:id` | admin | Requires confirmation |
| `POST` | `/invitations` | admin | No |
| `POST` | `/invitations/:userId/resend` | admin | No |
| `DELETE` | `/invitations/:userId` | admin | Requires confirmation |

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
| `POST` | `/notifications/read-all` | all | Requires confirmation |
| `GET` | `/audit-logs` | admin | No |
| `GET` | `/integrations/:kind` | admin | No |
| `POST` | `/integrations/:kind` | admin | No |
| `DELETE` | `/integrations/:kind/:id` | admin | Requires confirmation |
| `PATCH` | `/organization` | admin | No |
| `DELETE` | `/organization` | admin | Requires confirmation |
| `GET` | `/organization/usage` | admin | No |
| `GET` | `/export` | admin | No |
| `POST` | `/import/resources` | admin | No |
| `GET` | `/reports` | all | No |
| `GET` | `/dashboard` | all | No |

## Intelligence

| Method | Endpoint | Access | Confirmation |
| --- | --- | --- | --- |
| `POST` | `/analysis/sprint-risk` | all | No |
| `GET` | `/analysis/examples` | all | No |
| `GET` | `/ai/endpoints` | all | No |
| `POST` | `/ai/execute` | all | No |
| `GET` | `/ai/models` | all | No |
| `POST` | `/ai/generate-tickets` | all | No |
| `POST` | `/ai/confirm-ticket-plan` | leaders | No |

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
