export const seedUsers = [
  { name: "Maya Chen", email: "maya@itrack.dev", role: "manager", skills: ["Planning", "Risk", "API"], availability: 1, capacity: 34, avatarColor: "#A47BEF" },
  { name: "Arjun Mehta", email: "arjun@itrack.dev", role: "engineer", skills: ["React", "Node", "AI"], availability: 0.9, capacity: 32, avatarColor: "#4F86F7" },
  { name: "Lena Ortiz", email: "lena@itrack.dev", role: "designer", skills: ["UX", "Research", "Systems"], availability: 0.85, capacity: 28, avatarColor: "#E95A5A" },
  { name: "Noah Singh", email: "noah@itrack.dev", role: "engineer", skills: ["MongoDB", "Security", "DevOps"], availability: 1, capacity: 36, avatarColor: "#4CC38A" },
] as const;

export const ticketTemplates = [
  ["ITR-101", "Generate explainable ticket plans from product briefs", "In Progress", "critical", 8, true, ["AI", "tickets"]],
  ["ITR-102", "Render sprint risk formula breakdown", "In Review", "high", 5, false, ["risk", "explainability"]],
  ["ITR-103", "Add capacity-aware reassignment simulation", "To Do", "high", 8, false, ["simulation"]],
  ["ITR-104", "Create burnout trend report", "Backlog", "medium", 3, false, ["reports"]],
  ["ITR-105", "Persist dependency graph edges", "Done", "medium", 5, false, ["dependencies"]],
  ["ITR-106", "Audit AI generation validation failures", "In Progress", "high", 3, true, ["audit", "AI"]],
] as const;
