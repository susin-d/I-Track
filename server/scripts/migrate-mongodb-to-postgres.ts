import "dotenv/config";
import { MongoClient, type Document } from "mongodb";
import pg from "pg";

const { Pool } = pg;

const mongoUri = process.env.MONGODB_URI;
const databaseUrl = process.env.DATABASE_URL;
const mongoDatabase = process.env.MONGODB_DATABASE;
const batchSize = Number(process.env.MIGRATION_BATCH_SIZE ?? 500);

if (!mongoUri) throw new Error("MONGODB_URI is required");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const tableName = (collection: string) => {
  const safe = collection.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^\d+/, "_");
  return `mongo_${safe || "collection"}`;
};

const jsonValue = (value: unknown) => JSON.stringify(value, (_key, item) => {
  if (item instanceof Date) return item.toISOString();
  if (item && typeof item === "object" && item._bsontype === "ObjectID") return item.toString();
  if (typeof item === "bigint") return item.toString();
  return item;
});

async function migrateCollection(pool: pg.Pool, collection: ReturnType<MongoClient["db"]>["collection"], name: string) {
  const table = tableName(name);
  await pool.query(`CREATE TABLE IF NOT EXISTS "${table}" (\n+    id text PRIMARY KEY,\n+    document jsonb NOT NULL,\n+    migrated_at timestamptz NOT NULL DEFAULT now()\n+  )`);

  const cursor = collection.find({}, { batchSize });
  let migrated = 0;
  let batch: Array<{ id: string; document: string }> = [];

  for await (const document of cursor) {
    const id = String(document._id);
    batch.push({ id, document: jsonValue(document) });
    if (batch.length < batchSize) continue;

    await writeBatch(pool, table, batch);
    migrated += batch.length;
    console.log(`${name}: ${migrated} documents migrated`);
    batch = [];
  }
  if (batch.length) {
    await writeBatch(pool, table, batch);
    migrated += batch.length;
  }
  console.log(`${name}: complete (${migrated} documents)`);
}

async function writeBatch(pool: pg.Pool, table: string, batch: Array<{ id: string; document: string }>) {
  const values: string[] = [];
  const params: unknown[] = [];
  batch.forEach(({ id, document }, index) => {
    const offset = index * 2;
    values.push(`($${offset + 1}, $${offset + 2}::jsonb)`);
    params.push(id, document);
  });
  await pool.query(
    `INSERT INTO "${table}" (id, document) VALUES ${values.join(", ")} ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document, migrated_at = now()`,
    params,
  );
}

async function main() {
  const mongo = new MongoClient(mongoUri!);
  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await mongo.connect();
    const database = mongo.db(mongoDatabase);
    await pool.query("SELECT 1");
    const collections = await database.listCollections({}, { nameOnly: true }).toArray();
    console.log(`Migrating ${collections.length} MongoDB collections to PostgreSQL`);
    for (const { name } of collections) {
      if (name.startsWith("system.")) continue;
      await migrateCollection(pool, database.collection<Document>(name), name);
    }
    console.log("Migration complete");
  } finally {
    await mongo.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
