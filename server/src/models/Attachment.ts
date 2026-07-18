import { createPgModel } from "../db/pgModel.js";
import { Organization } from "./Organization.js";
import { Ticket } from "./Ticket.js";
import { User } from "./User.js";

export const TicketAttachment = createPgModel({
  table: "ticket_attachments",
  columns: ["organization", "ticket", "name", "storageKey", "sourceUrl", "mimeType", "size", "uploadedBy"],
  columnMap: { uploadedBy: "uploaded_by" },
  relations: { organization: { model: () => Organization }, ticket: { model: () => Ticket }, uploadedBy: { model: () => User } },
});
