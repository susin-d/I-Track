import mongoose, { Schema } from "mongoose";

export type TicketStatus = "Backlog" | "To Do" | "In Progress" | "In Review" | "Done";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface ITicket {
  organization: mongoose.Types.ObjectId;
  ticketId: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: TicketStatus;
  priority: TicketPriority;
  storyPoints: number;
  assignee?: mongoose.Types.ObjectId;
  reporter: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  sprint: mongoose.Types.ObjectId;
  epic: string;
  labels: string[];
  dueDate: Date;
  blocked: boolean;
  dependencies: string[];
  comments: { author: string; body: string; createdAt: Date }[];
  workLogs: { author: string; hours: number; note: string; createdAt: Date }[];
  history: { event: string; createdAt: Date }[];
  watchers: mongoose.Types.ObjectId[];
  attachments: { name: string; url: string; mimeType?: string; size?: number; uploadedBy: mongoose.Types.ObjectId; createdAt: Date }[];
  rank: number;
  archivedAt?: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    ticketId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    acceptanceCriteria: [{ type: String }],
    status: { type: String, required: true },
    priority: { type: String, required: true },
    storyPoints: { type: Number, required: true },
    assignee: { type: Schema.Types.ObjectId, ref: "User" },
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    sprint: { type: Schema.Types.ObjectId, ref: "Sprint", required: true },
    epic: { type: String, required: true },
    labels: [{ type: String }],
    dueDate: { type: Date, required: true },
    blocked: { type: Boolean, default: false },
    dependencies: [{ type: String }],
    comments: [{ author: String, body: String, createdAt: Date }],
    workLogs: [{ author: String, hours: Number, note: String, createdAt: Date }],
    history: [{ event: String, createdAt: Date }],
    watchers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    attachments: [{ name: String, url: String, mimeType: String, size: Number, uploadedBy: { type: Schema.Types.ObjectId, ref: "User" }, createdAt: Date }],
    rank: { type: Number, default: 0 },
    archivedAt: Date,
  },
  { timestamps: true },
);

ticketSchema.index({ organization: 1, ticketId: 1 }, { unique: true });

export const Ticket = mongoose.model<ITicket>("Ticket", ticketSchema);
