import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, asc, desc, count, sql } from "drizzle-orm";
import { createRouter, publicQuery, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { qualifications, users, profiles, qualificationAuditLogs } from "@db/schema";

export const qualificationsRouter = createRouter({
  // Public / Authed procedure to list active qualifications for dropdowns
  listActive: publicQuery.query(async () => {
    const db = getDb();
    const items = await db.query.qualifications.findMany({
      where: eq(qualifications.isActive, true),
      orderBy: [asc(qualifications.displayOrder), asc(qualifications.name)],
    });
    return items;
  }),

  // Admin procedure to list all qualifications (active & inactive)
  listAll: adminQuery.query(async () => {
    const db = getDb();
    const items = await db.query.qualifications.findMany({
      orderBy: [asc(qualifications.displayOrder), asc(qualifications.name)],
    });
    return items;
  }),

  // Check usage count for a qualification
  getUsage: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const userCountRes = await db.select({ count: count() }).from(users).where(eq(users.qualificationId, input.id));
      const profileCountRes = await db.select({ count: count() }).from(profiles).where(eq(profiles.qualificationId, input.id));
      const userCount = Number(userCountRes[0]?.count || 0);
      const profileCount = Number(profileCountRes[0]?.count || 0);
      return {
        qualificationId: input.id,
        userCount,
        profileCount,
        totalUsage: userCount + profileCount,
      };
    }),

  // Create new qualification
  create: adminQuery
    .input(
      z.object({
        name: z.string().min(1, "Qualification name is required").trim(),
        isActive: z.boolean().default(true),
        displayOrder: z.number().default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const trimmedName = input.name.trim();

      // Case-insensitive duplicate check
      const existing = await db.query.qualifications.findFirst({
        where: sql`LOWER(${qualifications.name}) = LOWER(${trimmedName})`,
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: `Qualification "${trimmedName}" already exists.` });
      }

      const created = await db
        .insert(qualifications)
        .values({
          name: trimmedName,
          isActive: input.isActive,
          displayOrder: input.displayOrder,
          createdBy: ctx.user?.id || null,
        })
        .returning();

      const newQual = created[0];

      // Audit Log
      await db.insert(qualificationAuditLogs).values({
        qualificationId: newQual.id,
        action: "ADDED",
        performedBy: ctx.user?.id || null,
        newValue: JSON.stringify(newQual),
      });

      return newQual;
    }),

  // Update existing qualification
  update: adminQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1, "Qualification name is required").trim(),
        isActive: z.boolean(),
        displayOrder: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const trimmedName = input.name.trim();

      const existing = await db.query.qualifications.findFirst({
        where: eq(qualifications.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Qualification not found." });
      }

      // Check if name is taken by another entry (case-insensitive)
      const nameConflict = await db.query.qualifications.findFirst({
        where: sql`LOWER(${qualifications.name}) = LOWER(${trimmedName}) AND ${qualifications.id} != ${input.id}`,
      });
      if (nameConflict) {
        throw new TRPCError({ code: "CONFLICT", message: `Qualification "${trimmedName}" already exists.` });
      }

      const updated = await db
        .update(qualifications)
        .set({
          name: trimmedName,
          isActive: input.isActive,
          displayOrder: input.displayOrder,
          updatedAt: new Date(),
        })
        .where(eq(qualifications.id, input.id))
        .returning();

      const updatedQual = updated[0];

      // Audit Log
      await db.insert(qualificationAuditLogs).values({
        qualificationId: updatedQual.id,
        action: "UPDATED",
        performedBy: ctx.user?.id || null,
        oldValue: JSON.stringify(existing),
        newValue: JSON.stringify(updatedQual),
      });

      return updatedQual;
    }),

  // Toggle active status
  toggleStatus: adminQuery
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.query.qualifications.findFirst({
        where: eq(qualifications.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Qualification not found." });
      }

      const updated = await db
        .update(qualifications)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(qualifications.id, input.id))
        .returning();

      const updatedQual = updated[0];
      const action = input.isActive ? "ENABLED" : "DISABLED";

      // Audit Log
      await db.insert(qualificationAuditLogs).values({
        qualificationId: updatedQual.id,
        action,
        performedBy: ctx.user?.id || null,
        oldValue: JSON.stringify(existing),
        newValue: JSON.stringify(updatedQual),
      });

      return updatedQual;
    }),

  // Delete qualification with safeguards
  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const existing = await db.query.qualifications.findFirst({
        where: eq(qualifications.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Qualification not found." });
      }

      // Safeguard check: Check how many students are assigned this qualification
      const userCountRes = await db.select({ count: count() }).from(users).where(eq(users.qualificationId, input.id));
      const profileCountRes = await db.select({ count: count() }).from(profiles).where(eq(profiles.qualificationId, input.id));
      const totalUsage = Number(userCountRes[0]?.count || 0) + Number(profileCountRes[0]?.count || 0);

      if (totalUsage > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete qualification "${existing.name}" because it is currently assigned to ${totalUsage} student record(s). Please disable it instead to retain student historical data.`,
        });
      }

      const deleted = await db.delete(qualifications).where(eq(qualifications.id, input.id)).returning();

      // Audit Log
      await db.insert(qualificationAuditLogs).values({
        qualificationId: input.id,
        action: "DELETED",
        performedBy: ctx.user?.id || null,
        oldValue: JSON.stringify(existing),
      });

      return { success: true };
    }),

  // List audit logs for qualifications
  listAuditLogs: adminQuery.query(async () => {
    const db = getDb();
    const logs = await db.query.qualificationAuditLogs.findMany({
      orderBy: [desc(qualificationAuditLogs.createdAt)],
      limit: 100,
    });
    return logs;
  }),
});
