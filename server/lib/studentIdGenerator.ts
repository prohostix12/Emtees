import { eq, sql, and } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { profiles, studentIdSequence, users } from "@db/schema";

/**
 * Thread-safe generation of the next unique Student Enrollment ID (Admission Number).
 * It will resolve the active prefix, increment the sequence counter, check for conflicts,
 * and loop if any conflicting manual entries are detected in the database.
 */
export async function generateNextEnrollmentId(): Promise<string> {
  const db = getDb();

  // 1. Get the active student ID prefix from systemSettings key-value store
  const activePrefixRow = await db.query.systemSettings.findFirst({
    where: eq(sql`key`, "active_student_id_prefix"),
  });
  const activePrefix = activePrefixRow?.value || "STU";

  // 2. Ensure sequence row exists for the active prefix
  let seq = await db.query.studentIdSequence.findFirst({
    where: eq(studentIdSequence.prefix, activePrefix),
  });

  if (!seq) {
    await db.insert(studentIdSequence)
      .values({
        prefix: activePrefix,
        lastNumber: 0,
        numberLength: 4,
      })
      .onConflictDoNothing();
  }

  // 3. Atomically increment sequence in a loop until a truly unique ID is found
  let nextId = "";
  let isUnique = false;

  while (!isUnique) {
    const updateResult = await db.update(studentIdSequence)
      .set({ lastNumber: sql`${studentIdSequence.lastNumber} + 1` })
      .where(eq(studentIdSequence.prefix, activePrefix))
      .returning({ lastNumber: studentIdSequence.lastNumber, numberLength: studentIdSequence.numberLength });

    const updatedSeq = updateResult[0];
    if (!updatedSeq) {
      // In the rare case of concurrent insert/conflict, insert and retry
      await db.insert(studentIdSequence)
        .values({
          prefix: activePrefix,
          lastNumber: 1,
          numberLength: 4,
        })
        .onConflictDoNothing();
      continue;
    }

    const formattedNum = String(updatedSeq.lastNumber).padStart(updatedSeq.numberLength, "0");
    nextId = `${activePrefix}${formattedNum}`;

    // Verify uniqueness against database profiles.enrollmentId
    const conflictProfile = await db.query.profiles.findFirst({
      where: eq(profiles.enrollmentId, nextId),
    });

    // Also check against users.unionId for students to prevent duplicates with backfilled accounts
    const conflictUser = await db.query.users.findFirst({
      where: and(eq(users.unionId, nextId), eq(users.role, "student")),
    });

    if (!conflictProfile && !conflictUser) {
      isUnique = true;
    }
  }

  return nextId;
}
