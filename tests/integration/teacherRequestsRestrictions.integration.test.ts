import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, profiles, flexibilityRequests } from "../../db/schema";
import { eq, or, inArray } from "drizzle-orm";

describe("Teacher Requests Restrictions Integration Tests", () => {
  let superAdminId: number;
  let adminId: number;
  let academicHeadId: number;
  let teacherId: number;
  let studentId: number;
  let moduleId: number;
  let batchId: number;
  let targetBatchId: number;

  const cleanup = async () => {
    const db = getDb();
    const userIds = [superAdminId, adminId, academicHeadId, teacherId, studentId].filter(Boolean);
    if (userIds.length > 0) {
      await db.delete(flexibilityRequests).where(inArray(flexibilityRequests.studentId, userIds));
      await db.delete(batchEnrollments).where(inArray(batchEnrollments.studentId, userIds));
      await db.delete(profiles).where(inArray(profiles.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    if (batchId) await db.delete(batches).where(eq(batches.id, batchId));
    if (targetBatchId) await db.delete(batches).where(eq(batches.id, targetBatchId));
    if (moduleId) await db.delete(modules).where(eq(modules.id, moduleId));
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // Create users of various roles
    const uSA = await db.insert(users).values({
      unionId: "SA_REQ_TEST", name: "Req Super Admin", role: "super_admin", status: "active"
    }).returning({ id: users.id });
    superAdminId = uSA[0].id;

    const uA = await db.insert(users).values({
      unionId: "A_REQ_TEST", name: "Req Admin", role: "admin", status: "active"
    }).returning({ id: users.id });
    adminId = uA[0].id;

    const uAH = await db.insert(users).values({
      unionId: "AH_REQ_TEST", name: "Req Academic Head", role: "academic_head", status: "active"
    }).returning({ id: users.id });
    academicHeadId = uAH[0].id;

    const uT = await db.insert(users).values({
      unionId: "T_REQ_TEST", name: "Req Teacher", role: "teacher", status: "active"
    }).returning({ id: users.id });
    teacherId = uT[0].id;

    const uS = await db.insert(users).values({
      unionId: "S_REQ_TEST", name: "Req Student", role: "student", status: "active"
    }).returning({ id: users.id });
    studentId = uS[0].id;

    // Create student profile
    await db.insert(profiles).values({
      userId: studentId,
      course: "Req Test Course",
      batch: "Req Test Batch",
      feesTotal: "1000.00",
      feesPaid: "0.00",
      feesBalance: "1000.00",
    });

    // Create course and batches
    const courseRes = await db.insert(modules).values({ name: "Req Test Course" }).returning({ id: modules.id });
    moduleId = courseRes[0].id;

    const batch1 = await db.insert(batches).values({
      moduleId: moduleId, name: "Req Test Batch 1", courseFee: "1000.00"
    }).returning({ id: batches.id });
    batchId = batch1[0].id;

    const batch2 = await db.insert(batches).values({
      moduleId: moduleId, name: "Req Test Batch 2", courseFee: "1200.00"
    }).returning({ id: batches.id });
    targetBatchId = batch2[0].id;

    // Enroll student in batch 1
    await db.insert(batchEnrollments).values({
      batchId: batchId, studentId: studentId, status: "active"
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should allow Student to submit a request", async () => {
    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Req Student", sessionToken: "" },
    });

    const req = await studentCaller.student.createRequest({
      requestType: "batch_change",
      fromBatchId: batchId,
      toBatchId: targetBatchId,
      reason: "Need batch change",
    });

    expect(req).toBeDefined();
    expect(req?.status).toBe("pending");
  });

  it("should allow Super Admin to list requests and resolve requests", async () => {
    const db = getDb();
    const [reqRecord] = await db.insert(flexibilityRequests).values({
      studentId: studentId,
      requestType: "batch_change",
      fromBatchId: batchId,
      toBatchId: targetBatchId,
      reason: "Testing Super Admin resolution",
      status: "pending",
    }).returning();

    const saCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Req Super Admin", sessionToken: "" },
    });

    const list = await saCaller.admin.listRequests({ status: "pending" });
    expect(list.some(r => r.id === reqRecord.id)).toBe(true);

    const resolveRes = await saCaller.admin.resolveRequest({
      requestId: reqRecord.id,
      status: "approved",
      note: "Super Admin approved",
    });
    expect(resolveRes.success).toBe(true);
  });

  it("should allow Admin to list requests and resolve requests", async () => {
    const db = getDb();
    const [reqRecord] = await db.insert(flexibilityRequests).values({
      studentId: studentId,
      requestType: "batch_change",
      fromBatchId: batchId,
      toBatchId: targetBatchId,
      reason: "Testing Admin resolution",
      status: "pending",
    }).returning();

    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "Req Admin", sessionToken: "" },
    });

    const list = await adminCaller.admin.listRequests({ status: "pending" });
    expect(list.some(r => r.id === reqRecord.id)).toBe(true);

    const resolveRes = await adminCaller.admin.resolveRequest({
      requestId: reqRecord.id,
      status: "rejected",
      note: "Admin rejected",
    });
    expect(resolveRes.success).toBe(true);
  });

  it("should block Academic Head from listing or resolving requests", async () => {
    const db = getDb();
    const [reqRecord] = await db.insert(flexibilityRequests).values({
      studentId: studentId,
      requestType: "batch_change",
      fromBatchId: batchId,
      toBatchId: targetBatchId,
      status: "pending",
    }).returning();

    const headCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: academicHeadId, role: "academic_head", name: "Req Academic Head", sessionToken: "" },
    });

    await expect(
      headCaller.admin.listRequests({ status: "pending" })
    ).rejects.toThrow("Access Denied");

    await expect(
      headCaller.admin.resolveRequest({
        requestId: reqRecord.id,
        status: "approved",
      })
    ).rejects.toThrow("Access Denied");
  });

  it("should block Teacher from listing or resolving requests", async () => {
    const db = getDb();
    const [reqRecord] = await db.insert(flexibilityRequests).values({
      studentId: studentId,
      requestType: "batch_change",
      fromBatchId: batchId,
      toBatchId: targetBatchId,
      status: "pending",
    }).returning();

    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Req Teacher", sessionToken: "" },
    });

    await expect(
      teacherCaller.admin.listRequests({ status: "pending" })
    ).rejects.toThrow("Admin access required"); // Blocked by adminQuery middleware

    await expect(
      teacherCaller.admin.resolveRequest({
        requestId: reqRecord.id,
        status: "approved",
      })
    ).rejects.toThrow("Admin access required");
  });

  it("should block Academic Head and Teacher from enrolling or removing students", async () => {
    const headCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: academicHeadId, role: "academic_head", name: "Req Academic Head", sessionToken: "" },
    });

    await expect(
      headCaller.learning.enrollStudent({ batchId: batchId, studentId: studentId })
    ).rejects.toThrow("Access Denied");

    await expect(
      headCaller.learning.removeStudent({ batchId: batchId, studentId: studentId })
    ).rejects.toThrow("Access Denied");

    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Req Teacher", sessionToken: "" },
    });

    await expect(
      teacherCaller.learning.enrollStudent({ batchId: batchId, studentId: studentId })
    ).rejects.toThrow("Admin access required");

    await expect(
      teacherCaller.learning.removeStudent({ batchId: batchId, studentId: studentId })
    ).rejects.toThrow("Admin access required");
  });
});
