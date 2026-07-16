import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL is required");

const migrationUrl = new URL("../../supabase/migrations/20260716000000_initial_jira_schema.sql", import.meta.url);
const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(sql);
  console.log("PostgreSQL schema applied successfully");
} finally {
  await pool.end();
}
