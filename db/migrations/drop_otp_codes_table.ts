import { getDb } from "../../server/queries/connection";
import { sql } from "drizzle-orm";

async function run() {
  const isLocal = process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1");
  if (!isLocal && process.env.CONFIRM_DROP !== "true") {
    console.error("CRITICAL WARNING: You are attempting to run a destructive database script on a non-local database!");
    console.error("To proceed, you must run this script with CONFIRM_DROP=true set in your environment.");
    process.exit(1);
  }

  const db = getDb();
  console.log("Dropping otp_codes table...");
  await db.execute(sql`DROP TABLE IF EXISTS "otp_codes" CASCADE;`);
  console.log("Table dropped successfully.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
