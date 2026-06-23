import { eq, sql } from "drizzle-orm";
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
    prefix = env.studentIdPrefix || "S";
    padding = prefix === "S" ? 3 : 4;
  } else if (role === "teacher") {
    prefix = "T";
    padding = 3;
  } else if (role === "sales_executive") {
    prefix = "SALE";
    padding = 3;
  } else {
    prefix = "A";
    padding = 2;
  }

  // 1. Fast check outside transaction: if exists and is initialized, do atomic update+return directly.
  const seq = await db.query.idSequences.findFirst({
    where: eq(idSequences.rolePrefix, prefix),
  });

  if (seq && seq.lastValue > 0) {
    const result = await db.update(idSequences)
      .set({ lastValue: sql`${idSequences.lastValue} + 1` })
      .where(eq(idSequences.rolePrefix, prefix))
      .returning({ lastValue: idSequences.lastValue });
    const nextVal = result[0]?.lastValue;
    if (nextVal) {
      return `${prefix}${String(nextVal).padStart(padding, "0")}`;
    }
  }

  // 2. If row doesn't exist, insert it safely
  if (!seq) {
    await db.insert(idSequences)
      .values({ rolePrefix: prefix, lastValue: 0 })
      .onConflictDoNothing();
  }

  // 3. Slow path: run transaction lock to initialize the sequence value
  const nextNum = await db.transaction(async (tx) => {
    const rows = await tx.select()
      .from(idSequences)
      .where(eq(idSequences.rolePrefix, prefix))
      .for("update");
    
    const currentSeq = rows[0];
    if (!currentSeq) {
      throw new Error(`Failed to retrieve or lock sequence for prefix ${prefix}`);
    }

    if (currentSeq.lastValue === 0) {
      const existing = await tx.select({ unionId: users.unionId })
        .from(users)
        .where(sql`${users.unionId} LIKE ${prefix + '%'}`);
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
      const nextVal = currentSeq.lastValue + 1;
      await tx.update(idSequences)
        .set({ lastValue: nextVal })
        .where(eq(idSequences.rolePrefix, prefix));
      return nextVal;
    }
  });

  return `${prefix}${String(nextNum).padStart(padding, "0")}`;
}
