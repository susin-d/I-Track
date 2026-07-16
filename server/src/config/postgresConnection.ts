import pg from "pg";

const { Pool } = pg;

export type DatabaseConnection = {
  source: "DATABASE_URL" | "SUPABASE_DATABASE_URL";
  connectionString: string;
};

export function configuredDatabaseConnections(environment: NodeJS.ProcessEnv = process.env): DatabaseConnection[] {
  const candidates: DatabaseConnection[] = [
    { source: "SUPABASE_DATABASE_URL", connectionString: environment.SUPABASE_DATABASE_URL ?? "" },
    { source: "DATABASE_URL", connectionString: environment.DATABASE_URL ?? "" },
  ];

  const seen = new Set<string>();
  return candidates.filter(({ connectionString }) => {
    if (!connectionString || seen.has(connectionString)) return false;
    seen.add(connectionString);
    return true;
  });
}

function connectionTimeoutMillis(environment: NodeJS.ProcessEnv = process.env) {
  const configured = Number(environment.DATABASE_CONNECT_TIMEOUT_MS ?? 5000);
  return Number.isFinite(configured) && configured > 0 ? configured : 5000;
}

function createPool(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
  return new Pool({
    connectionString,
    connectionTimeoutMillis: connectionTimeoutMillis(environment),
    ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
}

export async function connectFirstAvailablePostgres(
  candidates = configuredDatabaseConnections(),
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!candidates.length) {
    throw new Error("DATABASE_URL or SUPABASE_DATABASE_URL is required for PostgreSQL");
  }

  for (const [index, candidate] of candidates.entries()) {
    const pool = createPool(candidate.connectionString, environment);
    try {
      await pool.query("select 1");
      return { pool, source: candidate.source };
    } catch {
      await pool.end().catch(() => undefined);
      if (index < candidates.length - 1) {
        console.warn(`${candidate.source} is unavailable; trying ${candidates[index + 1].source}`);
      }
    }
  }

  throw new Error(`Unable to connect using ${candidates.map(({ source }) => source).join(" or ")}`);
}
