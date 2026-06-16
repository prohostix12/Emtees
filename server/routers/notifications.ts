import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, isNull, inArray, sql, lt, gte } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  notifications,
  announcements,
  announcementDismissals,
  users,
  batchEnrollments,
  batches,
} from "@db/schema";
import { getIo } from "../lib/socketInstance";

// Helper to broadcast announcements in real-time
async function broadcastAnnouncement(announcement: typeof announcements.$inferSelect) {
  const io = getIo();
  if (!io) return;

  const db = getDb();
  const mapped = {
    id: `announcement-${announcement.id}`,
    realId: announcement.id,
    title: announcement.title,
    message: announcement.description,
    type: "announcement",
    isRead: false,
    data: {
      audienceType: announcement.audienceType,
      audienceId: announcement.audienceId,
      expiresAt: announcement.expiresAt,
    },
    createdAt: announcement.createdAt.toISOString(),
  };

  if (announcement.audienceType === "all") {
    const allUsers = await db.query.users.findMany({
      columns: { id: true, role: true, notificationsPausedUntil: true },
    });
    for (const u of allUsers) {
      const isPaused = u.notificationsPausedUntil && u.notificationsPausedUntil.getTime() > Date.now();
      if (!isPaused) {
        io.to(`user:${u.id}`).emit("notification:new", mapped);
      }
    }
  } else if (announcement.audienceType === "students") {
    const studentUsers = await db.query.users.findMany({
      where: eq(users.role, "student"),
      columns: { id: true, notificationsPausedUntil: true },
    });
    for (const student of studentUsers) {
      const isPaused = student.notificationsPausedUntil && student.notificationsPausedUntil.getTime() > Date.now();
      if (!isPaused) {
        io.to(`user:${student.id}`).emit("notification:new", mapped);
      }
    }
  } else if (announcement.audienceType === "teachers") {
    const teacherUsers = await db.query.users.findMany({
      where: eq(users.role, "teacher"),
      columns: { id: true, notificationsPausedUntil: true },
    });
    for (const teacher of teacherUsers) {
      const isPaused = teacher.notificationsPausedUntil && teacher.notificationsPausedUntil.getTime() > Date.now();
      if (!isPaused) {
        io.to(`user:${teacher.id}`).emit("notification:new", mapped);
      }
    }
  } else if (announcement.audienceType === "batch" && announcement.audienceId) {
    const enrollments = await db.query.batchEnrollments.findMany({
      where: and(
        eq(batchEnrollments.batchId, announcement.audienceId),
        eq(batchEnrollments.status, "active")
      ),
    });
    const batchData = await db.query.batches.findFirst({
      where: eq(batches.id, announcement.audienceId),
      columns: { teacherId: true },
    });

    const userIds = enrollments.map((e) => e.studentId);
    if (batchData?.teacherId) {
      userIds.push(batchData.teacherId);
    }

    if (userIds.length > 0) {
      const activeUsers = await db.query.users.findMany({
        where: inArray(users.id, userIds),
        columns: { id: true, notificationsPausedUntil: true },
      });
      for (const u of activeUsers) {
        const isPaused = u.notificationsPausedUntil && u.notificationsPausedUntil.getTime() > Date.now();
        if (!isPaused) {
          io.to(`user:${u.id}`).emit("notification:new", mapped);
        }
      }
    }
  } else if (announcement.audienceType === "course" && announcement.audienceId) {
    const courseBatches = await db.query.batches.findMany({
      where: eq(batches.moduleId, announcement.audienceId),
      columns: { id: true, teacherId: true },
    });
    const batchIds = courseBatches.map((b) => b.id);
    const teacherIds = courseBatches.map((b) => b.teacherId).filter(Boolean) as number[];

    if (batchIds.length > 0) {
      const enrollments = await db.query.batchEnrollments.findMany({
        where: and(
          inArray(batchEnrollments.batchId, batchIds),
          eq(batchEnrollments.status, "active")
        ),
      });
      const userIds = Array.from(new Set([...enrollments.map((e) => e.studentId), ...teacherIds]));
      if (userIds.length > 0) {
        const activeUsers = await db.query.users.findMany({
          where: inArray(users.id, userIds),
          columns: { id: true, notificationsPausedUntil: true },
        });
        for (const u of activeUsers) {
          const isPaused = u.notificationsPausedUntil && u.notificationsPausedUntil.getTime() > Date.now();
          if (!isPaused) {
            io.to(`user:${u.id}`).emit("notification:new", mapped);
          }
        }
      }
    }
  }
}

