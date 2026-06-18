import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { violations, users } from "@db/schema";
import { sendNotification } from "../lib/notificationEngine";

export const disciplineRouter = createRouter({
  // List records based on role
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const role = ctx.user.role;

    if (["super_admin", "admin", "academic_head"].includes(role)) {
      return db.query.violations.findMany({
        orderBy: desc(violations.createdAt),
        with: {
          user: {
            columns: { name: true, unionId: true },
          },
          reporter: {
            columns: { name: true },
          },
        },
      });
    }

    if (role === "teacher") {
      return db.query.violations.findMany({
        where: eq(violations.reportedBy, ctx.user.id),
        orderBy: desc(violations.createdAt),
        with: {
          user: {
            columns: { name: true, unionId: true },
          },
          reporter: {
            columns: { name: true },
          },
        },
      });
    }

    // Student role
    return db.query.violations.findMany({
      where: eq(violations.userId, ctx.user.id),
      orderBy: desc(violations.createdAt),
      with: {
        user: {
          columns: { name: true, unionId: true },
        },
        reporter: {
          columns: { name: true },
        },
      },
    });
  }),

  // Create a disciplinary record
  create: teacherQuery
    .input(
      z.object({
        userId: z.number(),
        batch: z.string().min(1),
        level: z.enum(["Warning", "Final Warning", "Suspension"]),
        reason: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const [record] = await db
        .insert(violations)
        .values({
          userId: input.userId,
          batch: input.batch,
          level: input.level,
          reason: input.reason,
          description: input.description,
          reportedBy: ctx.user.id,
          // Set old fields for compatibility
          type: input.level,
          action: input.reason,
          status: "active",
        })
        .returning();

      // Trigger student notification
      await sendNotification(
        input.userId,
        `Discipline Action: ${input.level}`,
        `Reason: ${input.reason}. Details: ${input.description}`,
        "discipline_warning",
        { id: record.id, level: input.level }
      );

      return record;
    }),

  // Update a disciplinary record (Admins only)
  update: adminQuery
    .input(
      z.object({
        id: z.number(),
        userId: z.number(),
        batch: z.string().min(1),
        level: z.enum(["Warning", "Final Warning", "Suspension"]),
        reason: z.string().min(1),
        description: z.string().min(1),
        status: z.enum(["active", "resolved"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const updatedFields: any = {
        userId: input.userId,
        batch: input.batch,
        level: input.level,
        reason: input.reason,
        description: input.description,
        status: input.status,
        type: input.level,
        action: input.reason,
      };

      if (input.status === "resolved") {
        updatedFields.resolvedAt = new Date();
      } else {
        updatedFields.resolvedAt = null;
      }

      const [record] = await db
        .update(violations)
        .set(updatedFields)
        .where(eq(violations.id, input.id))
        .returning();

      return record;
    }),

  // Resolve a disciplinary record (Admins only)
  resolve: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [record] = await db
        .update(violations)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
        })
        .where(eq(violations.id, input.id))
        .returning();

      return record;
    }),

  // Get summary stats cards based on role permissions
  getStats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const role = ctx.user.role;

    let condition = sql`1=1`;

    if (!["super_admin", "admin", "academic_head"].includes(role)) {
      if (role === "teacher") {
        condition = eq(violations.reportedBy, ctx.user.id);
      } else {
        // Student role
        condition = eq(violations.userId, ctx.user.id);
      }
    }

    const statsQuery = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${violations.status} = 'active' then 1 else 0 end)`,
        warnings: sql<number>`sum(case when ${violations.level} = 'Warning' then 1 else 0 end)`,
        finalWarnings: sql<number>`sum(case when ${violations.level} = 'Final Warning' then 1 else 0 end)`,
        suspensions: sql<number>`sum(case when ${violations.level} = 'Suspension' then 1 else 0 end)`,
      })
      .from(violations)
      .where(condition);

    const stats = statsQuery[0] || { total: 0, active: 0, warnings: 0, finalWarnings: 0, suspensions: 0 };

    return {
      total: Number(stats.total || 0),
      active: Number(stats.active || 0),
      warnings: Number(stats.warnings || 0),
      finalWarnings: Number(stats.finalWarnings || 0),
      suspensions: Number(stats.suspensions || 0),
    };
  }),

  // List all students for creation selection
  listStudents: authedQuery.query(async () => {
    const db = getDb();
    return db.query.users.findMany({
      where: eq(users.role, "student"),
      columns: { id: true, name: true, unionId: true },
      with: {
        profile: {
          columns: { batch: true },
        },
      },
    });
  }),
});
