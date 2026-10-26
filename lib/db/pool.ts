import { Pool, types } from "pg";

// BIGINT ids and COUNT(*) fit safely in a JS number for this app.
types.setTypeParser(20, (v) => parseInt(v, 10));

const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  return new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
}

// Reuse one pool across hot reloads and serverless invocations.
export const pool: Pool = globalForPg.pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;
