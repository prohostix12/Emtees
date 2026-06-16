import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchFeeAuditLogs } from "../../db/schema";
import { eq } from "drizzle-orm";

describe("Edit Batch Fee Integration Tests", () => {
  let superAdminId: number;
  let adminId: number;
  let academicHeadId: number;
  let teacherId: number;
  let studentId: number;
  let moduleId: number;
  let batchId: number;

  const cleanup = async () => {
    const db = getDb();

    if (batchId) {
      await db.delete(batchFeeAuditLogs).where(eq(batchFeeAuditLogs.batchId, batchId));
      await db.delete(batches).where(eq(batches.id, batchId));
    }
    if (moduleId) {
      await db.delete(modules).where(eq(modules.id, moduleId));
    }
    if (superAdminId) {
      await db.delete(users).where(eq(users.id, superAdminId));
    }
    if (adminId) {
      await db.delete(users).where(eq(users.id, adminId));
    }
    if (academicHeadId) {
      await db.delete(users).where(eq(users.id, academicHeadId));
    }
    if (teacherId) {
      await db.delete(users).where(eq(users.id, teacherId));
    }
    if (studentId) {
      await db.delete(users).where(eq(users.id, studentId));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create users with different roles
    const superAdminRes = await db.insert(users).values({
      unionId: "SADM_FEE_TEST",
      name: "Fee Super Admin",
      role: "super_admin",
      status: "active",
    }).returning({ id: users.id });
    superAdminId = superAdminRes[0].id;

    const adminRes = await db.insert(users).values({
      unionId: "ADM_FEE_TEST",
      name: "Fee Admin",
      role: "admin",
      status: "active",
    }).returning({ id: users.id });
    adminId = adminRes[0].id;

    const headRes = await db.insert(users).values({
      unionId: "HEAD_FEE_TEST",
      name: "Fee Academic Head",
      role: "academic_head",
      status: "active",
    }).returning({ id: users.id });
    academicHeadId = headRes[0].id;

    const teacherRes = await db.insert(users).values({
      unionId: "TCH_FEE_TEST",
      name: "Fee Teacher",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId = teacherRes[0].id;

    const studentRes = await db.insert(users).values({
      unionId: "STU_FEE_TEST",
      name: "Fee Student",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = studentRes[0].id;

    // 2. Create module and batch
    const moduleRes = await db.insert(modules).values({
      name: "Fee Test Module",
    }).returning({ id: modules.id });
    moduleId = moduleRes[0].id;

    const batchRes = await db.insert(batches).values({
      moduleId,
      name: "Fee Test Batch",
      courseFee: "1000.00",
    }).returning({ id: batches.id });
    batchId = batchRes[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should allow Super Admin to successfully update batch fee and create an audit log", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Fee Super Admin", sessionToken: "" },
    });

    const result = await caller.learning.updateBatchFee({
      batchId,
      courseFee: 1500.50,
    });

    expect(result).toBeDefined();
    expect(result?.courseFee).toBe("1500.50");

    // Verify database record for batch
    const batchRecord = await db.query.batches.findFirst({
      where: eq(batches.id, batchId),
    });
    expect(batchRecord?.courseFee).toBe("1500.50");

    // Verify audit log record
    const auditLogs = await db.query.batchFeeAuditLogs.findMany({
      where: eq(batchFeeAuditLogs.batchId, batchId),
    });
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].previousFee).toBe("1000.00");
    expect(auditLogs[0].updatedFee).toBe("1500.50");
    expect(auditLogs[0].adminId).toBe(superAdminId);
    expect(auditLogs[0].changedAt).toBeInstanceOf(Date);
  });

  it("should validate and reject negative or zero fees", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Fee Super Admin", sessionToken: "" },
    });

    await expect(
      caller.learning.updateBatchFee({
        batchId,
        courseFee: -50,
      })
    ).rejects.toThrow("Fee amount must be a positive number.");

    await expect(
      caller.learning.updateBatchFee({
        batchId,
        courseFee: 0,
      })
    ).rejects.toThrow("Fee amount must be a positive number.");
  });

  it("should block Admin from updating batch fee", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "Fee Admin", sessionToken: "" },
    });

    await expect(
      caller.learning.updateBatchFee({
        batchId,
        courseFee: 2000,
      })
    ).rejects.toThrow("Access Denied");
  });

  it("should block Academic Head from updating batch fee", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: academicHeadId, role: "academic_head", name: "Fee Academic Head", sessionToken: "" },
    });

    await expect(
      caller.learning.updateBatchFee({
        batchId,
        courseFee: 2000,
      })
    ).rejects.toThrow("Access Denied");
  });

  it("should block Teacher from updating batch fee", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Fee Teacher", sessionToken: "" },
    });

    await expect(
      caller.learning.updateBatchFee({
        batchId,
        courseFee: 2000,
      })
    ).rejects.toThrow("Admin access required");
  });

  it("should block Student from updating batch fee", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Fee Student", sessionToken: "" },
    });

    await expect(
      caller.learning.updateBatchFee({
        batchId,
        courseFee: 2000,
      })
    ).rejects.toThrow("Admin access required");
  });
});
