import { z } from "zod";
import { eq, desc, and, count, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { modules, batches, batchEnrollments, messages, learningMaterials, profiles, users, flexibilityRequests, classes, oneToOneSessions, feedback, batchFeeAuditLogs, batchAuditLogs, payments } from "@db/schema";
import { sendBulkNotification, getAdminUserIds } from "../lib/notificationEngine";
import { getIo } from "../lib/socketInstance";
import { isStudentFeeRestricted } from "../lib/feeHelper";

export const learningRouter = createRouter({
  // Modules
  listModules: authedQuery.query(async () => {
    const db = getDb();
    return db.query.modules.findMany({
      orderBy: desc(modules.createdAt),
      with: { batches: true, teacher: true },
    });
  }),

  createModule: adminQuery
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      learningObjectives: z.string().optional(),
      topics: z.string().optional(),
      teacherId: z.number().optional(),
      duration: z.string().optional(),
      maxStudents: z.number().optional(),
      minStudents: z.number().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(modules).values(input).returning({ id: modules.id });
      return db.query.modules.findFirst({
        where: eq(modules.id, result[0]?.id),
        with: { teacher: true },
      });
    }),

  updateModule: adminQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      learningObjectives: z.string().optional(),
      topics: z.string().optional(),
      teacherId: z.number().nullable().optional(),
      duration: z.string().optional(),
      maxStudents: z.number().optional(),
      minStudents: z.number().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db.update(modules)
        .set(data)
        .where(eq(modules.id, id));
      return db.query.modules.findFirst({
        where: eq(modules.id, id),
        with: { teacher: true },
      });
    }),

  // Batches
  listBatches: authedQuery
    .input(z.object({ moduleId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const where = input?.moduleId ? eq(batches.moduleId, input.moduleId) : undefined;
      return db.query.batches.findMany({
        where,
        with: {
          module: true,
          teacher: true,
          enrollments: {
            where: eq(batchEnrollments.status, "active"),
          },
        },
      });
    }),

  createBatch: adminQuery
    .input(z.object({
      moduleId: z.number(),
      name: z.string(),
      timeSlot: z.string().optional(),
      teacherId: z.number().optional(),
      maxStudents: z.number().optional(),
      startDate: z.date().optional(),
      duration: z.string().optional(),
      courseFee: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { courseFee, ...rest } = input;
      const result = await db.insert(batches).values({
        ...rest,
        courseFee: courseFee !== undefined ? String(courseFee) : undefined,
      }).returning({ id: batches.id });
      return db.query.batches.findFirst({ where: eq(batches.id, result[0]?.id), with: { module: true } });
    }),

  updateBatchFee: adminQuery
    .input(z.object({
      batchId: z.number(),
      courseFee: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Strict check: Only super_admin can modify batch fee
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }

      // Validate courseFee is a positive numeric value
      if (input.courseFee <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Fee amount must be a positive number.",
        });
      }

      const db = getDb();

      // Retrieve current batch to get previous fee
      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
      });

      if (!batch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Batch not found.",
        });
      }

      const previousFeeStr = batch.courseFee ?? "0";
      const updatedFeeStr = String(input.courseFee);

      // Update the batch fee and insert an audit log inside a transaction
      await db.transaction(async (tx) => {
        await tx.update(batches)
          .set({ courseFee: updatedFeeStr })
          .where(eq(batches.id, input.batchId));

        await tx.insert(batchFeeAuditLogs).values({
          batchId: input.batchId,
          previousFee: previousFeeStr,
          updatedFee: updatedFeeStr,
          adminId: ctx.user.id,
        });
      });

      // Refetch and return the updated batch
      return db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
        with: {
          module: true,
          teacher: true,
          enrollments: {
            where: eq(batchEnrollments.status, "active"),
          },
        },
      });
    }),

  updateBatch: adminQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      timeSlot: z.string().optional(),
      teacherId: z.number().nullable().optional(),
      maxStudents: z.number().optional(),
      status: z.string().optional(),
      moduleId: z.number().optional(),
      startDate: z.date().nullable().optional(),
      duration: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Strict check: Only super_admin can edit batch details
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }

      const db = getDb();
      const { id, ...data } = input;

      const existing = await db.query.batches.findFirst({
        where: eq(batches.id, id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Batch not found.",
        });
      }

      // We need to compare changes and record them in batchAuditLogs
      const logsToInsert: {
        batchId: number;
        fieldName: string;
        previousValue: string | null;
        newValue: string | null;
        changedBy: number;
      }[] = [];

      const addLog = (field: string, prev: string | null, nextVal: string | null) => {
        if (prev !== nextVal) {
          logsToInsert.push({
            batchId: id,
            fieldName: field,
            previousValue: prev,
            newValue: nextVal,
            changedBy: ctx.user.id,
          });
        }
      };

      if (data.name !== undefined) addLog("name", existing.name, data.name);
      if (data.description !== undefined) addLog("description", existing.description, data.description);
      if (data.timeSlot !== undefined) addLog("timeSlot", existing.timeSlot, data.timeSlot);
      if (data.maxStudents !== undefined) addLog("maxStudents", existing.maxStudents?.toString() || null, data.maxStudents?.toString() || null);
      if (data.status !== undefined) addLog("status", existing.status, data.status);
      if (data.duration !== undefined) addLog("duration", existing.duration, data.duration);
      if (data.startDate !== undefined) {
        const prevStr = existing.startDate ? existing.startDate.toISOString() : null;
        const nextStr = data.startDate ? data.startDate.toISOString() : null;
        addLog("startDate", prevStr, nextStr);
      }

      if (data.teacherId !== undefined) {
        const prevId = existing.teacherId;
        const nextId = data.teacherId;
        if (prevId !== nextId) {
          let prevName = "Not assigned";
          let nextName = "Not assigned";
          if (prevId) {
            const t = await db.query.users.findFirst({ where: eq(users.id, prevId) });
            if (t) prevName = `${t.name} (ID: ${t.unionId})`;
          }
          if (nextId) {
            const t = await db.query.users.findFirst({ where: eq(users.id, nextId) });
            if (t) nextName = `${t.name} (ID: ${t.unionId})`;
          }
          addLog("teacher", prevName, nextName);
        }
      }

      if (data.moduleId !== undefined) {
        const prevId = existing.moduleId;
        const nextId = data.moduleId;
        if (prevId !== nextId) {
          let prevName = "Unknown";
          let nextName = "Unknown";
          if (prevId) {
            const m = await db.query.modules.findFirst({ where: eq(modules.id, prevId) });
            if (m) prevName = `${m.name} (ID: ${m.id})`;
          }
          if (nextId) {
            const m = await db.query.modules.findFirst({ where: eq(modules.id, nextId) });
            if (m) nextName = `${m.name} (ID: ${m.id})`;
          }
          addLog("course", prevName, nextName);
        }
      }

      await db.transaction(async (tx) => {
        await tx.update(batches)
          .set({
            name: data.name,
            description: data.description,
            timeSlot: data.timeSlot,
            teacherId: data.teacherId,
            maxStudents: data.maxStudents,
            status: data.status,
            moduleId: data.moduleId,
            startDate: data.startDate,
            duration: data.duration,
          })
          .where(eq(batches.id, id));

        if (logsToInsert.length > 0) {
          await tx.insert(batchAuditLogs).values(logsToInsert);
        }
      });

      return db.query.batches.findFirst({
        where: eq(batches.id, id),
        with: {
          module: true,
          teacher: true,
          enrollments: {
            where: eq(batchEnrollments.status, "active"),
          },
        },
      });
    }),

  enrollStudent: adminQuery
    .input(z.object({
      batchId: z.number(),
      studentId: z.union([z.number(), z.string()]),
      paymentType: z.enum(["FULL_PAYMENT", "INSTALLMENT"]).optional(),
      feesTotal: z.number().optional(),
      installments: z.array(
        z.object({
          installmentNumber: z.number(),
          amount: z.number(),
          dueDate: z.string().optional(),
        })
      ).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();

      let userId: number;
      if (typeof input.studentId === "string") {
        const parsed = parseInt(input.studentId, 10);
        if (!isNaN(parsed) && String(parsed) === input.studentId.trim()) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: and(eq(users.unionId, input.studentId), eq(users.role, "student")),
          });
          if (!u) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Student not found with this ID" });
          }
          userId = u.id;
        }
      } else {
        userId = input.studentId;
      }

      // Check for existing active enrollment
      const existing = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.batchId, input.batchId),
          eq(batchEnrollments.studentId, userId),
          eq(batchEnrollments.status, "active")
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Student already enrolled in this batch" });
      }

      const paymentType = input.paymentType || "FULL_PAYMENT";

      await db.insert(batchEnrollments).values({
        batchId: input.batchId,
        studentId: userId,
        paymentType,
      });

      // Update student profile with enrolled batch and course info
      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
        with: { module: true },
      });

      if (batch) {
        const defaultFee = batch.courseFee ? parseFloat(batch.courseFee) : 0;
        const feesTotal = input.feesTotal !== undefined ? input.feesTotal : defaultFee;

        let paymentDueDate: Date | null = null;
        if (paymentType === "INSTALLMENT" && input.installments && input.installments.length > 0) {
          const firstInst = input.installments.find((i) => i.installmentNumber === 1);
          if (firstInst?.dueDate) {
            paymentDueDate = new Date(firstInst.dueDate);
          }
        }

        const existingProfile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, userId),
        });

        if (existingProfile) {
          await db.update(profiles)
            .set({
              batch: batch.name,
              batchTime: batch.timeSlot,
              course: batch.module?.name || null,
              feesTotal: String(feesTotal),
              feesBalance: String(feesTotal),
              feesPaid: "0.00",
              paymentStatus: "unpaid",
              paymentDueDate: paymentDueDate,
            })
            .where(eq(profiles.userId, userId));
        } else {
          await db.insert(profiles).values({
            userId,
            batch: batch.name,
            batchTime: batch.timeSlot,
            course: batch.module?.name || null,
            feesTotal: String(feesTotal),
            feesBalance: String(feesTotal),
            feesPaid: "0.00",
            paymentStatus: "unpaid",
            paymentDueDate: paymentDueDate,
          });
        }

        // Clean up any existing unpaid payments for this batch to avoid duplicates
        await db.delete(payments).where(and(
          eq(payments.studentId, userId),
          eq(payments.batchId, input.batchId),
          eq(payments.status, "unpaid")
        ));

        // Generate payments
        if (paymentType === "INSTALLMENT" && input.installments && input.installments.length > 0) {
          for (const inst of input.installments) {
            await db.insert(payments).values({
              studentId: userId,
              amount: String(inst.amount),
              type: "tuition",
              status: "unpaid",
              dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
              installmentNumber: inst.installmentNumber,
              batchId: input.batchId,
            });
          }
        } else {
          await db.insert(payments).values({
            studentId: userId,
            amount: String(feesTotal),
            type: "tuition",
            status: "unpaid",
            dueDate: null,
            installmentNumber: null,
            batchId: input.batchId,
          });
        }
      }

      // Capacity alert: notify admins if over maxStudents
      const [{ value: activeCount }] = await db
        .select({ value: count() })
        .from(batchEnrollments)
        .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active")));

      if (batch?.maxStudents != null && activeCount > batch.maxStudents) {
        const adminIds = await getAdminUserIds();
        await sendBulkNotification(
          adminIds,
          "Batch Overcrowded",
          `Batch "${batch.name}" has exceeded its maximum capacity (${activeCount}/${batch.maxStudents}).`,
          "capacity_alert",
          { batchId: input.batchId, activeCount, maxStudents: batch.maxStudents }
        );
      }

      return { success: true };
    }),

  removeStudent: adminQuery
    .input(z.object({ batchId: z.number(), studentId: z.union([z.number(), z.string()]) }))
    .mutation(async ({ ctx, input }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();

      let userId: number;
      if (typeof input.studentId === "string") {
        const parsed = parseInt(input.studentId, 10);
        if (!isNaN(parsed) && String(parsed) === input.studentId.trim()) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: and(eq(users.unionId, input.studentId), eq(users.role, "student")),
          });
          if (!u) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Student not found with this ID" });
          }
          userId = u.id;
        }
      } else {
        userId = input.studentId;
      }

      await db.update(batchEnrollments)
        .set({ status: "inactive", leftAt: new Date() })
        .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.studentId, userId)));

      // Update student profile: clear or update to another active enrollment
      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
      });

      if (batch) {
        const existingProfile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, userId),
        });

        if (existingProfile && existingProfile.batch === batch.name) {
          // Find if student has other active enrollments
          const otherEnrollment = await db.query.batchEnrollments.findFirst({
            where: and(
              eq(batchEnrollments.studentId, userId),
              eq(batchEnrollments.status, "active")
            ),
            with: { batch: { with: { module: true } } },
          });

          if (otherEnrollment && otherEnrollment.batch) {
            await db.update(profiles)
              .set({
                batch: otherEnrollment.batch.name,
                batchTime: otherEnrollment.batch.timeSlot,
                course: otherEnrollment.batch.module?.name || null,
              })
              .where(eq(profiles.userId, userId));
          } else {
            await db.update(profiles)
              .set({
                batch: null,
                batchTime: null,
                course: null,
              })
              .where(eq(profiles.userId, userId));
          }
        }
      }

      // Capacity alert: notify admins if under minStudents
      const batchWithModule = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
        with: { module: true },
      });
      const [{ value: activeCount }] = await db
        .select({ value: count() })
        .from(batchEnrollments)
        .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active")));

      const minStudents = batchWithModule?.module?.minStudents;
      if (minStudents != null && activeCount < minStudents) {
        const adminIds = await getAdminUserIds();
        await sendBulkNotification(
          adminIds,
          "Batch Underpopulated",
          `Batch "${batchWithModule?.name}" has fallen below the minimum student count (${activeCount}/${minStudents}).`,
          "capacity_alert",
          { batchId: input.batchId, activeCount, minStudents }
        );
      }

      return { success: true };
    }),

  // Messages (Chat)
  listMessages: authedQuery
    .input(z.object({ batchId: z.number(), limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      // Verify user is in the batch and active
      const enrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.batchId, input.batchId),
          eq(batchEnrollments.studentId, ctx.user.id),
          eq(batchEnrollments.status, "active")
        ),
      });
      const isTeacher = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
      });
      const allowed = enrollment || isTeacher?.teacherId === ctx.user.id || ["admin", "super_admin", "academic_head"].includes(ctx.user.role);
      if (!allowed) return [];

      const results = await db.query.messages.findMany({
        where: eq(messages.batchId, input.batchId),
        orderBy: desc(messages.createdAt),
        limit: input.limit,
        offset: input.offset,
        with: { sender: true },
      });

      // Filter out messages that the current user has "deleted for me"
      const activeMessages = results.filter((msg) => {
        const deletedFor = (msg.deletedForUsers as number[] | null) ?? [];
        return !deletedFor.includes(ctx.user.id);
      });

      // Strip phone number from sender data for privacy, and sanitize deleted-for-everyone messages
      return activeMessages.map((msg) => {
        const isDeleted = msg.deletedAt != null;
        return {
          ...msg,
          content: isDeleted ? "This message was deleted" : msg.content,
          mediaUrl: isDeleted ? null : msg.mediaUrl,
          type: isDeleted ? "text" : msg.type,
          reactions: isDeleted ? null : msg.reactions,
          sender: msg.sender ? { ...msg.sender, phone: undefined } : msg.sender,
        };
      });
    }),

  sendMessage: authedQuery
    .input(z.object({
      batchId: z.number(),
      content: z.string(),
      type: z.enum(["text", "voice", "image", "video", "pdf"]).default("text"),
      mediaUrl: z.string().optional(),
      replyToId: z.number().optional(),
      isAnnouncement: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Payment gate: students with restricted access cannot send messages
      if (ctx.user.role === "student") {
        if (await isStudentFeeRestricted(ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Payment required to send messages" });
        }
      }

      // Announcement gate: only teachers and admins can make announcements
      if (input.isAnnouncement === true && ctx.user.role === "student") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only teachers and admins can make announcements" });
      }

      // Academic Head announcement gate: cannot send regular messages
      if (ctx.user.role === "academic_head" && input.isAnnouncement !== true) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Academic Head can only send announcements." });
      }

      const result = await db.insert(messages).values({
        batchId: input.batchId,
        senderId: ctx.user.id,
        content: input.content,
        type: input.type,
        mediaUrl: input.mediaUrl,
        replyToId: input.replyToId,
        isAnnouncement: input.isAnnouncement ?? false,
      }).returning({ id: messages.id });

      // Notify all sockets in the batch room to refetch messages
      getIo()?.to(`batch:${input.batchId}`).emit("message:new", { batchId: input.batchId });

      return db.query.messages.findFirst({ where: eq(messages.id, result[0]?.id), with: { sender: true } });
    }),

  addReaction: authedQuery
    .input(z.object({ messageId: z.number(), emoji: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const message = await db.query.messages.findFirst({
        where: eq(messages.id, input.messageId),
      });
      if (!message) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      }

      // Read existing reactions, default to {}
      const reactions = (message.reactions as Record<string, number[]> | null) ?? {};
      const emojiUsers = reactions[input.emoji] ?? [];

      // Toggle: remove if present, add if not
      if (emojiUsers.includes(ctx.user.id)) {
        reactions[input.emoji] = emojiUsers.filter((id) => id !== ctx.user.id);
        if (reactions[input.emoji].length === 0) {
          delete reactions[input.emoji];
        }
      } else {
        reactions[input.emoji] = [...emojiUsers, ctx.user.id];
      }

      await db.update(messages)
        .set({ reactions })
        .where(eq(messages.id, input.messageId));

      return { success: true, reactions };
    }),

  deleteMessage: authedQuery
    .input(z.object({
      messageId: z.number(),
      deleteType: z.enum(["everyone", "me"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const message = await db.query.messages.findFirst({
        where: eq(messages.id, input.messageId),
      });

      if (!message) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      }

      const isSender = message.senderId === ctx.user.id;
      const isAdminOrTeacher = ["super_admin", "admin", "academic_head", "teacher"].includes(ctx.user.role);

      if (input.deleteType === "everyone") {
        if (!isSender && !isAdminOrTeacher) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to delete this message for everyone",
          });
        }

        // Regular users must delete within 1 minute
        if (!isAdminOrTeacher) {
          const timeDiff = Date.now() - new Date(message.createdAt).getTime();
          if (timeDiff > 60_000) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Messages can only be deleted for everyone within 1 minute of sending",
            });
          }
        }

        await db.update(messages)
          .set({
            deletedAt: new Date(),
            content: "This message was deleted",
            mediaUrl: null,
            type: "text",
            reactions: null,
          })
          .where(eq(messages.id, input.messageId));
      } else {
        const deletedFor = (message.deletedForUsers as number[] | null) ?? [];
        if (!deletedFor.includes(ctx.user.id)) {
          await db.update(messages)
            .set({
              deletedForUsers: [...deletedFor, ctx.user.id],
            })
            .where(eq(messages.id, input.messageId));
        }
      }

      // Notify sockets in the batch room to refetch messages
      getIo()?.to(`batch:${message.batchId}`).emit("message:new", { batchId: message.batchId });

      return { success: true };
    }),

  // Learning Materials
  listMaterials: authedQuery
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();

      if (ctx.user.role === "student") {
        if (await isStudentFeeRestricted(ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access Restricted Due to Outstanding Fees." });
        }

        // Students only see materials that are not scheduled or whose scheduled date has passed
        return db.query.learningMaterials.findMany({
          where: and(
            eq(learningMaterials.batchId, input.batchId),
            sql`(${learningMaterials.scheduledDate} IS NULL OR ${learningMaterials.scheduledDate} <= NOW())`
          ),
          orderBy: desc(learningMaterials.createdAt),
        });
      }

      return db.query.learningMaterials.findMany({
        where: eq(learningMaterials.batchId, input.batchId),
        orderBy: desc(learningMaterials.createdAt),
      });
    }),

  createMaterial: teacherQuery
    .input(z.object({
      batchId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      type: z.enum(["text", "voice", "image", "video", "pdf"]).default("text"),
      contentUrl: z.string().optional(),
      scheduledDate: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db.insert(learningMaterials).values({
        ...input,
        createdBy: ctx.user.id,
      }).returning({ id: learningMaterials.id });
      return db.query.learningMaterials.findFirst({ where: eq(learningMaterials.id, result[0]?.id) });
    }),

  deleteBatch: adminQuery
    .input(z.object({ batchId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Strict check: Only super_admin can delete a batch
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();
      const { batchId } = input;

      // 1. Validation: Check if there are active enrollments
      const [{ value: activeEnrollmentsCount }] = await db
        .select({ value: count() })
        .from(batchEnrollments)
        .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, "active")));

      if (activeEnrollmentsCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete batch with active student enrollments. Remove students first.",
        });
      }

      // 2. Validation: Check if there are ongoing classes
      const [{ value: ongoingClassesCount }] = await db
        .select({ value: count() })
        .from(classes)
        .where(and(eq(classes.batchId, batchId), eq(classes.status, "ongoing")));

      if (ongoingClassesCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete batch while there are ongoing live classes.",
        });
      }

      // 3. Resolve constraint dependencies in transaction
      await db.transaction(async (tx) => {
        // Clear references in flexibility_requests
        await tx.update(flexibilityRequests)
          .set({ fromBatchId: null })
          .where(eq(flexibilityRequests.fromBatchId, batchId));
        await tx.update(flexibilityRequests)
          .set({ toBatchId: null })
          .where(eq(flexibilityRequests.toBatchId, batchId));

        // Clear references to classes belonging to this batch
        const batchClasses = await tx.select({ id: classes.id }).from(classes).where(eq(classes.batchId, batchId));
        const classIds = batchClasses.map((c) => c.id);
        if (classIds.length > 0) {
          await tx.update(oneToOneSessions)
            .set({ classId: null })
            .where(inArray(oneToOneSessions.classId, classIds));
          await tx.update(feedback)
            .set({ classId: null })
            .where(inArray(feedback.classId, classIds));
        }

        // Delete the batch (cascades to batchEnrollments, messages, classes, learningMaterials)
        await tx.delete(batches).where(eq(batches.id, batchId));
      });

      return { success: true };
    }),

  deleteModule: adminQuery
    .input(z.object({ moduleId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { moduleId } = input;

      // Find all batches under this module
      const moduleBatches = await db.select({ id: batches.id }).from(batches).where(eq(batches.moduleId, moduleId));
      const batchIds = moduleBatches.map((b) => b.id);

      if (batchIds.length > 0) {
        // 1. Validation: Check if any batches have active student enrollments
        const [{ value: activeEnrollmentsCount }] = await db
          .select({ value: count() })
          .from(batchEnrollments)
          .where(and(inArray(batchEnrollments.batchId, batchIds), eq(batchEnrollments.status, "active")));

        if (activeEnrollmentsCount > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete module with active student enrollments in its batches. Remove students first.",
          });
        }

        // 2. Validation: Check if any batches have ongoing classes
        const [{ value: ongoingClassesCount }] = await db
          .select({ value: count() })
          .from(classes)
          .where(and(inArray(classes.batchId, batchIds), eq(classes.status, "ongoing")));

        if (ongoingClassesCount > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete module while there are ongoing classes in its batches.",
          });
        }
      }

      // 3. Resolve constraint dependencies in transaction
      await db.transaction(async (tx) => {
        if (batchIds.length > 0) {
          // Clear references in flexibility_requests
          await tx.update(flexibilityRequests)
            .set({ fromBatchId: null })
            .where(inArray(flexibilityRequests.fromBatchId, batchIds));
          await tx.update(flexibilityRequests)
            .set({ toBatchId: null })
            .where(inArray(flexibilityRequests.toBatchId, batchIds));

          // Clear references to classes belonging to these batches
          const batchClasses = await tx.select({ id: classes.id }).from(classes).where(inArray(classes.batchId, batchIds));
          const classIds = batchClasses.map((c) => c.id);
          if (classIds.length > 0) {
            await tx.update(oneToOneSessions)
              .set({ classId: null })
              .where(inArray(oneToOneSessions.classId, classIds));
            await tx.update(feedback)
              .set({ classId: null })
              .where(inArray(feedback.classId, classIds));
          }
        }

        // Delete the module (cascades to batches and then to batchEnrollments, messages, classes, learningMaterials)
        await tx.delete(modules).where(eq(modules.id, moduleId));
      });

      return { success: true };
    }),

  listBatchStudents: authedQuery
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();

      // Verification: only allow if admin, assigned teacher, or enrolled student
      const isTeacher = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
      });
      const isEnrolled = await db.query.batchEnrollments.findFirst({
        where: and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.studentId, ctx.user.id)),
      });

      const allowed = isEnrolled || isTeacher?.teacherId === ctx.user.id || ["admin", "super_admin", "academic_head"].includes(ctx.user.role);
      if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to view students in this batch" });
      }

      const enrollments = await db.query.batchEnrollments.findMany({
        where: and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active")),
        with: { student: { with: { profile: true } } },
      });

      return enrollments.map((e) => e.student);
    }),

  listBatchAuditLogs: adminQuery
    .query(async () => {
      const db = getDb();
      return db.query.batchAuditLogs.findMany({
        orderBy: desc(batchAuditLogs.changedAt),
        with: {
          batch: true,
          changedByUser: true,
        },
      });
    }),
});
