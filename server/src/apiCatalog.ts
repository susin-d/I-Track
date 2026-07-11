export const apiCatalog = {
  version: "1.0.0",
  basePath: "/api/v1",
  groups: {
    auth: ["POST /auth/register", "POST /auth/login", "POST /auth/refresh", "POST /auth/logout", "GET /auth/me", "POST /auth/forgot-password", "POST /auth/reset-password", "POST /auth/change-password", "POST /auth/accept-invite", "GET /auth/sessions", "DELETE /auth/sessions/:id"],
    users: ["GET /users", "GET /users/:id", "PATCH /users/:id", "POST /users/:id/deactivate", "POST /users/:id/reactivate", "DELETE /users/:id", "POST /invitations", "POST /invitations/:userId/resend", "DELETE /invitations/:userId"],
    projects: ["GET /projects", "POST /projects", "GET /projects/:id", "PATCH /projects/:id", "DELETE /projects/:id", "PUT /projects/:id/members", "POST /projects/:id/archive", "POST /projects/:id/restore"],
    planning: ["GET /backlog", "GET /sprints", "POST /sprints", "PATCH /sprints/:id", "DELETE /sprints/:id", "POST /sprints/:id/start", "POST /sprints/:id/complete", "POST /sprints/:id/reopen"],
    tickets: ["GET /tickets", "POST /tickets", "GET /tickets/:ticketId", "PATCH /tickets/:id", "DELETE /tickets/:id", "POST /tickets/bulk", "POST /tickets/:id/assign", "PATCH /tickets/:id/status", "PATCH /tickets/:id/rank", "POST /tickets/:id/archive", "POST /tickets/:id/restore", "POST /tickets/:id/clone", "POST /tickets/:id/watch", "DELETE /tickets/:id/watch", "GET /tickets/:id/history", "POST /tickets/:id/comments", "PATCH /tickets/:id/comments/:commentId", "DELETE /tickets/:id/comments/:commentId", "POST /tickets/:id/work-logs", "PATCH /tickets/:id/work-logs/:logId", "DELETE /tickets/:id/work-logs/:logId", "PATCH /tickets/:id/dependencies", "POST /tickets/:id/attachments", "DELETE /tickets/:id/attachments/:attachmentId"],
    resources: ["GET /resources/:kind", "POST /resources/:kind", "GET /resources/:kind/:id", "PATCH /resources/:kind/:id", "DELETE /resources/:kind/:id"],
    operations: ["GET /notifications", "PATCH /notifications/:id/read", "POST /notifications/read-all", "GET /audit-logs", "GET /integrations/:kind", "POST /integrations/:kind", "DELETE /integrations/:kind/:id", "PATCH /organization", "DELETE /organization", "GET /organization/usage", "GET /export", "POST /import/resources", "GET /reports", "GET /dashboard"],
    intelligence: ["POST /analysis/sprint-risk", "GET /analysis/examples", "GET /ai/endpoints", "POST /ai/execute", "GET /ai/models", "POST /ai/generate-tickets", "POST /ai/confirm-ticket-plan"],
  },
};
