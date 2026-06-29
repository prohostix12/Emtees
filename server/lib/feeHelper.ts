import { getDb } from "../queries/connection";
import { profiles, batchEnrollments, payments, studentFeeConfigurations } from "@db/schema";
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

  // 1. Fetch profile
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, studentId),
  });
  if (!profile) return;

  // 2. Fetch or initialize studentFeeConfigurations (Single Source of Truth)
  let feeConfig = await db.query.studentFeeConfigurations.findFirst({
    where: eq(studentFeeConfigurations.studentId, studentId),
  });

  if (!feeConfig) {
    const defaultTotal = parseFloat(profile.totalCourseFee || profile.feesTotal || "0");
    const [inserted] = await db.insert(studentFeeConfigurations).values({
      studentId,
      totalCourseFee: String(defaultTotal),
      discount: "0.00",
      discountType: "flat",
      finalFee: String(defaultTotal),
      paymentMode: profile.paymentOption?.toUpperCase() === "INSTALLMENT" ? "INSTALLMENT" : "FULL_PAYMENT",
      downPayment: profile.downPayment || "0.00",
      numberOfInstallments: 1,
    }).returning();
    feeConfig = inserted;
  }

  // 3. Sum up all paid tuition payments
  const paidPayments = await db.query.payments.findMany({
    where: and(
      eq(payments.studentId, studentId),
      eq(payments.type, "tuition"),
      eq(payments.status, "paid")
    ),
  });

  const feesPaid = paidPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const finalFee = parseFloat(feeConfig.finalFee ?? "0");
  const feesBalance = Math.max(0, finalFee - feesPaid);

  let paymentStatus: "paid" | "partial" | "unpaid" = "unpaid";
  if (feesBalance <= 0) {
    paymentStatus = "paid";
  } else if (feesPaid > 0) {
    paymentStatus = "partial";
  }

  // 4. Find the next unpaid installment due date
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

  // 5. Update student profile for backward compatibility and quick querying
  await db.update(profiles)
    .set({
      feesPaid: String(feesPaid),
      feesBalance: String(feesBalance),
      remainingBalance: String(feesBalance),
      totalCourseFee: String(finalFee),
      feesTotal: String(finalFee),
      paymentStatus,
      paymentDueDate,
    })
    .where(eq(profiles.userId, studentId));
}
