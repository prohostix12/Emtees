import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, profiles, payments } from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("Razorpay Payments Integration Tests", () => {
  const testStudentUnionId = "STUPAY999";
  const testStudentPhone = "9999988888";
  const testStudentUsername = "test_student_payments";

  let studentId: number;
  let moduleId: number;
  let batchId: number;

  const cleanup = async () => {
    const db = getDb();

    // Delete student payments, profile, batch enrollment, and user record
    if (studentId) {
      await db.delete(payments).where(eq(payments.studentId, studentId));
      await db.delete(profiles).where(eq(profiles.userId, studentId));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId));
      await db.delete(users).where(eq(users.id, studentId));
    } else {
      await db.delete(users).where(eq(users.unionId, testStudentUnionId));
    }

    // Delete batch and module
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

    // 1. Create a test student user (inactive status initially to test reactivation)
    const studentResult = await db.insert(users).values({
      unionId: testStudentUnionId,
      name: "Payment Test Student",
      username: testStudentUsername,
      phone: testStudentPhone,
      role: "student",
      status: "inactive",
    }).returning({ id: users.id });
    studentId = studentResult[0].id;

    // 2. Create profile with fees
    await db.insert(profiles).values({
      userId: studentId,
      course: "Test Course 99",
      feesTotal: "1000.00",
      feesPaid: "200.00",
      feesBalance: "800.00",
      paymentStatus: "partial",
    });

    // 3. Create module and batch
    const moduleResult = await db.insert(modules).values({
      name: "Test Course 99",
      maxStudents: 10,
      minStudents: 2,
    }).returning({ id: modules.id });
    moduleId = moduleResult[0].id;

    const batchResult = await db.insert(batches).values({
      moduleId,
      name: "Test Batch 99B",
      timeSlot: "12:00 PM",
      maxStudents: 5,
    }).returning({ id: batches.id });
    batchId = batchResult[0].id;

    // 4. Enroll student with inactive status (e.g. suspended due to unpaid fees)
    await db.insert(batchEnrollments).values({
      batchId,
      studentId,
      status: "inactive",
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should create a Razorpay order matching the student's pending balance", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Payment Test Student", sessionToken: "" },
    });

    const orderResult = await caller.student.createRazorpayOrder();
    
    expect(orderResult.orderId).toBeDefined();
    expect(orderResult.orderId).toContain("order_");
    expect(orderResult.amount).toBe(80000); // 800.00 * 100 paise
    expect(orderResult.currency).toBe("INR");
    expect(orderResult.keyId).toBeDefined();
  });

  it("should verify payment, update database records, and reactivate enrollments", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Payment Test Student", sessionToken: "" },
    });

    const mockOrderId = "order_mock_123456789";
    const mockPaymentId = "pay_mock_987654321";

    const verifyResult = await caller.student.verifyRazorpayPayment({
      razorpay_payment_id: mockPaymentId,
      razorpay_order_id: mockOrderId,
      razorpay_signature: "mock_signature",
      amount: 800.00,
    });

    expect(verifyResult.success).toBe(true);
    expect(verifyResult.payment.transactionId).toBe(mockPaymentId);
    expect(verifyResult.payment.amount).toBe("800.00");
    expect(verifyResult.payment.student?.unionId).toBe(testStudentUnionId);

    // Verify transaction record was added in payments table
    const paymentRecord = await db.query.payments.findFirst({
      where: eq(payments.transactionId, mockPaymentId),
    });
    expect(paymentRecord).toBeDefined();
    expect(paymentRecord?.amount).toBe("800.00");
    expect(paymentRecord?.status).toBe("paid");

    // Verify profile fees were updated
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });
    expect(profile?.feesPaid).toBe("1000.00");
    expect(profile?.feesBalance).toBe("0.00");
    expect(profile?.paymentStatus).toBe("paid");

    // Verify user status is now active
    const userRecord = await db.query.users.findFirst({
      where: eq(users.id, studentId),
    });
    expect(userRecord?.status).toBe("active");

    // Verify batchEnrollment status is now active
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.studentId, studentId)
      ),
    });
    expect(enrollment?.status).toBe("active");
  });

  it("should fail to create a Razorpay order if the student has no balance left", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Payment Test Student", sessionToken: "" },
    });

    await expect(
      caller.student.createRazorpayOrder()
    ).rejects.toThrow("No pending balance to pay.");
  });
});

