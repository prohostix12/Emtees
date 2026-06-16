import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users, idSequences } from "@db/schema";
import { env } from "./env";

/**
 * Generates a role-based unique ID that is guaranteed to never be reused.
 * Format mappings:
 * - student -> STU0001, STU0002, ... (configurable prefix, 4 digits padding)
 * - teacher -> T001, T002, ... (T prefix, 3 digits padding)
 * - admin/super_admin/academic_head -> A01, A02, ... (A prefix, 2 digits padding)
 */
export async function getNextUniqueId(role: string): Promise<string> {
  const db = getDb();
  let prefix = "A";
  let padding = 2;

  if (role === "student") {
    prefix = env.studentIdPrefix || "STU";
    padding = 4;
  } else if (role === "teacher") {
    prefix = "T";
    padding = 3;
  } else {
    prefix = "A";
    padding = 2;
  }

  const nextNum = await db.transaction(async (tx) => {
    // Ensure the row exists by inserting a default on conflict do nothing
    await tx.insert(idSequences)
      .values({ rolePrefix: prefix, lastValue: 0 })
      .onConflictDoNothing();

    // Select the row and lock it for update
    const rows = await tx.select()
      .from(idSequences)
      .where(eq(idSequences.rolePrefix, prefix))
      .for("update");
    
    const seq = rows[0];
    if (!seq) {
      throw new Error(`Failed to retrieve or lock sequence for prefix ${prefix}`);
    }

    if (seq.lastValue === 0) {
      // Sequence was just initialized to 0. We need to compute the correct starting value.
      // To prevent conflicts with pre-existing database seeds, scan the existing users.
      const existing = await tx.select({ unionId: users.unionId }).from(users);
      let maxNum = 0;

      for (const u of existing) {
        if (u.unionId && u.unionId.startsWith(prefix)) {
          const numPart = parseInt(u.unionId.slice(prefix.length), 10);
          if (!isNaN(numPart) && numPart > maxNum) {
            maxNum = numPart;
          }
        }
      }

      const startValue = maxNum + 1;
      await tx.update(idSequences)
        .set({ lastValue: startValue })
        .where(eq(idSequences.rolePrefix, prefix));
      return startValue;
    } else {
      // Sequence exists and is initialized: increment and update
      const nextVal = seq.lastValue + 1;
      await tx.update(idSequences)
        .set({ lastValue: nextVal })
        .where(eq(idSequences.rolePrefix, prefix));
      return nextVal;
    }
  });

  return `${prefix}${String(nextNum).padStart(padding, "0")}`;
}
