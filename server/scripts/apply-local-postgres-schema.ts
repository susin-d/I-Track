import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/apply-postgres-schema.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: process.env.LOCAL_DATABASE_URL ?? "postgresql://jiira:jiira_dev_password@127.0.0.1:5433/jiira",
    SUPABASE_DATABASE_URL: "",
  },
  stdio: "inherit",
});

process.exitCode = result.status ?? 1;
