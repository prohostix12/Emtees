import pg from "pg";
import { env } from "../server/lib/env";

async function applyManualMigration() {
  console.log("Applying manual migrations for Performance module...");
  const isLocal = env.databaseUrl.includes("localhost") || env.databaseUrl.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log("Creating performance_configs table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "performance_configs" (
        "id" serial PRIMARY KEY NOT NULL,
        "type" varchar(20) NOT NULL,
        "name" varchar(255) NOT NULL,
        "criteria" json NOT NULL,
        "is_default" boolean DEFAULT false NOT NULL,
        "created_by" bigint REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Creating performance_reports table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "performance_reports" (
        "id" serial PRIMARY KEY NOT NULL,
        "parent_report_id" integer REFERENCES "performance_reports"("id") ON DELETE SET NULL,
        "version" integer DEFAULT 1 NOT NULL,
        "is_latest" boolean DEFAULT true NOT NULL,
        "target_user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar(20) NOT NULL,
        "config_id" bigint REFERENCES "performance_configs"("id") ON DELETE SET NULL,
        "assessment_period" varchar(50) NOT NULL,
        "start_date" timestamp NOT NULL,
        "end_date" timestamp NOT NULL,
        "status" varchar(20) DEFAULT 'draft' NOT NULL,
        "auto_metrics" json NOT NULL,
        "qualitative_scores" json NOT NULL,
        "total_score" decimal(5, 2) NOT NULL,
        "grade" varchar(10),
        "remarks" text,
        "created_by" bigint REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Migration applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyManualMigration();
