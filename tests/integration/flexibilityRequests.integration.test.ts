import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, profiles, flexibilityRequests, notifications } from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("Flexibility Requests Integration Tests", () => {
  let superAdminId: number;
  let studentId: number;
  let moduleId: number;
  let currentBatchId: number;
  let requestedBatchId: number;

  const cleanup = async () => {
    const db = getDb();
    if (studentId) {
      await db.delete(notifications).where(eq(notifications.userId, studentId));
      await db.delete(flexibilityRequests).where(eq(flexibilityRequests.studentId, studentId));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId));
      await db.delete(profiles).where(eq(profiles.userId, studentId));
      await db.delete(users).where(eq(users.id, studentId));
    }
    if (superAdminId) {
      await db.delete(notifications).where(eq(notifications.userId, superAdminId));
      await db.delete(users).where(eq(users.id, superAdminId));
    }
    if (currentBatchId) {
      await db.delete(batches).where(eq(batches.id, currentBatchId));
    }
    if (requestedBatchId) {
      await db.delete(batches).where(eq(batches.id, requestedBatchId));
    }
    if (moduleId) {
      await db.delete(modules).where(eq(modules.id, moduleId));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create super admin
    const superAdminRes = await db.insert(users).values({
      unionId: "SADM_FLEX_TEST",
      name: "Flex Admin",
      role: "super_admin",
      status: "active",
    }).returning({ id: users.id });
    superAdminId = superAdminRes[0].id;

    // 2. Create student
    const studentRes = await db.insert(users).values({
      unionId: "STU_FLEX_TEST",
      name: "Flex Student",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = studentRes[0].id;

    // 3. Create student profile
    await db.insert(profiles).values({
      userId: studentId,
      course: "Flex Course",
      batch: "Flex Batch Current",
      feesTotal: "5000.00",
      feesPaid: "2000.00",
      feesBalance: "3000.00",
      paymentStatus: "partial",
    });

    // 4. Create module
    const moduleRes = await db.insert(modules).values({
      name: "Flex Test Module",
    }).returning({ id: modules.id });
    moduleId = moduleRes[0].id;

    // 5. Create current batch (courseFee: 5000)
    const currentBatchRes = await db.insert(batches).values({
      moduleId,
      name: "Flex Batch Current",
      courseFee: "5000.00",
    }).returning({ id: batches.id });
    currentBatchId = currentBatchRes[0].id;

    // 6. Create requested batch (courseFee: 7000)
    const requestedBatchRes = await db.insert(batches).values({
      moduleId,
      name: "Flex Batch Requested",
      courseFee: "7000.00",
    }).returning({ id: batches.id });
    requestedBatchId = requestedBatchRes[0].id;

    // 7. Enroll student in current batch
    await db.insert(batchEnrollments).values({
      batchId: currentBatchId,
      studentId,
      status: "active",
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should process Batch Change request: create, notify student and admin, and execute auto-actions on approval", async () => {
    const db = getDb();
    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Flex Student", sessionToken: "" },
    });

    // 1. Submit Batch Change Request
    const request = await studentCaller.student.createRequest({
      requestType: "batch_change",
      fromBatchId: currentBatchId,
      toBatchId: requestedBatchId,
      reason: "Scheduling conflict",
    });

    expect(request).toBeDefined();
    expect(request?.status).toBe("pending");
    expect(request?.fromBatchId).toBe(currentBatchId);
    expect(request?.toBatchId).toBe(requestedBatchId);

    // 2. Verify notifications
    const studentNotifs = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, studentId), eq(notifications.type, "flexibility_request_received")),
    });
    expect(studentNotifs.length).toBeGreaterThan(0);

    const adminNotifs = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, superAdminId), eq(notifications.type, "flexibility_request_submitted")),
    });
    expect(adminNotifs.length).toBeGreaterThan(0);

    // 3. Admin list requests: verify fee details are returned
    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Flex Admin", sessionToken: "" },
    });

    const requests = await adminCaller.admin.listRequests({ status: "pending" });
    const pendingReq = requests.find((r) => r.id === request?.id);
    expect(pendingReq).toBeDefined();
    expect(pendingReq?.fromBatchFee).toBe(5000);
    expect(pendingReq?.toBatchFee).toBe(7000);
    expect(pendingReq?.feeDifference).toBe(2000);

    // 4. Admin resolve request: approve
    const resolveResult = await adminCaller.admin.resolveRequest({
      requestId: request!.id,
      status: "approved",
      note: "Approved by Admin",
    });
    expect(resolveResult.success).toBe(true);

    // 5. Verify batch change auto-actions (inactive in old batch, active in new batch)
    const oldEnrollment = await db.query.batchEnrollments.findFirst({
      where: and(eq(batchEnrollments.studentId, studentId), eq(batchEnrollments.batchId, currentBatchId)),
    });
    expect(oldEnrollment?.status).toBe("inactive");
    expect(oldEnrollment?.leftAt).toBeInstanceOf(Date);

    const newEnrollment = await db.query.batchEnrollments.findFirst({
      where: and(eq(batchEnrollments.studentId, studentId), eq(batchEnrollments.batchId, requestedBatchId)),
    });
    expect(newEnrollment?.status).toBe("active");

    // 6. Verify profile update (updated batch details and adjusted fee totals)
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });
    expect(profile?.batch).toBe("Flex Batch Requested");
    expect(profile?.feesTotal).toBe("7000.00"); // 5000 + 2000 difference
    expect(profile?.feesBalance).toBe("5000.00"); // 3000 balance + 2000 difference
  });

  it("should process Batch Removal request: create, notify, and execute auto-actions on approval", async () => {
    const db = getDb();
    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Flex Student", sessionToken: "" },
    });

    // 1. Submit Batch Removal Request
    const request = await studentCaller.student.createRequest({
      requestType: "batch_removal",
      fromBatchId: requestedBatchId, // Student is now enrolled in the requested batch from previous test
      reason: "No longer needed",
    });

    expect(request).toBeDefined();
    expect(request?.status).toBe("pending");

    // 2. Admin resolve request: approve
    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Flex Admin", sessionToken: "" },
    });

    await adminCaller.admin.resolveRequest({
      requestId: request!.id,
      status: "approved",
      note: "Batch removal approved",
    });

    // 3. Verify batch removal auto-actions (inactive enrollment)
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(eq(batchEnrollments.studentId, studentId), eq(batchEnrollments.batchId, requestedBatchId)),
    });
    expect(enrollment?.status).toBe("inactive");

    // 4. Verify profile cleared batch details
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });
    expect(profile?.batch).toBeNull();
    expect(profile?.batchTime).toBeNull();
    expect(profile?.course).toBeNull();
  });

  it("should allow a student to cancel a pending request", async () => {
    const db = getDb();
    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Flex Student", sessionToken: "" },
    });

    // 1. Submit hold request
    const request = await studentCaller.student.createRequest({
      requestType: "hold",
      fromBatchId: currentBatchId,
      reason: "Personal reasons",
    });
    expect(request?.status).toBe("pending");

    // 2. Cancel request
    const cancelResult = await studentCaller.student.cancelRequest({
      requestId: request!.id,
    });
    expect(cancelResult.success).toBe(true);

    // 3. Verify status in database is cancelled
    const updatedRequest = await db.query.flexibilityRequests.findFirst({
      where: eq(flexibilityRequests.id, request!.id),
    });
    expect(updatedRequest?.status).toBe("cancelled");
  });
});
