import { getDb } from "../queries/connection";
import { profiles, batchEnrollments } from "@db/schema";
import { eq, and } from "drizzle-orm";

export async function isStudentFeeRestricted(studentId: number): Promise<boolean> {
  const db = getDb();
  
  // 1. Check if they have any enrollment with status "restricted"
  const restrictedEnrollment = await db.query.batchEnrollments.findFirst({
    where: and(
      eq(batchEnrollments.studentId, studentId),
      eq(batchEnrollments.status, "restricted")
    ),
  });
  if (restrictedEnrollment) return true;

  // 2. Check if their profile grace period has expired
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, studentId),
  });
  if (profile && parseFloat(profile.feesBalance ?? "0") > 0 && profile.paymentDueDate) {
    const dueDate = new Date(profile.paymentDueDate);
    const gracePeriodDays = profile.gracePeriodDays ?? 7;
    const restrictionDate = new Date(dueDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
    if (new Date() > restrictionDate) {
      return true;
    }
  }

  return false;
}