export const notificationRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;
      const now = new Date();

      // 1. Fetch user's dismissed announcement IDs
      const dismissed = await db.query.announcementDismissals.findMany({
        where: eq(announcementDismissals.userId, user.id),
      });
      const dismissedIds = dismissed.map((d) => d.announcementId);

      // 2. Build audience check conditions for announcements
      const audienceOrConditions: any[] = [eq(announcements.audienceType, "all")];

      if (user.role === "student") {
        audienceOrConditions.push(eq(announcements.audienceType, "students"));

        // Fetch student active batches
        const enrollments = await db.query.batchEnrollments.findMany({
          where: and(
            eq(batchEnrollments.studentId, user.id),
            eq(batchEnrollments.status, "active")
          ),
        });
        const batchIds = enrollments.map((e) => e.batchId);
        if (batchIds.length > 0) {
          audienceOrConditions.push(
            and(eq(announcements.audienceType, "batch"), inArray(announcements.audienceId, batchIds))
          );

          // Fetch course (module) IDs for student's batches
          const studentBatches = await db.query.batches.findMany({
            where: inArray(batches.id, batchIds),
          });
          const moduleIds = studentBatches.map((b) => b.moduleId);
          if (moduleIds.length > 0) {
            audienceOrConditions.push(
              and(eq(announcements.audienceType, "course"), inArray(announcements.audienceId, moduleIds))
            );
          }
        }
      } else if (user.role === "teacher") {
        audienceOrConditions.push(eq(announcements.audienceType, "teachers"));

        // Fetch batches taught by this teacher
        const teacherBatches = await db.query.batches.findMany({
          where: eq(batches.teacherId, user.id),
        });
        const batchIds = teacherBatches.map((b) => b.id);
        const moduleIds = teacherBatches.map((b) => b.moduleId);
        if (batchIds.length > 0) {
          audienceOrConditions.push(
            and(eq(announcements.audienceType, "batch"), inArray(announcements.audienceId, batchIds))
          );
        }
        if (moduleIds.length > 0) {
          audienceOrConditions.push(
            and(eq(announcements.audienceType, "course"), inArray(announcements.audienceId, moduleIds))
          );
        }
      }

      // Fetch active targeted announcements
      const announcementConditions: any[] = [
        or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now)),
        or(...audienceOrConditions),
      ];

      if (dismissedIds.length > 0) {
        announcementConditions.push(
          sql`${announcements.id} NOT IN (${sql.join(dismissedIds, sql`, `)})`
        );
      }

      const eligibleAnnouncements = await db.query.announcements.findMany({
        where: and(...announcementConditions),
        orderBy: desc(announcements.createdAt),
      });

      // Filter announcements by cursor if provided
      const cursorDate = input.cursor ? new Date(input.cursor) : null;
      let filteredAnnouncements = eligibleAnnouncements;
      if (cursorDate) {
        filteredAnnouncements = eligibleAnnouncements.filter(
          (a) => a.createdAt < cursorDate
        );
      }

      // 3. Fetch personal notifications for the user
      const notificationConditions: any[] = [eq(notifications.userId, user.id)];
      if (cursorDate) {
        notificationConditions.push(lt(notifications.createdAt, cursorDate));
      }

      const limit = input.limit;
      const personalNotifications = await db.query.notifications.findMany({
        where: and(...notificationConditions),
        orderBy: desc(notifications.createdAt),
        limit: limit + 50, // Fetch extra records for a robust merge
      });

      // 4. Map announcements to notification structure
      const mappedAnnouncements = filteredAnnouncements.map((a) => ({
        id: `announcement-${a.id}`,
        realId: a.id,
        title: a.title,
        message: a.description,
        type: "announcement",
        isRead: false,
        data: {
          audienceType: a.audienceType,
          audienceId: a.audienceId,
          expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
        },
        createdAt: a.createdAt,
      }));

      // 5. Merge, sort, and slice
      const merged = [...mappedAnnouncements, ...personalNotifications].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      const paginatedItems = merged.slice(0, limit);
      let nextCursor: string | undefined = undefined;

      if (merged.length > limit) {
        const lastItem = paginatedItems[paginatedItems.length - 1];
        nextCursor = lastItem.createdAt.toISOString();
      }

      return {
        items: paginatedItems.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
        nextCursor,
      };
    }),

  markRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  markAllRead: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, ctx.user.id));
    return { success: true };
  }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  dismissAnnouncement: authedQuery
    .input(z.object({ announcementId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.insert(announcementDismissals).values({
        announcementId: input.announcementId,
        userId: ctx.user.id,
      });
      return { success: true };
    }),

  createAnnouncement: authedQuery
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        audienceType: z.enum(["all", "students", "teachers", "batch", "course"]),
        audienceId: z.number().optional(),
        expiresAt: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators can create announcements.",
        });
      }

      const db = getDb();
      const [announcement] = await db
        .insert(announcements)
        .values({
          title: input.title,
          description: input.description,
          audienceType: input.audienceType,
          audienceId: input.audienceId ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning();

      if (!announcement) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create announcement.",
        });
      }

      // Broadcast in real-time
      await broadcastAnnouncement(announcement);

      return announcement;
    }),
});
