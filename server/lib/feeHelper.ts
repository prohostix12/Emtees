import { getDb } from "../queries/connection";
import { profiles, batchEnrollments, payments } from "@db/schema";
import { eq, and, isNotNull, asc } from "drizzle-orm";

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

export async function recalculateStudentFees(studentId: number): Promise<void> {
  const db = getDb();

  // 1. Fetch the profile
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, studentId),
  });
  if (!profile) return;

  // 2. Sum up all paid tuition payments
  const paidPayments = await db.query.payments.findMany({
    where: and(
      eq(payments.studentId, studentId),
      eq(payments.type, "tuition"),
      eq(payments.status, "paid")
    ),
  });

  const feesPaid = paidPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const totalCourseFeeFloat = parseFloat(profile.totalCourseFee ?? "0");
  const feesTotalVal = totalCourseFeeFloat > 0 ? (profile.totalCourseFee ?? "0") : (profile.feesTotal || "0");
  const feesTotal = parseFloat(feesTotalVal);
  const feesBalance = Math.max(0, feesTotal - feesPaid);

  let paymentStatus: "paid" | "partial" | "unpaid" = "unpaid";
  if (feesBalance <= 0) {
    paymentStatus = "paid";
  } else if (feesPaid > 0) {
    paymentStatus = "partial";
  }

  // 3. Find the next unpaid installment due date
  let paymentDueDate: Date | null = null;
  const activeEnrollment = await db.query.batchEnrollments.findFirst({
    where: and(
      eq(batchEnrollments.studentId, studentId),
      eq(batchEnrollments.status, "active")
    ),
  });

  if (activeEnrollment && feesBalance > 0) {
    const nextUnpaid = await db.query.payments.findFirst({
      where: and(
        eq(payments.studentId, studentId),
        eq(payments.status, "unpaid"),
        isNotNull(payments.installmentNumber)
      ),
      orderBy: asc(payments.installmentNumber),
    });
    if (nextUnpaid?.dueDate) {
      paymentDueDate = nextUnpaid.dueDate;
    }
  }

  // 4. Update student profile
  await db.update(profiles)
    .set({
      feesPaid: String(feesPaid),
      feesBalance: String(feesBalance),
      remainingBalance: String(feesBalance),
      totalCourseFee: String(feesTotal),
      feesTotal: String(feesTotal),
      paymentStatus,
      paymentDueDate,
    })
    .where(eq(profiles.userId, studentId));
}
