import assert from "node:assert/strict";
import test from "node:test";
import { generatedTicketSchema, normalizeGeneratedTicketPlan } from "./ai.js";

test("normalizes common provider drift in generated ticket plans", () => {
  const normalized = normalizeGeneratedTicketPlan({
    epic: { title: "Profile settings", description: "Let users manage profile settings." },
    stories: [{
      title: "Edit profile",
      description: "Allow a user to edit profile information.",
      acceptanceCriteria: "Name can be changed.\n- Changes are saved.",
      priority: "P1",
      storyPoints: "5",
      labels: "profile; settings",
      tasks: [{ title: "Build form", description: "Create the profile editing form.", storyPoints: "3", dependencies: "" }],
    }],
  });
  const parsed = generatedTicketSchema.safeParse(normalized);
  if (!parsed.success) assert.fail(JSON.stringify(parsed.error.issues));
  if (parsed.success) {
    assert.equal(parsed.data.stories[0]?.priority, "high");
    assert.deepEqual(parsed.data.stories[0]?.acceptanceCriteria, ["Name can be changed.", "Changes are saved."]);
  }
});
