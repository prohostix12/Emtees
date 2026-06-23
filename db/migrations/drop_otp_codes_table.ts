import { getDb } from "../../server/queries/connection";
import { sql } from "drizzle-orm";

async function run() {
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
