import { eq, and } from "drizzle-orm";
import { profiles, batchEnrollments, payments, users, notifications, batches, modules, studentFeeConfigurations } from "@db/schema";
import { generateNextEnrollmentId } from "./studentIdGenerator";
import { updateStudentSessionBalances } from "./sessionHelper";

export interface ExtraProfileFields {
  gender?: string | null;
  dob?: Date | null;
  address?: string | null;
  postalCode?: string | null;
  qualificationId?: number | null;
  educationalQualification?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentCountryCode?: string | null;
  parentCountryISO?: string | null;
  parentPhoneNumber?: string | null;
  parentFullInternationalNumber?: string | null;
  notes?: string | null;
  oneOnOneEnabled?: boolean;
  groupSessionEnabled?: boolean;
  preferredClassTime?: string | null;
  paymentType?: string | null;
  sessionType?: string | null;
  enrollmentStatus?: string | null;
  oneOnOne30Allocated?: number;
  oneOnOne45Allocated?: number;
  oneOnOne60Allocated?: number;
  group30Allocated?: number;
  group45Allocated?: number;
  group60Allocated?: number;
}

export class EnrollmentPaymentService {
  /**
   * Calculate paid amount, remaining balance, and payment status based on payment option and downpayment rules.
   */
  static calculateFees({
    totalCourseFee,
    paymentOption,
    downPayment,
    minDownPayment,
  }: {
    totalCourseFee: number;
    paymentOption: "full_payment" | "installment" | "FULL_PAYMENT" | "INSTALLMENT";
    downPayment?: number;
    minDownPayment?: number;
  }) {
    let paidAmount = 0;
    if (paymentOption.toUpperCase() === "FULL_PAYMENT") {
      paidAmount = totalCourseFee;
    } else {
      paidAmount = downPayment || minDownPayment || 0;
    }
    const remainingBalance = Math.max(0, totalCourseFee - paidAmount);
    const paymentStatus: "paid" | "partial" | "unpaid" = remainingBalance <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";
    return { paidAmount, remainingBalance, paymentStatus };
  }

  /**
   * Main reusable workflow for student enrollment + initial payment handling.
   */
  static async processEnrollment(
    tx: any,
    params: {
      studentId: number;
      batchId?: number | null;
      moduleId: number;
      totalCourseFee: number;
      paymentOption: "full_payment" | "installment" | "FULL_PAYMENT" | "INSTALLMENT";
      paidAmount: number;
      remainingBalance: number;
      paymentStatus: "paid" | "partial" | "unpaid" | "overdue";
      registrationSource: "direct" | "referral" | "self";
      razorpayPaymentId?: string;
      installments?: { installmentNumber: number; amount: number; dueDate?: string | Date | null }[];
      extraProfileFields?: ExtraProfileFields;
    }
  ) {
    return this.processEnrollmentAndPayments(tx, params);
  }