describe("Payment Mode Enhancement (Full & Installment Payments) Integration Tests", () => {
  const adminId = 1;
  const testStudent1Phone = "+91 9999911111";
  const testStudent1Username = "test_student_full_payment";

  const testStudent2Phone = "+91 9999922222";
  const testStudent2Username = "test_student_installment";

  const testStudent3Phone = "+91 9999933333";
  const testStudent3Username = "test_student_enroll_inst";

  let courseId: number;
  let batchId: number;
  let student1Id: number;
  let student2Id: number;
  let student3Id: number;

  const cleanup = async () => {
    const db = getDb();

    // Cleanup student 1
    if (student1Id) {
      await db.delete(payments).where(eq(payments.studentId, student1Id));
      await db.delete(profiles).where(eq(profiles.userId, student1Id));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, student1Id));
      await db.delete(users).where(eq(users.id, student1Id));
    } else {
      await db.delete(users).where(eq(users.username, testStudent1Username));
    }

    // Cleanup student 2
    if (student2Id) {
      await db.delete(payments).where(eq(payments.studentId, student2Id));
      await db.delete(profiles).where(eq(profiles.userId, student2Id));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, student2Id));
      await db.delete(users).where(eq(users.id, student2Id));
    } else {
      await db.delete(users).where(eq(users.username, testStudent2Username));
    }

    // Cleanup student 3
    if (student3Id) {
      await db.delete(payments).where(eq(payments.studentId, student3Id));
      await db.delete(profiles).where(eq(profiles.userId, student3Id));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, student3Id));
      await db.delete(users).where(eq(users.id, student3Id));
    } else {
      await db.delete(users).where(eq(users.username, testStudent3Username));
    }

    // Cleanup batch and module
    if (batchId) {
      await db.delete(batches).where(eq(batches.id, batchId));
    }
    if (courseId) {
      await db.delete(modules).where(eq(modules.id, courseId));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // Create a module and batch to use for registration
    const moduleResult = await db.insert(modules).values({
      name: "Enhancement Test Course",
      maxStudents: 20,
      minStudents: 1,
      status: "active",
    }).returning({ id: modules.id });
    courseId = moduleResult[0].id;

    const batchResult = await db.insert(batches).values({
      moduleId: courseId,
      name: "Enhancement Test Batch",
      timeSlot: "10:00 AM",
      maxStudents: 10,
      status: "active",
      courseFee: "5000.00",
    }).returning({ id: batches.id });
    batchId = batchResult[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should support registering a student with Full Payment and paying it fully", async () => {
    const db = getDb();
    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const user1 = await adminCaller.user.create({
      name: "Full Payment Student",
      phone: testStudent1Phone,
      username: testStudent1Username,
      password: "password123",
      role: "student",
      courseId,
      batchId,
      feesTotal: 5000,
      paymentType: "FULL_PAYMENT",
    });

    expect(user1).toBeDefined();
    student1Id = user1!.id;

    // Verify batchEnrollment paymentType
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: eq(batchEnrollments.studentId, student1Id),
    });
    expect(enrollment?.paymentType).toBe("FULL_PAYMENT");

    // Verify single unpaid payment row
    const studentPayments = await db.query.payments.findMany({
      where: eq(payments.studentId, student1Id),
    });
    expect(studentPayments.length).toBe(1);
    expect(studentPayments[0].installmentNumber).toBeNull();
    expect(studentPayments[0].status).toBe("unpaid");
    expect(studentPayments[0].amount).toBe("5000.00");

    // Verify profile is unpaid and paymentDueDate is null
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, student1Id),
    });
    expect(profile?.feesTotal).toBe("5000.00");
    expect(profile?.feesBalance).toBe("5000.00");
    expect(profile?.feesPaid).toBe("0.00");
    expect(profile?.paymentStatus).toBe("unpaid");
    expect(profile?.paymentDueDate).toBeNull();

    // Pay full amount using recordPayment
    await adminCaller.admin.recordPayment({
      paymentId: studentPayments[0].id,
      amount: 5000,
      transactionId: "tx_full_1",
    });

    // Verify payment record status changes to paid
    const updatedPayment = await db.query.payments.findFirst({
      where: eq(payments.id, studentPayments[0].id),
    });
    expect(updatedPayment?.status).toBe("paid");
    expect(updatedPayment?.transactionId).toBe("tx_full_1");

    // Verify profile is updated
    const updatedProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, student1Id),
    });
    expect(updatedProfile?.feesPaid).toBe("5000.00");
    expect(updatedProfile?.feesBalance).toBe("0.00");
    expect(updatedProfile?.paymentStatus).toBe("paid");
    expect(updatedProfile?.paymentDueDate).toBeNull();
  });

  it("should support registering a student with Installment Payment and paying installments step-by-step", async () => {
    const db = getDb();
    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const dueDate1 = "2026-07-01T00:00:00.000Z";
    const dueDate2 = "2026-08-01T00:00:00.000Z";
    const dueDate3 = "2026-09-01T00:00:00.000Z";

    const user2 = await adminCaller.user.create({
      name: "Installment Student",
      phone: testStudent2Phone,
      username: testStudent2Username,
      password: "password123",
      role: "student",
      courseId,
      batchId,
      feesTotal: 5000,
      paymentType: "INSTALLMENT",
      installments: [
        { installmentNumber: 1, amount: 2000, dueDate: dueDate1 },
        { installmentNumber: 2, amount: 2000, dueDate: dueDate2 },
        { installmentNumber: 3, amount: 1000, dueDate: dueDate3 },
      ],
    });

    expect(user2).toBeDefined();
    student2Id = user2!.id;

    // Verify batchEnrollment paymentType
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: eq(batchEnrollments.studentId, student2Id),
    });
    expect(enrollment?.paymentType).toBe("INSTALLMENT");

    // Verify 3 unpaid payment rows are created
    const studentPayments = await db.query.payments.findMany({
      where: eq(payments.studentId, student2Id),
      orderBy: payments.installmentNumber,
    });
    expect(studentPayments.length).toBe(3);
    
    expect(studentPayments[0].installmentNumber).toBe(1);
    expect(studentPayments[0].amount).toBe("2000.00");
    expect(studentPayments[0].status).toBe("unpaid");
    expect(studentPayments[0].dueDate?.toISOString()).toBe(dueDate1);

    expect(studentPayments[1].installmentNumber).toBe(2);
    expect(studentPayments[1].amount).toBe("2000.00");
    expect(studentPayments[1].status).toBe("unpaid");
    expect(studentPayments[1].dueDate?.toISOString()).toBe(dueDate2);

    expect(studentPayments[2].installmentNumber).toBe(3);
    expect(studentPayments[2].amount).toBe("1000.00");
    expect(studentPayments[2].status).toBe("unpaid");
    expect(studentPayments[2].dueDate?.toISOString()).toBe(dueDate3);

    // Verify profile paymentDueDate matches first installment due date
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, student2Id),
    });
    expect(profile?.feesTotal).toBe("5000.00");
    expect(profile?.feesBalance).toBe("5000.00");
    expect(profile?.feesPaid).toBe("0.00");
    expect(profile?.paymentStatus).toBe("unpaid");
    expect(profile?.paymentDueDate?.toISOString()).toBe(dueDate1);

    // Pay installment #1 online via student verifyRazorpayPayment
    const student2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student2Id, role: "student", name: "Installment Student", sessionToken: "" },
    });

    // Verify that the student can fetch their own payments list correctly
    const studentPaymentsList = await student2Caller.student.myPayments();
    expect(studentPaymentsList.length).toBe(3);
    const sortedList = [...studentPaymentsList].sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
    expect(sortedList[0].installmentNumber).toBe(1);
    expect(sortedList[0].studentId).toBe(student2Id);

    const verifyResult1 = await student2Caller.student.verifyRazorpayPayment({
      razorpay_payment_id: "pay_inst1_tx",
      razorpay_order_id: "order_inst1_id",
      razorpay_signature: "mock_signature",
      amount: 2000,
      paymentId: studentPayments[0].id,
    });
    expect(verifyResult1.success).toBe(true);

    // Verify profile is updated and paymentDueDate is updated to installment #2 due date
    const profileAfter1 = await db.query.profiles.findFirst({
      where: eq(profiles.userId, student2Id),
    });
    expect(profileAfter1?.feesPaid).toBe("2000.00");
    expect(profileAfter1?.feesBalance).toBe("3000.00");
    expect(profileAfter1?.paymentStatus).toBe("partial");
    expect(profileAfter1?.paymentDueDate?.toISOString()).toBe(dueDate2);

    // Pay installment #2 via admin recordPayment
    await adminCaller.admin.recordPayment({
      paymentId: studentPayments[1].id,
      amount: 2000,
      transactionId: "tx_inst_2",
    });

    // Verify profile paymentDueDate is updated to installment #3 due date
    const profileAfter2 = await db.query.profiles.findFirst({
      where: eq(profiles.userId, student2Id),
    });
    expect(profileAfter2?.feesPaid).toBe("4000.00");
    expect(profileAfter2?.feesBalance).toBe("1000.00");
    expect(profileAfter2?.paymentStatus).toBe("partial");
    expect(profileAfter2?.paymentDueDate?.toISOString()).toBe(dueDate3);

    // Pay installment #3 via admin recordPayment
    await adminCaller.admin.recordPayment({
      paymentId: studentPayments[2].id,
      amount: 1000,
      transactionId: "tx_inst_3",
    });

    // Verify profile paymentDueDate becomes null when fully paid
    const profileAfter3 = await db.query.profiles.findFirst({
      where: eq(profiles.userId, student2Id),
    });
    expect(profileAfter3?.feesPaid).toBe("5000.00");
    expect(profileAfter3?.feesBalance).toBe("0.00");
    expect(profileAfter3?.paymentStatus).toBe("paid");
    expect(profileAfter3?.paymentDueDate).toBeNull();
  });

  it("should support enrolling an existing student into a batch with Installment Payment", async () => {
    const db = getDb();
    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    // Create temporary module and batch for initial registration
    const tempModule = await db.insert(modules).values({
      name: "Temp Course",
      maxStudents: 5,
      minStudents: 1,
      status: "active",
    }).returning({ id: modules.id });
    
    const tempBatch = await db.insert(batches).values({
      moduleId: tempModule[0].id,
      name: "Temp Batch",
      timeSlot: "11:00 AM",
      maxStudents: 5,
      status: "active",
      courseFee: "1000.00",
    }).returning({ id: batches.id });

    const user3 = await adminCaller.user.create({
      name: "Enrollment Test Student",
      phone: testStudent3Phone,
      username: testStudent3Username,
      password: "password123",
      role: "student",
      courseId: tempModule[0].id,
      batchId: tempBatch[0].id,
      feesTotal: 1000,
      paymentType: "FULL_PAYMENT",
    });

    student3Id = user3!.id;

    // Now call enrollStudent to enroll them in the primary batch with INSTALLMENT payment
    const dueDate1 = "2026-10-01T00:00:00.000Z";
    const dueDate2 = "2026-11-01T00:00:00.000Z";

    await adminCaller.learning.enrollStudent({
      batchId,
      studentId: student3Id,
      paymentType: "INSTALLMENT",
      feesTotal: 4000,
      installments: [
        { installmentNumber: 1, amount: 2000, dueDate: dueDate1 },
        { installmentNumber: 2, amount: 2000, dueDate: dueDate2 },
      ],
    });

    // Verify new enrollment paymentType
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(
        eq(batchEnrollments.studentId, student3Id),
        eq(batchEnrollments.batchId, batchId)
      ),
    });
    expect(enrollment?.paymentType).toBe("INSTALLMENT");

    // Verify payments are created for this new batch
    const studentPayments = await db.query.payments.findMany({
      where: and(
        eq(payments.studentId, student3Id),
        eq(payments.batchId, batchId)
      ),
      orderBy: payments.installmentNumber,
    });
    expect(studentPayments.length).toBe(2);
    expect(studentPayments[0].installmentNumber).toBe(1);
    expect(studentPayments[0].amount).toBe("2000.00");
    expect(studentPayments[1].installmentNumber).toBe(2);
    expect(studentPayments[1].amount).toBe("2000.00");

    // Verify profile is updated with the new course/batch/fees details and paymentDueDate
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, student3Id),
    });
    expect(profile?.batch).toBe("Enhancement Test Batch");
    expect(profile?.course).toBe("Enhancement Test Course");
    expect(profile?.feesTotal).toBe("4000.00");
    expect(profile?.feesBalance).toBe("4000.00");
    expect(profile?.paymentStatus).toBe("unpaid");
    expect(profile?.paymentDueDate?.toISOString()).toBe(dueDate1);

    // Cleanup temp batch/module
    await db.delete(batches).where(eq(batches.id, tempBatch[0].id));
    await db.delete(modules).where(eq(modules.id, tempModule[0].id));
  });
});

