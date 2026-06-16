import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, profiles, payments, classes, notifications, classJoinRequests } from "../../db/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { processFeesAndRestrictions } from "../../server/lib/scheduler";

describe("Fees & Payment Management Integration Tests", () => {
  const testStudentUnionId = "STUFEE888";
  const testStudentPhone = "8888877777";
  const testStudentUsername = "test_student_fee_mgmt";
  const testTeacherUnionId = "TEACHER888";

  let studentId: number;
  let teacherId: number;
  let moduleId: number;
  let batchId: number;
  let classId: number;

  const cleanup = async () => {
    const db = getDb();

    // Clean up notifications, payments, profiles, enrollments, user
    if (studentId) {
      await db.delete(notifications).where(eq(notifications.userId, studentId));
      await db.delete(payments).where(eq(payments.studentId, studentId));
      await db.delete(profiles).where(eq(profiles.userId, studentId));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId));
      await db.delete(classJoinRequests).where(eq(classJoinRequests.studentId, studentId));
      await db.delete(users).where(eq(users.id, studentId));
    } else {
      await db.delete(users).where(eq(users.unionId, testStudentUnionId));
    }

    if (teacherId) {
      await db.delete(users).where(eq(users.id, teacherId));
    } else {
      await db.delete(users).where(eq(users.unionId, testTeacherUnionId));
    }

    // Clean up class, batch, module
    if (classId) {
      await db.delete(classes).where(eq(classes.id, classId));
    }
    if (batchId) {
      await db.delete(batches).where(eq(batches.id, batchId));
    }
    if (moduleId) {
      await db.delete(modules).where(eq(modules.id, moduleId));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create a test teacher user
    const teacherResult = await db.insert(users).values({
      unionId: testTeacherUnionId,
      name: "Fee Test Teacher",
      username: "test_teacher_fee",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId = teacherResult[0].id;

    // 2. Create a test student user
    const studentResult = await db.insert(users).values({
      unionId: testStudentUnionId,
      name: "Fee Test Student",
      username: testStudentUsername,
      phone: testStudentPhone,
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = studentResult[0].id;

    // 3. Create module and batch
    const moduleResult = await db.insert(modules).values({
      name: "Fee Management Test Course",
      maxStudents: 10,
      minStudents: 2,
    }).returning({ id: modules.id });
    moduleId = moduleResult[0].id;

    const batchResult = await db.insert(batches).values({
      moduleId,
      name: "Fee Test Batch",
      timeSlot: "10:00 AM",
      maxStudents: 5,
      courseFee: "5000.00",
      teacherId,
    }).returning({ id: batches.id });
    batchId = batchResult[0].id;

    // 4. Enroll student in the batch
    await db.insert(batchEnrollments).values({
      batchId,
      studentId,
      status: "active",
    });

    // 5. Create class for that batch
    const classResult = await db.insert(classes).values({
      batchId,
      title: "Fee Management Test Class",
      status: "ongoing",
      meetingUrl: "https://meet.jit.si/test-fee-meeting-room-xyz",
      recordingUrl: "https://retention.emtees.io/recordings/test.mp4",
      meetingRoomId: "test-fee-meeting-room-xyz",
      duration: 60,
      teacherId,
      scheduledAt: new Date(),
    }).returning({ id: classes.id });
    classId = classResult[0].id;

    // Create an approved join request for the student
    await db.insert(classJoinRequests).values({
      classId,
      studentId,
      status: "approved",
    });

    // 5. Create student profile with fees (Total: 5000, Paid: 0, Balance: 5000, Min Initial: 2000)
    // Initially set paymentDueDate to 2 days in the future, gracePeriodDays to 3 days
    const futureDueDate = new Date();
    futureDueDate.setDate(futureDueDate.getDate() + 2);

    await db.insert(profiles).values({
      userId: studentId,
      course: "Fee Management Test Course",
      batch: "Fee Test Batch",
      feesTotal: "5000.00",
      feesPaid: "0.00",
      feesBalance: "5000.00",
      paymentStatus: "unpaid",
      paymentDueDate: futureDueDate,
      gracePeriodDays: 3,
      minInitialPayment: "2000.00",
      activityTimeline: [],
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should allow student access and show meetings before due date", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Fee Test Student", sessionToken: "" },
    });

    // Run scheduler
    await processFeesAndRestrictions();

    // Verify enrollment status remains active
    const db = getDb();
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.studentId, studentId)
      ),
    });
    expect(enrollment?.status).toBe("active");

    // Call class list and check that meeting urls are visible
    const listResult = await caller.class.list();
    const testClass = listResult.find(c => c.id === classId);
    expect(testClass).toBeDefined();
    expect(testClass?.meetingUrl).toBe("https://meet.jit.si/test-fee-meeting-room-xyz");
  });

  it("should enforce minimum initial payment check on student orders", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Fee Test Student", sessionToken: "" },
    });

    // Trying to pay 1000 should fail because minInitialPayment is 2000
    await expect(
      caller.student.createRazorpayOrder({ amount: 1000 })
    ).rejects.toThrow("Minimum initial payment of ₹2000 is required.");

    // Paying 2000 should succeed
    const order = await caller.student.createRazorpayOrder({ amount: 2000 });
    expect(order.orderId).toBeDefined();
    expect(order.amount).toBe(200000); // 2000 * 100
  });

  it("should mark student profile overdue when due date passes but keep access active during grace period", async () => {
    const db = getDb();

    // Update paymentDueDate to 1 day ago (due date passed, but within 3 days grace period)
    const passedDueDate = new Date();
    passedDueDate.setDate(passedDueDate.getDate() - 1);
    await db.update(profiles)
      .set({ paymentDueDate: passedDueDate, paymentStatus: "unpaid" })
      .where(eq(profiles.userId, studentId));

    // Run scheduler
    await processFeesAndRestrictions();

    // Verify profile status becomes overdue
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });
    expect(profile?.paymentStatus).toBe("overdue");

    // Verify enrollment status remains active during grace period
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.studentId, studentId)
      ),
    });
    expect(enrollment?.status).toBe("active");

    // Verify student receives the Payment Overdue notification
    const overdueNotification = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, studentId),
        eq(notifications.type, "fee_overdue")
      ),
    });
    expect(overdueNotification).toBeDefined();
    expect(overdueNotification?.message).toContain("Your payment is overdue");
  });

  it("should restrict enrollment and block/hide class meetings when grace period expires", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Fee Test Student", sessionToken: "" },
    });

    // Update paymentDueDate to 4 days ago (grace period is 3 days, so 4 days past due means grace period has expired)
    const expiredDueDate = new Date();
    expiredDueDate.setDate(expiredDueDate.getDate() - 4);
    await db.update(profiles)
      .set({ paymentDueDate: expiredDueDate })
      .where(eq(profiles.userId, studentId));

    // Run scheduler
    await processFeesAndRestrictions();

    // Verify enrollment status changes to restricted
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.studentId, studentId)
      ),
    });
    expect(enrollment?.status).toBe("restricted");

    // Verify activity timeline log is created for restriction
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });
    const timeline = profile?.activityTimeline as any[];
    expect(timeline).toBeDefined();
    const restrictionLog = timeline.find((log: any) => log.type === "access_restricted");
    expect(restrictionLog).toBeDefined();
    expect(restrictionLog.reason).toBe("Grace period expired on unpaid fees");

    // Verify class list returned for restricted student has meetingUrl and recordingUrl sanitized to null
    const listResult = await caller.class.list();
    const testClass = listResult.find(c => c.id === classId);
    expect(testClass).toBeDefined();
    expect(testClass?.meetingUrl).toBeNull();
    expect(testClass?.recordingUrl).toBeNull();

    // Verify class meeting details throws restriction error
    await expect(
      caller.class.getMeetingDetails({ classId })
    ).rejects.toThrow("Access Restricted Due to Outstanding Fees.");
  });

  it("should automatically restore student access to active upon full payment of outstanding dues", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Fee Test Student", sessionToken: "" },
    });

    // Simulate complete checkout of outstanding balance (₹5000)
    const mockOrderId = "order_mock_fee_checkout";
    const mockPaymentId = "pay_mock_fee_checkout";

    const verifyResult = await caller.student.verifyRazorpayPayment({
      razorpay_payment_id: mockPaymentId,
      razorpay_order_id: mockOrderId,
      razorpay_signature: "mock_signature",
      amount: 5000.00,
    });

    expect(verifyResult.success).toBe(true);

    // Verify database updates
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });
    expect(profile?.feesPaid).toBe("5000.00");
    expect(profile?.feesBalance).toBe("0.00");
    expect(profile?.paymentStatus).toBe("paid");

    // Verify enrollment status is restored to active
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.studentId, studentId)
      ),
    });
    expect(enrollment?.status).toBe("active");

    // Verify activity timeline log is created for restoration
    const timeline = profile?.activityTimeline as any[];
    const restorationLog = timeline.find((log: any) => log.type === "access_restored");
    expect(restorationLog).toBeDefined();
    expect(restorationLog.reason).toBe("Fees fully paid");

    // Verify class details can be requested now
    const meetingDetails = await caller.class.getMeetingDetails({ classId });
    expect(meetingDetails.roomName).toBe("test-fee-meeting-room-xyz");
  });
});
