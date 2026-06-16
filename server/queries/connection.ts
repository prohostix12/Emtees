import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    const isLocal = env.databaseUrl.includes("localhost") || env.databaseUrl.includes("127.0.0.1");
    const pool = new pg.Pool({
      connectionString: env.databaseUrl,
      connectionTimeoutMillis: 5000, // 5 seconds connection timeout
      query_timeout: 5000,           // 5 seconds query timeout
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    instance = drizzle(pool, { schema: fullSchema });
  }
  return instance;
}