  static async processEnrollmentAndPayments(
    tx: any,
    {
      studentId,
      batchId,
      moduleId,
      totalCourseFee,
      paymentOption,
      paidAmount,
      remainingBalance,
      paymentStatus,
      registrationSource,
      razorpayPaymentId,
      installments,
      extraProfileFields,
    }: {
      studentId: number;
      batchId?: number | null;
      moduleId: number;
      totalCourseFee: number;
      paymentOption: "full_payment" | "installment" | "FULL_PAYMENT" | "INSTALLMENT";
      paidAmount: number;
      remainingBalance: number;
      paymentStatus: "paid" | "partial" | "unpaid" | "overdue";
      registrationSource: "direct" | "referral" | "self";
      razorpayPaymentId?: string;
      installments?: { installmentNumber: number; amount: number; dueDate?: string | Date | null }[];
      extraProfileFields?: ExtraProfileFields;
    }
  ) {
    // 1. Fetch Batch if batchId is provided
    let batch: any = null;
    if (batchId) {
      batch = await tx.query.batches.findFirst({
        where: eq(batches.id, batchId),
        with: { module: true },
      });
    }

    const moduleRecord = batch?.module || await tx.query.modules.findFirst({
      where: eq(modules.id, moduleId),
    });
    if (!moduleRecord) throw new Error("Module not found");

    // 2. Check duplicate active enrollment if batch exists
    if (batchId) {
      const existing = await tx.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.batchId, batchId),
          eq(batchEnrollments.studentId, studentId),
          eq(batchEnrollments.status, "active")
        ),
      });
      if (existing) {
        throw new Error("You are already enrolled in this batch");
      }
    }

    // 2.5 Ensure studentFeeConfigurations record exists
    let feeConfig = await tx.query.studentFeeConfigurations.findFirst({
      where: eq(studentFeeConfigurations.studentId, studentId),
    });

    if (!feeConfig) {
      const [inserted] = await tx.insert(studentFeeConfigurations).values({
        studentId,
        totalCourseFee: String(totalCourseFee),
        discount: "0.00",
        discountType: "flat",
        finalFee: String(totalCourseFee),
        paymentMode: paymentOption.toUpperCase() === "INSTALLMENT" ? "INSTALLMENT" : "FULL_PAYMENT",
        downPayment: String(paidAmount || 0),
        numberOfInstallments: installments?.length || (paymentOption.toUpperCase() === "INSTALLMENT" ? 2 : 1),
      }).returning();
      feeConfig = inserted;
    }

    // 3. Find or generate Enrollment ID and Profile values
    const existingProfile = await tx.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });

    const finalEnrollmentId = existingProfile?.enrollmentId || await generateNextEnrollmentId();

    const timeline = existingProfile?.activityTimeline || [];
    if (paidAmount > 0) {
      timeline.push({
        type: "enrollment_payment",
        amount: paidAmount,
        timestamp: new Date().toISOString(),
        transactionId: razorpayPaymentId || null,
      });
    }

    const sessionsO2O30 = extraProfileFields?.oneOnOne30Allocated ?? 0;
    const sessionsO2O45 = extraProfileFields?.oneOnOne45Allocated ?? 0;
    const sessionsO2O60 = extraProfileFields?.oneOnOne60Allocated ?? 0;
    const totalO2O = sessionsO2O30 + sessionsO2O45 + sessionsO2O60;

    const sessionsGroup30 = extraProfileFields?.group30Allocated ?? 0;
    const sessionsGroup45 = extraProfileFields?.group45Allocated ?? 0;
    const sessionsGroup60 = extraProfileFields?.group60Allocated ?? 0;
    const totalGroup = sessionsGroup30 + sessionsGroup45 + sessionsGroup60;
    const totalAllocated = totalO2O + totalGroup;

    const packageConfig = {
      oneToOne: {
        total: totalO2O,
        min30: sessionsO2O30,
        min45: sessionsO2O45,
        min60: sessionsO2O60,
      },
      group: {
        total: totalGroup,
        min30: sessionsGroup30,
        min45: sessionsGroup45,
        min60: sessionsGroup60,
      },
    };

    const opt = (feeConfig.paymentMode || paymentOption).toUpperCase() === "INSTALLMENT" ? "installment" : "full_payment";
    const status = paymentStatus === "paid" ? "paid" : paymentStatus === "partial" ? "partial" : "unpaid";

    let paymentDueDate: Date | null = null;
    if (installments && installments.length > 0) {
      const firstInst = installments.find((i) => i.installmentNumber === 1);
      if (firstInst?.dueDate) {
        paymentDueDate = new Date(firstInst.dueDate);
      }
    }

    const effectiveTotalFee = feeConfig.finalFee || String(totalCourseFee);

    const profileValues = {
      batch: batch?.name || null,
      batchTime: batch?.timeSlot || extraProfileFields?.preferredClassTime || "",
      course: moduleRecord.name,
      moduleId: moduleId,
      enrollmentStatus: batchId ? "enrolled" : (extraProfileFields?.enrollmentStatus || "waiting_for_batch"),
      sessionType: extraProfileFields?.sessionType || "group",
      feesTotal: effectiveTotalFee,
      feesPaid: String(paidAmount),
      feesBalance: String(remainingBalance),
      paymentStatus: status,
      paymentOption: opt,
      paymentType: opt,
      downPayment: String(opt === "installment" ? (paidAmount || installments?.[0]?.amount || moduleRecord.minimumDownPayment || 0) : effectiveTotalFee),
      remainingBalance: String(remainingBalance),
      totalCourseFee: effectiveTotalFee,
      minInitialPayment: String(moduleRecord.minimumDownPayment || 0),
      activityTimeline: timeline,
      allocatedOneToOneSessions: totalO2O,
      allocatedGroupSessions: totalGroup,
      totalAllocatedSessions: totalAllocated,
      remainingOneToOneSessions: totalO2O,
      remainingGroupSessions: totalGroup,
      totalRemainingSessions: totalAllocated,
      packageConfig,
      paymentDueDate,
      ...extraProfileFields,
    };

    if (existingProfile) {
      await tx.update(profiles)
        .set(profileValues)
        .where(eq(profiles.userId, studentId));
    } else {
      await tx.insert(profiles).values({
        userId: studentId,
        enrollmentId: finalEnrollmentId,
        ...profileValues,
      });
    }

    // 4. Update registrationSource in users table
    await tx.update(users)
      .set({ registrationSource })
      .where(eq(users.id, studentId));

    // 5. Insert batchEnrollment record if batch exists
    if (batchId && batch) {
      await tx.insert(batchEnrollments).values({
        batchId,
        studentId,
        status: "active",
        paymentType: opt.toUpperCase() === "INSTALLMENT" ? "INSTALLMENT" : "FULL_PAYMENT",
        moduleId: moduleId,
        studentFeeConfigId: feeConfig.id,
        oneOnOne30Allocated: sessionsO2O30,
        oneOnOne45Allocated: sessionsO2O45,
        oneOnOne60Allocated: sessionsO2O60,
        group30Allocated: sessionsGroup30,
        group45Allocated: sessionsGroup45,
        group60Allocated: sessionsGroup60,
        oneOnOne30Used: 0,
        oneOnOne45Used: 0,
        oneOnOne60Used: 0,
        group30Used: 0,
        group45Used: 0,
        group60Used: 0,
        assignedTeachers: batch?.teacherId ? [batch.teacherId] : [],
      }).returning();
    }

    const courseOrBatchName = batch?.name || moduleRecord.name;

    // 6. Record payment records / installments if not already created
    const existingStudentPayments = await tx.query.payments.findMany({
      where: eq(payments.studentId, studentId),
    });

    if (existingStudentPayments.length === 0) {
      if (installments && installments.length > 0) {
        for (const inst of installments) {
          await tx.insert(payments).values({
            studentId,
            studentFeeConfigId: feeConfig.id,
            amount: String(inst.amount),
            type: "tuition",
            status: "unpaid",
            dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
            installmentNumber: inst.installmentNumber,
            batchId: batchId || null,
            notes: `Installment #${inst.installmentNumber} for ${courseOrBatchName}`,
          });
        }
      } else if (opt === "installment") {
        // Installment 1: paid amount
        await tx.insert(payments).values({
          studentId,
          studentFeeConfigId: feeConfig.id,
          amount: String(paidAmount),
          type: "tuition",
          status: paidAmount > 0 ? "paid" : "unpaid",
          paidAt: paidAmount > 0 ? new Date() : null,
          transactionId: razorpayPaymentId || null,
          batchId: batchId || null,
          installmentNumber: 1,
          dueDate: new Date(),
          notes: `Down payment for ${courseOrBatchName} via ${registrationSource}`,
        });

        // Installment 2: remaining balance (if any)
        if (remainingBalance > 0) {
          await tx.insert(payments).values({
            studentId,
            studentFeeConfigId: feeConfig.id,
            amount: String(remainingBalance),
            type: "tuition",
            status: "unpaid",
            batchId: batchId || null,
            installmentNumber: 2,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days later
            notes: `Remaining balance installment for ${courseOrBatchName}`,
          });
        }
      } else {
        // Full Payment
        await tx.insert(payments).values({
          studentId,
          studentFeeConfigId: feeConfig.id,
          amount: String(effectiveTotalFee),
          type: "tuition",
          status: paidAmount > 0 ? "paid" : "unpaid",
          paidAt: paidAmount > 0 ? new Date() : null,
          transactionId: razorpayPaymentId || null,
          batchId: batchId || null,
          installmentNumber: null,
          dueDate: null,
          notes: `Full payment for ${courseOrBatchName} via ${registrationSource}`,
        });
      }
    }

    // 7. Sync sessions
    await updateStudentSessionBalances(tx, studentId);

    // 8. Send notification
    await tx.insert(notifications).values({
      userId: studentId,
      title: "Enrollment Successful",
      message: `You have successfully enrolled in "${courseOrBatchName}"!`,
      type: "enrollment_success",
    });

    return { success: true, studentId };
  }

  static generateReceiptNumber(studentId: number, batchId: number): string {
    return `rcpt_enroll_${studentId}_${batchId}_${Date.now()}`;
  }

  /**
   * Format receipt data.
   */
  static generateReceipt(payment: any, studentUser: any, courseName: string) {
    return {
      id: payment.id,
      amount: payment.amount,
      paidAt: payment.paidAt,
      transactionId: payment.transactionId,
      student: studentUser ? { name: studentUser.name, unionId: studentUser.unionId } : null,
      courseName: courseName,
    };
  }

  /**
   * Helper to format list for payment/fee reports.
   */
  static getFeeReportData(paymentsList: any[]) {
    return paymentsList.map((l) => {
      const activeEnrollment = l.student?.enrollments?.find((e: any) => e.status === "active");
      const paymentType = activeEnrollment?.paymentType || "FULL_PAYMENT";
      return {
        id: l.id,
        studentName: l.student?.name,
        studentId: l.student?.unionId,
        batchName: l.batch?.name,
        amount: l.amount,
        type: l.type,
        status: l.status,
        dueDate: l.dueDate,
        paidAt: l.paidAt,
        transactionId: l.transactionId,
        installmentNumber: l.installmentNumber,
        paidDate: l.paidDate,
        paymentType,
        totalFee: l.student?.profile?.feesTotal || "0",
        amountPaid: l.student?.profile?.feesPaid || "0",
        outstandingBalance: l.student?.profile?.feesBalance || "0",
        paymentStatus: l.student?.profile?.paymentStatus || "unpaid",
      };
    });
  }
}
