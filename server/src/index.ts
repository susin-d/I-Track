import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";

const app = createApp();

await connectDb();
app.listen(env.port, () => {
  console.log(`I-TRACK API listening on http://localhost:${env.port}`);
});
