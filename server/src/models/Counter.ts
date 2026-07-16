import { createPgModel } from "../db/pgModel.js";

export const Counter = createPgModel({ table: "counters", columns: ["organization", "scope", "value"], defaults: { value: 100 }, timestamps: false });
