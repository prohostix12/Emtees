import bcrypt from "bcryptjs";
import { getDb } from "../server/queries/connection";
import { users } from "./schema";

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  const hashedPassword = await bcrypt.hash("admin123", 10);

  await db.insert(users).values({
    unionId: "admin_001",
    name: "Admin",
    username: "admin",
    password: hashedPassword,
    role: "super_admin",
    status: "active",
  }).onConflictDoNothing();

  console.log("Admin created — username: admin, password: admin123");
  process.exit(0);
}

seed();
