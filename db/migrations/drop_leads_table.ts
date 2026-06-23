import { getDb } from "../../server/queries/connection";
import { sql } from "drizzle-orm";

async function run() {
  const db = getDb();
  console.log("Dropping leads and sales_audit_logs tables...");
  await db.execute(sql`DROP TABLE IF EXISTS "leads" CASCADE;`);
  await db.execute(sql`DROP TABLE IF EXISTS "sales_audit_logs" CASCADE;`);
  console.log("Tables dropped successfully.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
