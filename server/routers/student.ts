import { z } from "zod";
import { eq, desc, or, and, inArray, isNotNull, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";
import { flexibilityRequests, feedback, notifications, payments, profiles, users, batchEnrollments, batches, classes, oneToOneSessions, systemSettings, classBatches } from "@db/schema";
import { sendNotification, sendBulkNotification } from "../lib/notificationEngine";
import { generateNextEnrollmentId } from "../lib/studentIdGenerator";
import { recalculateStudentFees } from "../lib/feeHelper";
import { EnrollmentPaymentService } from "../lib/EnrollmentPaymentService";


export const studentRouter = createRouter({
  myPayments: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.payments.findMany({
      where: eq(payments.studentId, ctx.user.id),
      orderBy: desc(payments.createdAt),
      with: {
        batch: true,
      },
    });
  }),

  // Flexibility Requests
  createRequest: authedQuery
    .input(z.object({
      requestType: z.enum(["hold", "rejoin", "batch_change", "batch_removal"]),
      fromBatchId: z.number().optional(),
      toBatchId: z.number().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Input validations
      if (input.requestType === "batch_change") {
        if (!input.fromBatchId || !input.toBatchId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Both current batch and desired batch must be specified for a batch change request.",
          });
        }
      } else if (input.requestType === "batch_removal") {
        if (!input.fromBatchId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Current batch must be specified for a batch removal request.",
          });
        }
      }

      const result = await db.insert(flexibilityRequests).values({
        studentId: ctx.user.id,
        ...input,
      }).returning({ id: flexibilityRequests.id });

      // Notify student
      const typeLabel = input.requestType.replace("_", " ");
      await sendNotification(
        ctx.user.id,
        "Request Received",
        `Your ${typeLabel} request has been successfully received and is pending admin review.`,
        "flexibility_request_received"
      );

      // Notify Super Admins
      const superAdmins = await db.query.users.findMany({
        where: eq(users.role, "super_admin"),
        columns: { id: true },
      });
      const superAdminIds = superAdmins.map((sa) => sa.id);
      if (superAdminIds.length > 0) {
        await sendBulkNotification(
          superAdminIds,
          "New Request Submitted",
          `A new ${typeLabel} request has been submitted by student ${ctx.user.name}.`,
          "flexibility_request_submitted"
        );
      }

      return db.query.flexibilityRequests.findFirst({ where: eq(flexibilityRequests.id, result[0]?.id) });
    }),

  cancelRequest: authedQuery
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const request = await db.query.flexibilityRequests.findFirst({
        where: and(
          eq(flexibilityRequests.id, input.requestId),
          eq(flexibilityRequests.studentId, ctx.user.id),
          eq(flexibilityRequests.status, "pending")
        ),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pending request not found.",
        });
      }

      await db.update(flexibilityRequests)
        .set({
          status: "cancelled",
          resolvedAt: new Date(),
        })
        .where(eq(flexibilityRequests.id, input.requestId));

      // Append cancellation details to student's profile timeline
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, ctx.user.id),
      });
      if (profile) {
        const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
        timeline.push({
          type: request.requestType,
          status: "cancelled",
          timestamp: new Date().toISOString(),
        });
        await db.update(profiles)
          .set({ activityTimeline: timeline })
          .where(eq(profiles.userId, ctx.user.id));
      }

      return { success: true };
    }),

  myRequests: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.flexibilityRequests.findMany({
      where: eq(flexibilityRequests.studentId, ctx.user.id),
      orderBy: desc(flexibilityRequests.requestedAt),
      with: { fromBatch: true, toBatch: true },
    });
  }),

  // Feedback
  getConductedTeachers: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    
    // Get student's enrollments
    const enrollments = await db.query.batchEnrollments.findMany({
      where: eq(batchEnrollments.studentId, ctx.user.id),
    });
    const batchIds = enrollments.map((e) => e.batchId);
    
    const teacherBatchMap = new Map<string, { teacher: any, batch: any }>();
    
    if (batchIds.length > 0) {
      // Find group classes
      const groupClasses = await db.query.classes.findMany({
        where: and(
          eq(classes.status, "completed"),
          inArray(classes.batchId, batchIds)
        ),
        with: {
          teacher: true,
          batch: {
            with: {
              module: true,
            }
          },
        },
      });
      
      for (const cls of groupClasses) {
        if (cls.teacher && cls.batch) {
          const key = `${cls.teacher.id}-${cls.batch.id}`;
          teacherBatchMap.set(key, {
            teacher: cls.teacher,
            batch: cls.batch,
          });
        }
      }

      // Find group classes in classBatches join table
      const multiBatchClasses = await db
        .select({
          classId: classes.id,
          teacherId: classes.teacherId,
          batchId: classBatches.batchId,
        })
        .from(classBatches)
        .innerJoin(classes, eq(classBatches.classId, classes.id))
        .where(
          and(
            eq(classes.status, "completed"),
            inArray(classBatches.batchId, batchIds)
          )
        );
      
      if (multiBatchClasses.length > 0) {
        const teachers = await db.query.users.findMany({
          where: inArray(users.id, multiBatchClasses.map(mb => mb.teacherId)),
        });
        const batchesList = await db.query.batches.findMany({
          where: inArray(batches.id, multiBatchClasses.map(mb => mb.batchId)),
          with: { module: true },
        });
        
        for (const mb of multiBatchClasses) {
          const teacher = teachers.find(t => t.id === mb.teacherId);
          const batch = batchesList.find(b => b.id === mb.batchId);
          if (teacher && batch) {
            const key = `${teacher.id}-${batch.id}`;
            teacherBatchMap.set(key, { teacher, batch });
          }
        }
      }
    }
    
    // Find completed one-to-one sessions
    const oneToOnes = await db.query.oneToOneSessions.findMany({
      where: and(
        eq(oneToOneSessions.studentId, ctx.user.id),
        eq(oneToOneSessions.status, "completed")
      ),
      with: {
        teacher: true,
      },
    });
    
    for (const oto of oneToOnes) {
      if (oto.teacher) {
        const matchingBatch = enrollments.find(() => true);
        if (matchingBatch) {
          const batch = await db.query.batches.findFirst({
            where: eq(batches.id, matchingBatch.batchId),
            with: { module: true },
          });
          if (batch) {
            const key = `${oto.teacher.id}-${batch.id}`;
            teacherBatchMap.set(key, {
              teacher: oto.teacher,
              batch: batch,
            });
          }
        }
      }
    }
    
    return Array.from(teacherBatchMap.values());
  }),

  submitFeedback: authedQuery
    .input(z.object({
      teacherId: z.number(),
      batchId: z.number(),
      classId: z.number().optional(),
      rating: z.number().min(1).max(5),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      // Helper to retrieve settings
      const getSetting = async (key: string, defaultValue: string): Promise<string> => {
        const row = await db.query.systemSettings.findFirst({
          where: eq(systemSettings.key, key),
        });
        return row ? row.value : defaultValue;
      };

      // 1. Verify student is enrolled in the batch
      const enrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, ctx.user.id),
          eq(batchEnrollments.batchId, input.batchId)
        ),
      });
      if (!enrollment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You are not enrolled in this batch.",
        });
      }

      // 2. Verify teacher has conducted a class for the student
      const completedClass = await db.query.classes.findFirst({
        where: and(
          eq(classes.teacherId, input.teacherId),
          eq(classes.status, "completed"),
          eq(classes.batchId, input.batchId)
        ),
      });

      let classBatchesMatch = null;
      if (!completedClass) {
        classBatchesMatch = await db
          .select()
          .from(classBatches)
          .innerJoin(classes, eq(classBatches.classId, classes.id))
          .where(
            and(
              eq(classes.teacherId, input.teacherId),
              eq(classes.status, "completed"),
              eq(classBatches.batchId, input.batchId)
            )
          )
          .limit(1);
      }

      const completedOneToOne = await db.query.oneToOneSessions.findFirst({
        where: and(
          eq(oneToOneSessions.teacherId, input.teacherId),
          eq(oneToOneSessions.studentId, ctx.user.id),
          eq(oneToOneSessions.status, "completed")
        ),
      });

      if (!completedClass && (!classBatchesMatch || classBatchesMatch.length === 0) && !completedOneToOne) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This teacher has not conducted any completed classes for you.",
        });
      }

      // 3. Verify single feedback rule if configured
      const limitPerBatchStr = await getSetting("feedback_limit_per_batch", "true");
      if (limitPerBatchStr === "true") {
        const existingFeedback = await db.query.feedback.findFirst({
          where: and(
            eq(feedback.studentId, ctx.user.id),
            eq(feedback.teacherId, input.teacherId),
            eq(feedback.batchId, input.batchId)
          ),
        });
        if (existingFeedback) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You have already submitted feedback for this teacher in this batch.",
          });
        }
      }

      // 4. Insert feedback
      const [inserted] = await db.insert(feedback).values({
        studentId: ctx.user.id,
        teacherId: input.teacherId,
        batchId: input.batchId,
        classId: input.classId ?? null,
        rating: input.rating,
        comment: input.comment ?? null,
      }).returning();

      // 5. Send notifications
      const teacher = await db.query.users.findFirst({
        where: eq(users.id, input.teacherId),
        columns: { name: true },
      });

      const admins = await db.query.users.findMany({
        where: or(
          eq(users.role, "admin"),
          eq(users.role, "academic_head"),
          eq(users.role, "super_admin")
        ),
        columns: { id: true },
      });

      const adminIds = admins.map((a) => a.id);
      if (adminIds.length > 0 && teacher) {
        await sendBulkNotification(
          adminIds,
          "New Feedback Submitted",
          `Student ${ctx.user.name} submitted feedback for teacher ${teacher.name}.`,
          "feedback_submitted",
          {
            feedbackId: inserted?.id,
            teacherId: input.teacherId,
            batchId: input.batchId,
          }
        );
      }

      return { success: true };
    }),

  editFeedback: authedQuery
    .input(z.object({
      feedbackId: z.number(),
      rating: z.number().min(1).max(5),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const record = await db.query.feedback.findFirst({
        where: and(
          eq(feedback.id, input.feedbackId),
          eq(feedback.studentId, ctx.user.id)
        ),
      });
      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feedback not found.",
        });
      }

      const getSetting = async (key: string, defaultValue: string): Promise<string> => {
        const row = await db.query.systemSettings.findFirst({
          where: eq(systemSettings.key, key),
        });
        return row ? row.value : defaultValue;
      };

      const editPeriodStr = await getSetting("feedback_edit_period_minutes", "60");
      const editPeriodMinutes = parseInt(editPeriodStr, 10);
      if (isNaN(editPeriodMinutes) || editPeriodMinutes <= 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Editing feedback is disabled.",
        });
      }

      const timeElapsed = (Date.now() - record.createdAt.getTime()) / (1000 * 60);
      if (timeElapsed > editPeriodMinutes) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Feedback can only be edited within ${editPeriodMinutes} minutes of submission.`,
        });
      }

      await db.update(feedback)
        .set({
          rating: input.rating,
          comment: input.comment ?? null,
        })
        .where(eq(feedback.id, input.feedbackId));

      return { success: true };
    }),

  getMyFeedback: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.feedback.findMany({
      where: eq(feedback.studentId, ctx.user.id),
      orderBy: desc(feedback.createdAt),
      with: {
        teacher: true,
        batch: {
          with: {
            module: true,
          }
        },
        class: true,
      },
    });
  }),

  // Notifications
  myNotifications: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.notifications.findMany({
      where: eq(notifications.userId, ctx.user.id),
      orderBy: desc(notifications.createdAt),
    });
  }),

  markNotificationRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, input.id));
      return { success: true };
    }),

  createRazorpayOrder: authedQuery
    .input(z.object({ amount: z.number().optional(), paymentId: z.number().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, ctx.user.id),
      });
      if (!profile) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Student profile not found." });
      }
      const balance = parseFloat(profile.feesBalance ?? "0");
      let amount = input?.amount ?? balance;

      if (input?.paymentId) {
        const paymentRecord = await db.query.payments.findFirst({
          where: and(
            eq(payments.id, input.paymentId),
            eq(payments.studentId, ctx.user.id)
          ),
        });
        if (!paymentRecord) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Installment invoice not found." });
        }
        if (paymentRecord.status === "paid") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This installment is already paid." });
        }
        amount = parseFloat(paymentRecord.amount);
      } else {
        // Minimum initial payment check
        const feesPaid = parseFloat(profile.feesPaid ?? "0");
        const minInitial = parseFloat(profile.minInitialPayment ?? "0");
        if (feesPaid === 0 && minInitial > 0) {
          const requiredMin = Math.min(minInitial, balance);
          if (amount < requiredMin) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Minimum initial payment of ₹${requiredMin} is required.`,
            });
          }
        }
      }

      if (amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No pending balance to pay." });
      }

      const amountInPaise = Math.round(amount * 100);

      const isMockKey = env.razorpayKeyId.includes("mock") || env.razorpayKeyId === "";
      let orderId = `order_mock_${Math.random().toString(36).substring(2, 15)}`;

      if (!isMockKey) {
        try {
          const response = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Basic " + Buffer.from(env.razorpayKeyId + ":" + env.razorpayKeySecret).toString("base64"),
            },
            body: JSON.stringify({
              amount: amountInPaise,
              currency: "INR",
              receipt: `rcpt_${ctx.user.id}_${Date.now()}`,
            }),
          });
          if (response.ok) {
            const data = (await response.json()) as { id: string };
            orderId = data.id;
          } else {
            const errText = await response.text();
            console.error("Razorpay order creation failed, falling back to mock order id:", errText);
          }
        } catch (err) {
          console.error("Razorpay order creation network error, falling back to mock order id:", err);
        }
      }

      return {
        orderId,
        amount: amountInPaise,
        currency: "INR",
        keyId: env.razorpayKeyId,
      };
    }),

  verifyRazorpayPayment: authedQuery
    .input(z.object({
      razorpay_payment_id: z.string(),
      razorpay_order_id: z.string(),
      razorpay_signature: z.string(),
      amount: z.number(),
      paymentId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const isMockKey = env.razorpayKeyId.includes("mock") || env.razorpayKeyId === "";
      const isMock = isMockKey || input.razorpay_order_id.startsWith("order_mock") || input.razorpay_signature === "mock_signature";

      if (!isMock) {
        const generatedSignature = crypto
          .createHmac("sha256", env.razorpayKeySecret)
          .update(input.razorpay_order_id + "|" + input.razorpay_payment_id)
          .digest("hex");
        if (generatedSignature !== input.razorpay_signature) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid payment signature." });
        }
      }

      // Record payment
      let paymentRecord;
      if (input.paymentId) {
        const [updated] = await db.update(payments)
          .set({
            status: "paid",
            paidAt: new Date(),
            paidDate: new Date(),
            transactionId: input.razorpay_payment_id,
            notes: `Paid via Razorpay. Order: ${input.razorpay_order_id}`,
          })
          .where(and(
            eq(payments.id, input.paymentId),
            eq(payments.studentId, ctx.user.id)
          ))
          .returning();
        paymentRecord = updated;
      } else {
        const [inserted] = await db.insert(payments).values({
           studentId: ctx.user.id,
           amount: String(input.amount),
           type: "tuition",
           status: "paid",
           paidAt: new Date(),
           paidDate: new Date(),
           transactionId: input.razorpay_payment_id,
           notes: `Paid via Razorpay. Order: ${input.razorpay_order_id}`,
        }).returning();
        paymentRecord = inserted;
      }

      // Update profile
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, ctx.user.id),
      });
      if (profile) {
        const currentPaid = parseFloat(profile.feesPaid ?? "0");
        const currentTotal = parseFloat(profile.feesTotal ?? "0");
        const nextPaid = currentPaid + input.amount;
        const nextBalance = Math.max(0, currentTotal - nextPaid);
        const nextPaymentStatus = nextBalance <= 0 ? "paid" : "partial";

        let paymentDueDate: Date | null = null;
        const activeEnrollment = await db.query.batchEnrollments.findFirst({
          where: and(
            eq(batchEnrollments.studentId, ctx.user.id),
            eq(batchEnrollments.status, "active")
          ),
        });

        if (activeEnrollment?.paymentType === "INSTALLMENT" && nextBalance > 0) {
          const nextUnpaid = await db.query.payments.findFirst({
            where: and(
              eq(payments.studentId, ctx.user.id),
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
          feesPaid: String(nextPaid),
          feesBalance: String(nextBalance),
          timestamp: new Date().toISOString(),
        });
        
        if (nextBalance <= 0) {
          timeline.push({
            type: "access_restored",
            reason: "Fees fully paid",
            timestamp: new Date().toISOString(),
          });
        }

        await db.update(profiles)
          .set({
            feesPaid: String(nextPaid),
            feesBalance: String(nextBalance),
            paymentStatus: nextPaymentStatus,
            paymentDueDate,
            activityTimeline: timeline,
          })
          .where(eq(profiles.userId, ctx.user.id));

        await recalculateStudentFees(ctx.user.id);
      }

      // Reactivate student status and batch enrollments
      await db.update(users)
        .set({ status: "active" })
        .where(eq(users.id, ctx.user.id));

      await db.update(batchEnrollments)
        .set({ status: "active" })
        .where(and(
          eq(batchEnrollments.studentId, ctx.user.id),
          or(
            eq(batchEnrollments.status, "inactive"),
            eq(batchEnrollments.status, "on_hold"),
            eq(batchEnrollments.status, "restricted")
          )
        ));

      const studentUser = await db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
      });

      return {
        success: true,
        payment: {
          id: paymentRecord?.id,
          amount: paymentRecord?.amount,
          paidAt: paymentRecord?.paidAt,
          transactionId: paymentRecord?.transactionId,
          student: studentUser ? { name: studentUser.name, unionId: studentUser.unionId } : null,
          courseName: profile?.course || "Course",
        },
      };
    }),

  createEnrollmentOrder: authedQuery
    .input(z.object({
      batchId: z.number(),
      paymentOption: z.enum(["full_payment", "installment"]).default("full_payment"),
      downPayment: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Check if student is already enrolled in this batch
      const existing = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.batchId, input.batchId),
          eq(batchEnrollments.studentId, ctx.user.id),
          eq(batchEnrollments.status, "active")
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "You are already enrolled in this batch" });
      }

      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
        with: { module: true },
      });
      if (!batch) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      }

      const moduleRecord = batch.module;
      if (!moduleRecord) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Module not found for this batch" });
      }

      const totalCourseFee = parseFloat(moduleRecord.courseFee ?? "0");
      const minDownPayment = parseFloat(moduleRecord.minimumDownPayment ?? "0");

      let amountToPay = totalCourseFee;
      if (input.paymentOption === "installment") {
        const dp = input.downPayment !== undefined ? input.downPayment : minDownPayment;
        if (dp < minDownPayment) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Down payment must be at least ₹${minDownPayment.toLocaleString()}`,
          });
        }
        amountToPay = dp;
      }

      const amountInPaise = Math.round(amountToPay * 100);

      const isMockKey = env.razorpayKeyId.includes("mock") || env.razorpayKeyId === "";
      let orderId = `order_mock_${Math.random().toString(36).substring(2, 15)}`;

      if (!isMockKey && amountInPaise > 0) {
        try {
          const response = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Basic " + Buffer.from(env.razorpayKeyId + ":" + env.razorpayKeySecret).toString("base64"),
            },
            body: JSON.stringify({
              amount: amountInPaise,
              currency: "INR",
              receipt: EnrollmentPaymentService.generateReceiptNumber(ctx.user.id, input.batchId),
            }),
          });
          if (response.ok) {
            const data = (await response.json()) as { id: string };
            orderId = data.id;
          } else {
            const errText = await response.text();
            console.error("Razorpay enrollment order creation failed, falling back to mock order id:", errText);
          }
        } catch (err) {
          console.error("Razorpay enrollment order creation network error, falling back to mock order id:", err);
        }
      }

      return {
        orderId,
        amount: amountInPaise,
        currency: "INR",
        keyId: env.razorpayKeyId,
      };
    }),

  verifyEnrollmentPayment: authedQuery
    .input(z.object({
      batchId: z.number(),
      razorpay_payment_id: z.string(),
      razorpay_order_id: z.string(),
      razorpay_signature: z.string(),
      amount: z.number(),
      paymentOption: z.enum(["full_payment", "installment"]).default("full_payment"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const isMockKey = env.razorpayKeyId.includes("mock") || env.razorpayKeyId === "";
      const isMock = isMockKey || input.razorpay_order_id.startsWith("order_mock") || input.razorpay_signature === "mock_signature";

      if (!isMock) {
        const generatedSignature = crypto
          .createHmac("sha256", env.razorpayKeySecret)
          .update(input.razorpay_order_id + "|" + input.razorpay_payment_id)
          .digest("hex");
        if (generatedSignature !== input.razorpay_signature) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid payment signature." });
        }
      }

      return await db.transaction(async (tx) => {
        const batch = await tx.query.batches.findFirst({
          where: eq(batches.id, input.batchId),
          with: { module: true },
        });
        if (!batch) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
        }

        const moduleRecord = batch.module;
        if (!moduleRecord) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Module not found for this batch" });
        }

        const totalCourseFee = parseFloat(moduleRecord.courseFee ?? "0");
        const paidAmount = input.amount;
        const remainingBalance = Math.max(0, totalCourseFee - paidAmount);
        
        let paymentStatus: "paid" | "partial" | "unpaid" = "unpaid";
        if (remainingBalance <= 0) {
          paymentStatus = "paid";
        } else if (paidAmount > 0) {
          paymentStatus = "partial";
        }

        try {
          await EnrollmentPaymentService.processEnrollment(tx, {
            studentId: ctx.user.id,
            batchId: input.batchId,
            moduleId: batch.moduleId,
            totalCourseFee,
            paymentOption: input.paymentOption,
            paidAmount,
            remainingBalance,
            paymentStatus,
            registrationSource: "self",
            razorpayPaymentId: input.razorpay_payment_id,
          });
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message || "Failed to process enrollment" });
        }

        const paymentRecord = await tx.query.payments.findFirst({
          where: and(
            eq(payments.studentId, ctx.user.id),
            eq(payments.batchId, input.batchId),
            eq(payments.transactionId, input.razorpay_payment_id)
          ),
        });

        const studentUser = await tx.query.users.findFirst({
          where: eq(users.id, ctx.user.id),
        });

        const receipt = EnrollmentPaymentService.generateReceipt(
          paymentRecord || { id: 0, amount: String(paidAmount), paidAt: new Date(), transactionId: input.razorpay_payment_id },
          studentUser,
          moduleRecord.name
        );

        return {
          success: true,
          payment: receipt,
        };
      });
    }),
});
