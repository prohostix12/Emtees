import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, sql, or, lte, gte, lt, gt, ilike, inArray, isNotNull, asc } from "drizzle-orm";
import { createRouter, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  payments,
  teacherSalaries,
  profiles,
  users,
  flexibilityRequests,
  feedback,
  notifications,
  violations,
  classes,
  oneToOneSessions,
  batches,
  attendance,
  messages,
  batchEnrollments,
  teacherSalaryConfigs,
  teacherSalaryConfigAuditLogs,
  modules,
  systemSettings,
  sessionAllocationLogs,
} from "@db/schema";
import { sendNotification } from "../lib/notificationEngine";
import { updateStudentSessionBalances } from "../lib/sessionHelper";

export const adminRouter = createRouter({
  // ─── Payments / Fees ────────────────────────────────────────────────────────

  listPayments: adminQuery
    .input(z.object({
      studentId: z.number().optional(),
      status: z.string().optional(),
      batchId: z.number().optional(),
      dueDate: z.date().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const filters = [];
      if (input?.studentId) filters.push(eq(payments.studentId, input.studentId));
      if (input?.status) filters.push(eq(payments.status, input.status as any));
      if (input?.batchId) filters.push(eq(payments.batchId, input.batchId));
      if (input?.dueDate) {
        const startOfDay = new Date(input.dueDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(input.dueDate);
        endOfDay.setHours(23, 59, 59, 999);
        filters.push(and(gte(payments.dueDate, startOfDay), lte(payments.dueDate, endOfDay)));
      }
      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.query.payments.findMany({
        where,
        orderBy: desc(payments.createdAt),
        with: {
          student: {
            with: {
              profile: true,
              enrollments: true,
            },
          },
          batch: true,
        },
      });
    }),

  createPayment: adminQuery
    .input(z.object({
      studentId: z.number(),
      amount: z.number(),
      type: z.string().default("tuition"),
      dueDate: z.date().optional(),
      notes: z.string().optional(),
      batchId: z.number().optional(),
      installmentNumber: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const result = await db.insert(payments).values({
        studentId: input.studentId,
        amount: String(input.amount),
        type: input.type,
        dueDate: input.dueDate,
        notes: input.notes,
        batchId: input.batchId,
        installmentNumber: input.installmentNumber,
        status: "unpaid",
      }).returning({ id: payments.id });
      return db.query.payments.findFirst({ where: eq(payments.id, result[0]?.id) });
    }),

  // Task 9.4 — reactivate enrollments and update profile fees on payment
  recordPayment: adminQuery
    .input(z.object({
      paymentId: z.number(),
      amount: z.number(),
      transactionId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();

      const payment = await db.query.payments.findFirst({
        where: eq(payments.id, input.paymentId),
      });
      if (!payment) throw new Error("Payment not found");

      await db.update(payments)
        .set({
          status: "paid",
          paidAt: new Date(),
          paidDate: new Date(),
          transactionId: input.transactionId,
        })
        .where(eq(payments.id, input.paymentId));

      // Reactivate all inactive or restricted enrollments for the student
      const inactiveOrRestrictedEnrollments = await db.query.batchEnrollments.findMany({
        where: and(
          eq(batchEnrollments.studentId, payment.studentId),
          or(
            eq(batchEnrollments.status, "inactive"),
            eq(batchEnrollments.status, "restricted")
          )
        ),
      });
      for (const enrollment of inactiveOrRestrictedEnrollments) {
        await db.update(batchEnrollments)
          .set({ status: "active" })
          .where(eq(batchEnrollments.id, enrollment.id));
      }

      // Reactivate user status
      await db.update(users)
        .set({ status: "active" })
        .where(eq(users.id, payment.studentId));

      // Update profile feesPaid and recalculate feesBalance
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, payment.studentId),
      });
      if (profile) {
        const feesPaid = parseFloat(profile.feesPaid ?? "0") + input.amount;
        const feesTotal = parseFloat(profile.feesTotal ?? "0");
        const feesBalance = Math.max(0, feesTotal - feesPaid);
        const nextPaymentStatus = feesBalance <= 0 ? "paid" : "partial";

        let paymentDueDate: Date | null = null;
        const activeEnrollment = await db.query.batchEnrollments.findFirst({
          where: and(
            eq(batchEnrollments.studentId, payment.studentId),
            eq(batchEnrollments.status, "active")
          ),
        });

        if (activeEnrollment?.paymentType === "INSTALLMENT" && feesBalance > 0) {
          const nextUnpaid = await db.query.payments.findFirst({
            where: and(
              eq(payments.studentId, payment.studentId),
              eq(payments.status, "unpaid"),
              isNotNull(payments.installmentNumber)
            ),
            orderBy: asc(payments.installmentNumber),
          });
          if (nextUnpaid?.dueDate) {
            paymentDueDate = nextUnpaid.dueDate;
          }
        }
        
        // Log to activity timeline
        const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
        timeline.push({
          type: "payment_recorded",
          amount: input.amount,
          feesPaid,
          feesBalance,
          timestamp: new Date().toISOString(),
        });

        await db.update(profiles)
          .set({
            feesPaid: String(feesPaid),
            feesBalance: String(feesBalance),
            paymentStatus: nextPaymentStatus,
            paymentDueDate,
            activityTimeline: timeline,
          })
          .where(eq(profiles.userId, payment.studentId));
      }

      return { success: true };
    }),

  listOverdueStudents: adminQuery.query(async ({ ctx }) => {
    if (ctx.user.role === "academic_head") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
    }
    const db = getDb();
    const overdue = await db.query.profiles.findMany({
      where: and(
        gt(profiles.feesBalance, "0"),
        lt(profiles.paymentDueDate, new Date())
      ),
      with: {
        user: true,
      },
    });
    return overdue.map((o) => ({
      id: o.id,
      userId: o.userId,
      user: o.user,
      course: o.course,
      batch: o.batch,
      feesTotal: o.feesTotal,
      feesPaid: o.feesPaid,
      feesBalance: o.feesBalance,
      paymentStatus: o.paymentStatus,
      paymentDueDate: o.paymentDueDate,
      gracePeriodDays: o.gracePeriodDays,
    }));
  }),

  adjustStudentFees: adminQuery
    .input(z.object({
      studentId: z.number(),
      feesTotal: z.number().optional(),
      feesPaid: z.number().optional(),
      minInitialPayment: z.number().optional(),
      paymentDueDate: z.date().optional(),
      gracePeriodDays: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });

      const feesTotal = input.feesTotal !== undefined ? String(input.feesTotal) : profile.feesTotal;
      const feesPaid = input.feesPaid !== undefined ? String(input.feesPaid) : profile.feesPaid;
      const feesBalance = String(Math.max(0, parseFloat(feesTotal ?? "0") - parseFloat(feesPaid ?? "0")));
      const minInitialPayment = input.minInitialPayment !== undefined ? String(input.minInitialPayment) : profile.minInitialPayment;
      const paymentDueDate = input.paymentDueDate !== undefined ? input.paymentDueDate : profile.paymentDueDate;
      const gracePeriodDays = input.gracePeriodDays !== undefined ? input.gracePeriodDays : profile.gracePeriodDays;

      const nextPaymentStatus = parseFloat(feesBalance) <= 0 ? "paid" : (parseFloat(feesPaid ?? "0") > 0 ? "partial" : "unpaid");

      // Log to activity timeline
      const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
      timeline.push({
        type: "fee_adjustment",
        feesTotal,
        feesPaid,
        feesBalance,
        minInitialPayment,
        paymentDueDate: paymentDueDate ? new Date(paymentDueDate).toISOString() : null,
        gracePeriodDays,
        timestamp: new Date().toISOString(),
      });

      await db.update(profiles)
        .set({
          feesTotal,
          feesPaid,
          feesBalance,
          minInitialPayment,
          paymentDueDate,
          gracePeriodDays,
          paymentStatus: nextPaymentStatus,
          activityTimeline: timeline,
        })
        .where(eq(profiles.userId, input.studentId));

      // Reactivate student if fees are fully cleared
      if (parseFloat(feesBalance) <= 0) {
        await db.update(batchEnrollments)
          .set({ status: "active" })
          .where(and(
            eq(batchEnrollments.studentId, input.studentId),
            eq(batchEnrollments.status, "restricted")
          ));
        
        await db.update(users)
          .set({ status: "active" })
          .where(eq(users.id, input.studentId));
      }

      return { success: true };
    }),

  sendManualReminder: adminQuery
    .input(z.object({ studentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });

      const message = `Manual Reminder: Your batch fee balance of ₹${profile.feesBalance} is outstanding. Please pay as soon as possible.`;
      
      await sendNotification(
        input.studentId,
        "Fee Payment Reminder",
        message,
        "fee_reminder_manual"
      );

      // Log manual reminder
      const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
      timeline.push({
        type: "manual_reminder_sent",
        timestamp: new Date().toISOString(),
      });
      await db.update(profiles)
        .set({ activityTimeline: timeline })
        .where(eq(profiles.userId, input.studentId));

      return { success: true };
    }),

  exportPaymentReport: adminQuery
    .input(z.object({
      batchId: z.number().optional(),
      status: z.string().optional(),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const filters = [];
      if (input.batchId) filters.push(eq(payments.batchId, input.batchId));
      if (input.status) filters.push(eq(payments.status, input.status as any));
      const where = filters.length > 0 ? and(...filters) : undefined;

      const list = await db.query.payments.findMany({
        where,
        orderBy: desc(payments.createdAt),
        with: {
          student: {
            with: {
              profile: true,
              enrollments: true,
            },
          },
          batch: true,
        },
      });

      return {
        format: input.format,
        message: "Use this structured data for client-side report generation.",
        data: list.map((l) => {
          const activeEnrollment = l.student?.enrollments?.find((e) => e.status === "active");
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
        }),
      };
    }),

  // ─── Flexibility Requests ────────────────────────────────────────────────────

  listRequests: adminQuery
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();
      const where = input?.status
        ? eq(flexibilityRequests.status, input.status as "pending" | "approved" | "rejected" | "cancelled")
        : undefined;
      const list = await db.query.flexibilityRequests.findMany({
        where,
        orderBy: desc(flexibilityRequests.requestedAt),
        with: { student: true, fromBatch: true, toBatch: true, resolver: true },
      });

      return list.map((req) => {
        const fromFee = req.fromBatch ? parseFloat(req.fromBatch.courseFee ?? "0") : 0;
        const toFee = req.toBatch ? parseFloat(req.toBatch.courseFee ?? "0") : 0;
        return {
          ...req,
          fromBatchFee: fromFee,
          toBatchFee: toFee,
          feeDifference: toFee - fromFee,
        };
      });
    }),

  // Tasks 10.1–10.3 — apply enrollment state changes, notify, append timeline
  resolveRequest: adminQuery
    .input(z.object({
      requestId: z.number(),
      status: z.enum(["approved", "rejected"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();

      const request = await db.query.flexibilityRequests.findFirst({
        where: eq(flexibilityRequests.id, input.requestId),
      });
      if (!request) throw new Error("Request not found");

      await db.update(flexibilityRequests)
        .set({
          status: input.status,
          adminNote: input.note,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
        })
        .where(eq(flexibilityRequests.id, input.requestId));

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, request.studentId),
      });

      // Task 10.1 — apply enrollment state changes on approval
      if (input.status === "approved") {
        const { requestType, fromBatchId, toBatchId, studentId } = request;

        if (requestType === "hold" && fromBatchId) {
          await db.update(batchEnrollments)
            .set({ status: "on_hold" })
            .where(and(
              eq(batchEnrollments.batchId, fromBatchId),
              eq(batchEnrollments.studentId, studentId),
            ));
        } else if (requestType === "rejoin" && fromBatchId) {
          await db.update(batchEnrollments)
            .set({ status: "active" })
            .where(and(
              eq(batchEnrollments.batchId, fromBatchId),
              eq(batchEnrollments.studentId, studentId),
            ));
        } else if (requestType === "batch_change" && fromBatchId && toBatchId) {
          await db.update(batchEnrollments)
            .set({ status: "inactive", leftAt: new Date() })
            .where(and(
              eq(batchEnrollments.batchId, fromBatchId),
              eq(batchEnrollments.studentId, studentId),
            ));
          await db.insert(batchEnrollments).values({
            batchId: toBatchId,
            studentId,
            status: "active",
          });

          // Update student profile with new batch details and adjust fees
          const newBatch = await db.query.batches.findFirst({
            where: eq(batches.id, toBatchId),
            with: { module: true },
          });

          const oldBatch = await db.query.batches.findFirst({
            where: eq(batches.id, fromBatchId),
          });

          if (newBatch && profile) {
            const oldFee = parseFloat(oldBatch?.courseFee ?? "0");
            const newFee = parseFloat(newBatch.courseFee ?? "0");
            const diff = newFee - oldFee;

            const currentTotal = parseFloat(profile.feesTotal ?? "0");
            const currentPaid = parseFloat(profile.feesPaid ?? "0");
            
            const nextTotal = Math.max(0, currentTotal + diff);
            const nextBalance = Math.max(0, nextTotal - currentPaid);
            const nextPaymentStatus = nextBalance <= 0 ? "paid" : (currentPaid > 0 ? "partial" : "unpaid");

            await db.update(profiles)
              .set({
                batch: newBatch.name,
                batchTime: newBatch.timeSlot,
                course: newBatch.module?.name || null,
                feesTotal: String(nextTotal),
                feesBalance: String(nextBalance),
                paymentStatus: nextPaymentStatus,
              })
              .where(eq(profiles.userId, studentId));
          }
        } else if (requestType === "batch_removal" && fromBatchId) {
          await db.update(batchEnrollments)
            .set({ status: "inactive", leftAt: new Date() })
            .where(and(
              eq(batchEnrollments.batchId, fromBatchId),
              eq(batchEnrollments.studentId, studentId),
            ));
          
          // Clear profile batch info
          await db.update(profiles)
            .set({
              batch: null,
              batchTime: null,
              course: null,
            })
            .where(eq(profiles.userId, studentId));
        }
      }

      // Task 10.2 — notify student
      const statusLabel = input.status === "approved" ? "approved" : "rejected";
      await sendNotification(
        request.studentId,
        "Flexibility Request Update",
        `Your ${request.requestType.replace("_", " ")} request has been ${statusLabel}.${input.note ? ` Note: ${input.note}` : ""}`,
        "flexibility_request_resolved",
      );

      // Task 10.3 — append to activityTimeline
      if (profile) {
        const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
        timeline.push({
          type: request.requestType,
          status: input.status,
          timestamp: new Date().toISOString(),
          adminNote: input.note ?? null,
        });
        await db.update(profiles)
          .set({ activityTimeline: timeline })
          .where(eq(profiles.userId, request.studentId));
      }

      return { success: true };
    }),

  // ─── Teacher Salaries ────────────────────────────────────────────────────────

  listSalaries: adminQuery
    .input(z.object({ teacherId: z.number().optional(), month: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const filters = [];
      if (input?.teacherId) filters.push(eq(teacherSalaries.teacherId, input.teacherId));
      if (input?.month) filters.push(eq(teacherSalaries.month, input.month));
      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.query.teacherSalaries.findMany({
        where,
        with: { teacher: true },
      });
    }),

  calculateSalary: adminQuery
    .input(z.object({
      teacherId: z.number(),
      month: z.string(),
      groupClassRate: z.number().optional(),
      oneToOneRate: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const groupCount = await db.select({ count: sql<number>`count(*)` })
        .from(classes)
        .where(and(
          eq(classes.teacherId, input.teacherId),
          eq(classes.status, "completed"),
          eq(classes.classType, "group"),
          sql`TO_CHAR(${classes.scheduledAt}, 'YYYY-MM') = ${input.month}`,
        ));
      const oneToOneCount = await db.select({ count: sql<number>`count(*)` })
        .from(oneToOneSessions)
        .where(and(
          eq(oneToOneSessions.teacherId, input.teacherId),
          eq(oneToOneSessions.status, "completed"),
          sql`TO_CHAR(${oneToOneSessions.scheduledAt}, 'YYYY-MM') = ${input.month}`,
        ));

      const config = await db.query.teacherSalaryConfigs.findFirst({
        where: eq(teacherSalaryConfigs.teacherId, input.teacherId),
      });

      const basicSalary = config ? parseFloat(config.basicSalary) : 0;
      const groupClassRate = config ? parseFloat(config.groupClassRate) : (input.groupClassRate ?? 0);
      const oneToOneRate = config ? parseFloat(config.oneToOneRate) : (input.oneToOneRate ?? 0);

      const gc = Number(groupCount[0]?.count || 0);
      const oc = Number(oneToOneCount[0]?.count || 0);
      const total = basicSalary + gc * groupClassRate + oc * oneToOneRate;

      const result = await db.insert(teacherSalaries).values({
        teacherId: input.teacherId,
        month: input.month,
        groupClassesCount: gc,
        oneToOneCount: oc,
        basicSalary: String(basicSalary),
        groupClassRate: String(groupClassRate),
        oneToOneRate: String(oneToOneRate),
        totalAmount: String(total),
        status: "pending",
      }).returning({ id: teacherSalaries.id });
      return db.query.teacherSalaries.findFirst({ where: eq(teacherSalaries.id, result[0]?.id) });
    }),

  getSalaryConfig: adminQuery
    .input(z.object({ teacherId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const config = await db.query.teacherSalaryConfigs.findFirst({
        where: eq(teacherSalaryConfigs.teacherId, input.teacherId),
      });
      return config ?? {
        basicSalary: "0.00",
        groupClassRate: "0.00",
        oneToOneRate: "0.00",
      };
    }),

  updateSalaryConfig: adminQuery
    .input(z.object({
      teacherId: z.number(),
      basicSalary: z.number().nonnegative(),
      groupClassRate: z.number().nonnegative(),
      oneToOneRate: z.number().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin is allowed to modify salary configurations." });
      }
      const db = getDb();
      const existing = await db.query.teacherSalaryConfigs.findFirst({
        where: eq(teacherSalaryConfigs.teacherId, input.teacherId),
      });

      const basicSalaryStr = String(input.basicSalary);
      const groupClassRateStr = String(input.groupClassRate);
      const oneToOneRateStr = String(input.oneToOneRate);

      const prevBasic = existing ? parseFloat(existing.basicSalary) : 0;
      const prevGroup = existing ? parseFloat(existing.groupClassRate) : 0;
      const prevOneToOne = existing ? parseFloat(existing.oneToOneRate) : 0;

      // Update or insert configuration
      if (existing) {
        await db.update(teacherSalaryConfigs)
          .set({
            basicSalary: basicSalaryStr,
            groupClassRate: groupClassRateStr,
            oneToOneRate: oneToOneRateStr,
            updatedAt: new Date(),
          })
          .where(eq(teacherSalaryConfigs.id, existing.id));
      } else {
        await db.insert(teacherSalaryConfigs).values({
          teacherId: input.teacherId,
          basicSalary: basicSalaryStr,
          groupClassRate: groupClassRateStr,
          oneToOneRate: oneToOneRateStr,
        });
      }

      // Log changes to audit trail
      const auditEntries = [];
      if (input.basicSalary !== prevBasic) {
        auditEntries.push({
          teacherId: input.teacherId,
          fieldName: "basicSalary",
          previousValue: String(prevBasic),
          newValue: basicSalaryStr,
          changedBy: ctx.user.id,
        });
      }
      if (input.groupClassRate !== prevGroup) {
        auditEntries.push({
          teacherId: input.teacherId,
          fieldName: "groupClassRate",
          previousValue: String(prevGroup),
          newValue: groupClassRateStr,
          changedBy: ctx.user.id,
        });
      }
      if (input.oneToOneRate !== prevOneToOne) {
        auditEntries.push({
          teacherId: input.teacherId,
          fieldName: "oneToOneRate",
          previousValue: String(prevOneToOne),
          newValue: oneToOneRateStr,
          changedBy: ctx.user.id,
        });
      }

      if (auditEntries.length > 0) {
        await db.insert(teacherSalaryConfigAuditLogs).values(auditEntries);
      }

      return { success: true };
    }),

  listConfigAuditLogs: adminQuery
    .input(z.object({ teacherId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const filters = [];
      if (input?.teacherId) filters.push(eq(teacherSalaryConfigAuditLogs.teacherId, input.teacherId));
      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.query.teacherSalaryConfigAuditLogs.findMany({
        where,
        orderBy: desc(teacherSalaryConfigAuditLogs.changedAt),
        with: {
          teacher: true,
          changedByUser: true,
        },
      });
    }),

  markSalaryPaid: adminQuery
    .input(z.object({
      salaryId: z.number(),
      paymentDate: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin is allowed to mark salaries as paid." });
      }
      const db = getDb();
      const salary = await db.query.teacherSalaries.findFirst({
        where: eq(teacherSalaries.id, input.salaryId),
      });
      if (!salary) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Salary record not found." });
      }

      await db.update(teacherSalaries)
        .set({
          status: "paid",
          paymentDate: input.paymentDate ?? new Date(),
        })
        .where(eq(teacherSalaries.id, input.salaryId));

      return { success: true };
    }),

  // Task 12.1 — salary report export (structured JSON for client-side generation)
  exportSalaryReport: adminQuery
    .input(z.object({
      teacherId: z.number(),
      month: z.string(),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const teacher = await db.query.users.findFirst({ where: eq(users.id, input.teacherId) });
      const salary = await db.query.teacherSalaries.findFirst({
        where: and(
          eq(teacherSalaries.teacherId, input.teacherId),
          eq(teacherSalaries.month, input.month),
        ),
        with: { teacher: true },
      });

      return {
        format: input.format,
        message: "Use this structured data for client-side report generation.",
        data: {
          teacher: teacher ? { id: teacher.id, name: teacher.name, email: teacher.email } : null,
          month: input.month,
          salary: salary ?? null,
        },
      };
    }),

  // ─── Feedback ────────────────────────────────────────────────────────────────

  listFeedback: adminQuery
    .input(z.object({
      teacherId: z.number().optional(),
      batchId: z.number().optional(),
      courseName: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      
      let batchIdsWithCourse: number[] | undefined = undefined;
      if (input?.courseName) {
        const matchingBatches = await db
          .select({ id: batches.id })
          .from(batches)
          .innerJoin(modules, eq(batches.moduleId, modules.id))
          .where(ilike(modules.name, `%${input.courseName}%`));
        batchIdsWithCourse = matchingBatches.map(b => b.id);
        if (batchIdsWithCourse.length === 0) {
          return [];
        }
      }
      
      const whereConditions = [];
      if (input?.teacherId) whereConditions.push(eq(feedback.teacherId, input.teacherId));
      if (input?.batchId) whereConditions.push(eq(feedback.batchId, input.batchId));
      if (batchIdsWithCourse) whereConditions.push(inArray(feedback.batchId, batchIdsWithCourse));
      if (input?.startDate) whereConditions.push(gte(feedback.createdAt, input.startDate));
      if (input?.endDate) whereConditions.push(lte(feedback.createdAt, input.endDate));
      
      const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;
      
      return db.query.feedback.findMany({
        where,
        orderBy: desc(feedback.createdAt),
        with: {
          student: true,
          teacher: true,
          batch: {
            with: {
              module: true
            }
          },
          class: true,
        },
      });
    }),

  getFeedbackStats: adminQuery
    .input(z.object({
      teacherId: z.number().optional(),
      batchId: z.number().optional(),
      courseName: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      
      let batchIdsWithCourse: number[] | undefined = undefined;
      if (input?.courseName) {
        const matchingBatches = await db
          .select({ id: batches.id })
          .from(batches)
          .innerJoin(modules, eq(batches.moduleId, modules.id))
          .where(ilike(modules.name, `%${input.courseName}%`));
        batchIdsWithCourse = matchingBatches.map(b => b.id);
        if (batchIdsWithCourse.length === 0) {
          return {
            averageRating: 0,
            totalCount: 0,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            recentComments: [],
          };
        }
      }
      
      const whereConditions = [];
      if (input?.teacherId) whereConditions.push(eq(feedback.teacherId, input.teacherId));
      if (input?.batchId) whereConditions.push(eq(feedback.batchId, input.batchId));
      if (batchIdsWithCourse) whereConditions.push(inArray(feedback.batchId, batchIdsWithCourse));
      if (input?.startDate) whereConditions.push(gte(feedback.createdAt, input.startDate));
      if (input?.endDate) whereConditions.push(lte(feedback.createdAt, input.endDate));
      
      const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;
      
      const feedbacks = await db.query.feedback.findMany({
        where,
        orderBy: desc(feedback.createdAt),
        with: {
          student: true,
          teacher: true,
          batch: true,
        }
      });
      
      const totalCount = feedbacks.length;
      if (totalCount === 0) {
        return {
          averageRating: 0,
          totalCount: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          recentComments: [],
        };
      }
      
      const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
      const averageRating = Math.round((sum / totalCount) * 100) / 100;
      
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const f of feedbacks) {
        const rating = f.rating as 1 | 2 | 3 | 4 | 5;
        if (distribution[rating] !== undefined) {
          distribution[rating]++;
        }
      }
      
      const recentComments = feedbacks
        .filter((f) => f.comment && f.comment.trim() !== "")
        .map((f) => ({
          studentName: f.student.name,
          teacherName: f.teacher.name,
          rating: f.rating,
          comment: f.comment,
          createdAt: f.createdAt,
          batchName: f.batch?.name || "N/A",
        }))
        .slice(0, 10);
        
      return {
        averageRating,
        totalCount,
        distribution,
        recentComments,
      };
    }),

  getFeedbackSettings: adminQuery.query(async () => {
    const db = getDb();
    const settingsList = await db.query.systemSettings.findMany();
    const settingsMap = new Map(settingsList.map((s) => [s.key, s.value]));
    
    return {
      feedback_edit_period_minutes: parseInt(settingsMap.get("feedback_edit_period_minutes") || "60", 10),
      feedback_limit_per_batch: settingsMap.has("feedback_limit_per_batch")
        ? settingsMap.get("feedback_limit_per_batch") === "true"
        : true,
      feedback_teacher_stats_enabled: settingsMap.get("feedback_teacher_stats_enabled") === "true",
    };
  }),

  updateFeedbackSettings: adminQuery
    .input(z.object({
      feedback_edit_period_minutes: z.number().nonnegative(),
      feedback_limit_per_batch: z.boolean(),
      feedback_teacher_stats_enabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins/Super Admins can update system settings.",
        });
      }
      const db = getDb();
      
      const upsertSetting = async (key: string, value: string) => {
        const existing = await db.query.systemSettings.findFirst({
          where: eq(systemSettings.key, key),
        });
        if (existing) {
          await db.update(systemSettings)
            .set({ value, updatedAt: new Date() })
            .where(eq(systemSettings.key, key));
        } else {
          await db.insert(systemSettings).values({ key, value });
        }
      };
      
      await upsertSetting("feedback_edit_period_minutes", String(input.feedback_edit_period_minutes));
      await upsertSetting("feedback_limit_per_batch", String(input.feedback_limit_per_batch));
      await upsertSetting("feedback_teacher_stats_enabled", String(input.feedback_teacher_stats_enabled));
      
      return { success: true };
    }),

  getTeacherAggregatedStats: teacherQuery
    .input(z.object({
      teacherId: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      
      let targetTeacherId = ctx.user.id;
      
      const isPrivileged = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      if (input?.teacherId && isPrivileged) {
        targetTeacherId = input.teacherId;
      }
      
      if (ctx.user.role === "teacher" && targetTeacherId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view your own statistics.",
        });
      }
      
      if (ctx.user.role === "teacher") {
        const statsEnabledRow = await db.query.systemSettings.findFirst({
          where: eq(systemSettings.key, "feedback_teacher_stats_enabled"),
        });
        const statsEnabled = statsEnabledRow ? statsEnabledRow.value === "true" : false;
        if (!statsEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Feedback statistics view is currently disabled by the Super Admin.",
          });
        }
      }
      
      const feedbacks = await db.query.feedback.findMany({
        where: eq(feedback.teacherId, targetTeacherId),
      });
      
      const totalCount = feedbacks.length;
      if (totalCount === 0) {
        return {
          averageRating: 0,
          totalCount: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
      }
      
      const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
      const averageRating = Math.round((sum / totalCount) * 100) / 100;
      
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const f of feedbacks) {
        const rating = f.rating as 1 | 2 | 3 | 4 | 5;
        if (distribution[rating] !== undefined) {
          distribution[rating]++;
        }
      }
      
      return {
        averageRating,
        totalCount,
        distribution,
      };
    }),

  // ─── Notifications ───────────────────────────────────────────────────────────

  listNotifications: adminQuery
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const where = input?.userId ? eq(notifications.userId, input.userId) : undefined;
      return db.query.notifications.findMany({
        where,
        orderBy: desc(notifications.createdAt),
        with: { user: true },
      });
    }),

  sendNotification: adminQuery
    .input(z.object({
      userId: z.number(),
      title: z.string(),
      message: z.string(),
      type: z.string(),
      data: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(notifications).values(input);
      return { success: true };
    }),

  // ─── Violations / Discipline ─────────────────────────────────────────────────

  listViolations: adminQuery.query(async () => {
    const db = getDb();
    return db.query.violations.findMany({
      orderBy: desc(violations.createdAt),
      with: { user: true, reporter: true },
    });
  }),

  // Task 14.1 — notify subject user after violation creation
  createViolation: adminQuery
    .input(z.object({
      userId: z.number(),
      type: z.string(),
      description: z.string(),
      action: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.insert(violations).values({
        ...input,
        reportedBy: ctx.user.id,
      });

      await sendNotification(
        input.userId,
        "Violation Recorded",
        `A ${input.type} violation has been recorded against your account. ${input.description}`,
        "violation_created",
      );

      return { success: true };
    }),

  // Task 14.2 — resolve violation
  resolveViolation: adminQuery
    .input(z.object({ violationId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(violations)
        .set({ status: "resolved", resolvedAt: new Date() })
        .where(eq(violations.id, input.violationId));
      return { success: true };
    }),

  // Task 14.3 — suspend user
  suspendUser: adminQuery
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users)
        .set({ status: "suspended" })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),

  // ─── Reports & Analytics ─────────────────────────────────────────────────────

  getDashboardStats: adminQuery.query(async () => {
    const db = getDb();
    const totalStudents = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "student"));
    const totalTeachers = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "teacher"));
    const totalBatches = await db.select({ count: sql<number>`count(*)` }).from(batches);
    const totalClasses = await db.select({ count: sql<number>`count(*)` }).from(classes).where(eq(classes.status, "completed"));
    const pendingFees = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` }).from(payments).where(eq(payments.status, "unpaid"));

    return {
      totalStudents: Number(totalStudents[0]?.count || 0),
      totalTeachers: Number(totalTeachers[0]?.count || 0),
      totalBatches: Number(totalBatches[0]?.count || 0),
      totalClasses: Number(totalClasses[0]?.count || 0),
      pendingFees: Number(pendingFees[0]?.total || 0),
    };
  }),

  getStudentReport: adminQuery
    .input(z.object({ studentId: z.union([z.number(), z.string()]) }))
    .query(async ({ input }) => {
      const db = getDb();

      let userId: number;
      if (typeof input.studentId === "string") {
        const parsed = parseInt(input.studentId, 10);
        if (!isNaN(parsed) && String(parsed) === input.studentId.trim()) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: eq(users.unionId, input.studentId),
          });
          if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Student not found with this ID" });
          userId = u.id;
        }
      } else {
        userId = input.studentId;
      }

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, userId),
      });
      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, userId),
          eq(batchEnrollments.status, "active")
        ),
      });
      const attendanceRecords = await db.query.attendance.findMany({
        where: eq(attendance.studentId, userId),
      });
      const total = attendanceRecords.length;
      const present = attendanceRecords.filter((a) => a.status === "present").length;
      const paymentsList = await db.query.payments.findMany({
        where: eq(payments.studentId, userId),
      });

      return {
        attendance: {
          total,
          present,
          percentage: total > 0 ? Math.round((present / total) * 100) : 0,
        },
        payments: paymentsList,
        profile,
        paymentType: activeEnrollment?.paymentType || "FULL_PAYMENT",
      };
    }),

  // Tasks 13.1 + 13.2 — teacher report with performance classification
  getTeacherReport: adminQuery
    .input(z.object({ teacherId: z.union([z.number(), z.string()]) }))
    .query(async ({ input }) => {
      const db = getDb();

      let userId: number;
      if (typeof input.teacherId === "string") {
        const parsed = parseInt(input.teacherId, 10);
        if (!isNaN(parsed) && String(parsed) === input.teacherId.trim()) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: eq(users.unionId, input.teacherId),
          });
          if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Teacher not found with this ID" });
          userId = u.id;
        }
      } else {
        userId = input.teacherId;
      }

      // Total completed classes handled
      const teacherClasses = await db.query.classes.findMany({
        where: and(
          eq(classes.teacherId, userId),
          eq(classes.status, "completed"),
        ),
      });
      const totalClasses = teacherClasses.length;

      // Student engagement rate: avg chat count per class
      let totalChatCount = 0;
      for (const cls of teacherClasses) {
        const records = await db.query.attendance.findMany({
          where: eq(attendance.classId, cls.id),
        });
        totalChatCount += records.reduce((sum, r) => sum + (r.chatCount ?? 0), 0);
      }
      const studentEngagementRate = totalClasses > 0 ? totalChatCount / totalClasses : 0;

      // Student retention rate: active enrollments / total enrollments for teacher's batches
      const teacherBatches = await db.query.batches.findMany({
        where: eq(batches.teacherId, userId),
      });
      let totalEnrollments = 0;
      let activeEnrollments = 0;
      for (const batch of teacherBatches) {
        const enrollments = await db.query.batchEnrollments.findMany({
          where: eq(batchEnrollments.batchId, batch.id),
        });
        totalEnrollments += enrollments.length;
        activeEnrollments += enrollments.filter((e) => e.status === "active").length;
      }
      const studentRetentionRate = totalEnrollments > 0
        ? Math.round((activeEnrollments / totalEnrollments) * 100)
        : 0;

      // Course completion rate: students who have a completionDate / total enrolled students
      const enrolledStudentIds = new Set<number>();
      for (const batch of teacherBatches) {
        const enrollments = await db.query.batchEnrollments.findMany({
          where: eq(batchEnrollments.batchId, batch.id),
        });
        enrollments.forEach((e) => enrolledStudentIds.add(e.studentId));
      }
      const totalStudents = enrolledStudentIds.size;
      let completedStudents = 0;
      for (const studentId of enrolledStudentIds) {
        const profile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, studentId),
        });
        if (profile?.completionDate) completedStudents++;
      }
      const courseCompletionRate = totalStudents > 0
        ? Math.round((completedStudents / totalStudents) * 100)
        : 0;

      // Task 13.2 — student completion rate classification
      const studentCompletionRate = courseCompletionRate;
      let performanceLabel: string;
      if (studentCompletionRate === 100) {
        performanceLabel = "Best";
      } else if (studentCompletionRate < 60) {
        performanceLabel = "Needs Improvement";
      } else {
        performanceLabel = "Average";
      }

      return {
        totalClasses,
        studentEngagementRate: Math.round(studentEngagementRate * 100) / 100,
        studentRetentionRate,
        courseCompletionRate,
        studentCompletionRate,
        performanceLabel,
      };
    }),

  // Task 13.3 — ranked teacher list by studentCompletionRate
  listTeachersByPerformance: adminQuery.query(async () => {
    const db = getDb();
    const teachers = await db.query.users.findMany({
      where: eq(users.role, "teacher"),
    });

    const results = [];
    for (const teacher of teachers) {
      const teacherBatches = await db.query.batches.findMany({
        where: eq(batches.teacherId, teacher.id),
      });

      const enrolledStudentIds = new Set<number>();
      for (const batch of teacherBatches) {
        const enrollments = await db.query.batchEnrollments.findMany({
          where: eq(batchEnrollments.batchId, batch.id),
        });
        enrollments.forEach((e) => enrolledStudentIds.add(e.studentId));
      }

      const totalStudents = enrolledStudentIds.size;
      let completedStudents = 0;
      for (const studentId of enrolledStudentIds) {
        const profile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, studentId),
        });
        if (profile?.completionDate) completedStudents++;
      }

      const studentCompletionRate = totalStudents > 0
        ? Math.round((completedStudents / totalStudents) * 100)
        : 0;

      // Task 17.3 — flag teachers with completion rate < 60% (feature-flagged)
      const needsImprovement = process.env.FEATURE_AI_INSIGHTS === "true"
        ? studentCompletionRate < 60
        : undefined;

      results.push({
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        studentCompletionRate,
        ...(needsImprovement !== undefined ? { needsImprovement } : {}),
      });
    }

    return results.sort((a, b) => b.studentCompletionRate - a.studentCompletionRate);
  }),

  // Task 13.4 — student leaderboard with composite score
  getLeaderboard: adminQuery.query(async () => {
    const db = getDb();
    const students = await db.query.users.findMany({
      where: eq(users.role, "student"),
    });

    const results = [];
    for (const student of students) {
      const attendanceRecords = await db.query.attendance.findMany({
        where: eq(attendance.studentId, student.id),
      });
      const total = attendanceRecords.length;
      const present = attendanceRecords.filter((a) => a.status === "present").length;
      const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;

      const chatActivity = attendanceRecords.reduce((sum, r) => sum + (r.chatCount ?? 0), 0);
      const compositeScore = attendancePct + chatActivity;

      // Task 17.2 — flag at-risk students (feature-flagged)
      const atRisk = process.env.FEATURE_AI_INSIGHTS === "true"
        ? attendancePct < 60
        : undefined;

      results.push({
        id: student.id,
        name: student.name,
        attendancePct,
        chatActivity,
        compositeScore,
        ...(atRisk !== undefined ? { atRisk } : {}),
      });
    }

    return results.sort((a, b) => b.compositeScore - a.compositeScore);
  }),

  // Task 13.5 — export student/teacher reports (structured JSON for client-side generation)
  exportStudentReport: adminQuery
    .input(z.object({
      studentId: z.union([z.number(), z.string()]),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input }) => {
      const db = getDb();

      let userId: number;
      if (typeof input.studentId === "string") {
        const parsed = parseInt(input.studentId, 10);
        if (!isNaN(parsed) && String(parsed) === input.studentId.trim()) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: eq(users.unionId, input.studentId),
          });
          if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Student not found with this ID" });
          userId = u.id;
        }
      } else {
        userId = input.studentId;
      }

      const student = await db.query.users.findFirst({ where: eq(users.id, userId) });
      const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
      const attendanceRecords = await db.query.attendance.findMany({
        where: eq(attendance.studentId, userId),
      });
      const total = attendanceRecords.length;
      const present = attendanceRecords.filter((a) => a.status === "present").length;
      const paymentsList = await db.query.payments.findMany({
        where: eq(payments.studentId, userId),
      });

      return {
        format: input.format,
        message: "Use this structured data for client-side report generation.",
        data: {
          student: student ? { id: student.id, name: student.name, email: student.email } : null,
          profile,
          attendance: { total, present, percentage: total > 0 ? Math.round((present / total) * 100) : 0 },
          payments: paymentsList,
        },
      };
    }),

  exportTeacherReport: adminQuery
    .input(z.object({
      teacherId: z.union([z.number(), z.string()]),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      
      let userId: number;
      if (typeof input.teacherId === "string") {
        const parsed = parseInt(input.teacherId, 10);
        if (!isNaN(parsed) && String(parsed) === input.teacherId.trim()) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: eq(users.unionId, input.teacherId),
          });
          if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Teacher not found with this ID" });
          userId = u.id;
        }
      } else {
        userId = input.teacherId;
      }

      const teacher = await db.query.users.findFirst({ where: eq(users.id, userId) });
      const teacherClasses = await db.query.classes.findMany({
        where: and(eq(classes.teacherId, userId), eq(classes.status, "completed")),
      });
      const salaries = ctx.user.role === "academic_head"
        ? []
        : await db.query.teacherSalaries.findMany({
            where: eq(teacherSalaries.teacherId, userId),
          });

      return {
        format: input.format,
        message: "Use this structured data for client-side report generation.",
        data: {
          teacher: teacher ? { id: teacher.id, name: teacher.name, email: teacher.email } : null,
          totalCompletedClasses: teacherClasses.length,
          salaries,
        },
      };
    }),

  getClassChatReport: adminQuery
    .input(z.object({ classId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
      if (!cls) return [];

      const filters = [eq(messages.batchId, cls.batchId)];
      if (cls.startedAt) filters.push(sql`${messages.createdAt} >= ${cls.startedAt}`);
      if (cls.endedAt) filters.push(sql`${messages.createdAt} <= ${cls.endedAt}`);

      const rows = await db
        .select({
          studentId: messages.senderId,
          studentName: users.name,
          messageCount: sql<number>`count(*)`,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(and(...filters))
        .groupBy(messages.senderId, users.name);

      return rows.map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        messageCount: Number(r.messageCount),
      }));
    }),

  getTeacherChatReport: adminQuery
    .input(z.object({ teacherId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const teacherClasses = await db.query.classes.findMany({
        where: eq(classes.teacherId, input.teacherId),
      });

      const result = [];
      for (const cls of teacherClasses) {
        const filters = [
          eq(messages.batchId, cls.batchId),
          eq(messages.senderId, input.teacherId),
        ];
        if (cls.startedAt) filters.push(sql`${messages.createdAt} >= ${cls.startedAt}`);
        if (cls.endedAt) filters.push(sql`${messages.createdAt} <= ${cls.endedAt}`);

        const rows = await db
          .select({ messageCount: sql<number>`count(*)` })
          .from(messages)
          .where(and(...filters));

        result.push({
          classId: cls.id,
          classTitle: cls.title,
          messageCount: Number(rows[0]?.messageCount ?? 0),
        });
      }
      return result;
    }),

  adjustStudentSessions: adminQuery
    .input(z.object({
      studentId: z.number(),
      allocatedOneToOne: z.number().nonnegative(),
      allocatedGroup: z.number().nonnegative(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied: Only Super Admin can adjust session allocations.",
        });
      }

      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Student profile not found.",
        });
      }

      const prevOneToOne = profile.allocatedOneToOneSessions ?? 0;
      const prevGroup = profile.allocatedGroupSessions ?? 0;

      const attendedOneToOne = profile.attendedOneToOneSessions ?? 0;
      const attendedGroup = profile.attendedGroupSessions ?? 0;

      if (input.allocatedOneToOne < attendedOneToOne) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot reduce One-to-One sessions below the attended count of ${attendedOneToOne}.`,
        });
      }

      if (input.allocatedGroup < attendedGroup) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot reduce Group sessions below the attended count of ${attendedGroup}.`,
        });
      }

      const totalAllocated = input.allocatedOneToOne + input.allocatedGroup;
      const remainingOneToOne = input.allocatedOneToOne - attendedOneToOne;
      const remainingGroup = input.allocatedGroup - attendedGroup;
      const totalRemaining = remainingOneToOne + remainingGroup;

      await db.transaction(async (tx) => {
        await tx.update(profiles)
          .set({
            allocatedOneToOneSessions: input.allocatedOneToOne,
            allocatedGroupSessions: input.allocatedGroup,
            totalAllocatedSessions: totalAllocated,
            remainingOneToOneSessions: remainingOneToOne,
            remainingGroupSessions: remainingGroup,
            totalRemainingSessions: totalRemaining,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, input.studentId));

        await tx.insert(sessionAllocationLogs).values({
          studentId: input.studentId,
          changedBy: ctx.user.id,
          previousOneToOne: prevOneToOne,
          newOneToOne: input.allocatedOneToOne,
          previousGroup: prevGroup,
          newGroup: input.allocatedGroup,
          reason: input.reason || null,
        });
      });

      await updateStudentSessionBalances(db, input.studentId);

      return db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
    }),

  getSessionAllocationLogs: adminQuery
    .input(z.object({ studentId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.query.sessionAllocationLogs.findMany({
        where: eq(sessionAllocationLogs.studentId, input.studentId),
        orderBy: desc(sessionAllocationLogs.changedAt),
        with: {
          changedByUser: true,
        },
      });
    }),
});
