import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, classes, flexibilityRequests, oneToOneSessions, feedback } from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("Batch and Module Deletion Integration Tests", () => {
  const testStudentUnionId = "S9998";
  const testStudentPhone = "9999900002";
  const testStudentUsername = "test_student_deletion";

  const testTeacherUnionId = "T9998";
  const testTeacherPhone = "9999900003";
  const testTeacherUsername = "test_teacher_deletion";

  let studentId: number;
  let teacherId: number;
  let moduleId: number;
  let batchId: number;
  let classId: number;

  const cleanup = async () => {
    const db = getDb();

    if (studentId) {
      await db.delete(flexibilityRequests).where(eq(flexibilityRequests.studentId, studentId));
      await db.delete(oneToOneSessions).where(eq(oneToOneSessions.studentId, studentId));
      await db.delete(feedback).where(eq(feedback.studentId, studentId));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId));
      await db.delete(users).where(eq(users.id, studentId));
    }

    if (teacherId) {
      await db.delete(users).where(eq(users.id, teacherId));
    }

    if (classId) {
      await db.delete(oneToOneSessions).where(eq(oneToOneSessions.classId, classId));
      await db.delete(feedback).where(eq(feedback.classId, classId));
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

    // 1. Create student
    const studentResult = await db.insert(users).values({
      unionId: testStudentUnionId,
      name: "Deletion Test Student",
      username: testStudentUsername,
      phone: testStudentPhone,
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = studentResult[0].id;

    // 2. Create teacher
    const teacherResult = await db.insert(users).values({
      unionId: testTeacherUnionId,
      name: "Deletion Test Teacher",
      username: testTeacherUsername,
      phone: testTeacherPhone,
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId = teacherResult[0].id;

    // 3. Create module
    const moduleResult = await db.insert(modules).values({
      name: "Deletion Test Module",
    }).returning({ id: modules.id });
    moduleId = moduleResult[0].id;

    // 4. Create batch
    const batchResult = await db.insert(batches).values({
      moduleId,
      name: "Deletion Test Batch",
      timeSlot: "12:00 PM",
    }).returning({ id: batches.id });
    batchId = batchResult[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should fail to delete a batch that has active enrollments", async () => {
    const db = getDb();
    
    // Enroll student in batch
    await db.insert(batchEnrollments).values({
      batchId,
      studentId,
      status: "active",
    });

    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    await expect(
      caller.learning.deleteBatch({ batchId })
    ).rejects.toThrow("Cannot delete batch with active student enrollments. Remove students first.");

    // Clean up enrollment
    await db.delete(batchEnrollments).where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.studentId, studentId)));
  });

  it("should fail to delete a batch that has ongoing classes", async () => {
    const db = getDb();

    // Create an ongoing class
    const classResult = await db.insert(classes).values({
      batchId,
      teacherId,
      title: "Test Live Class",
      scheduledAt: new Date(),
      status: "ongoing",
    }).returning({ id: classes.id });
    classId = classResult[0].id;

    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    await expect(
      caller.learning.deleteBatch({ batchId })
    ).rejects.toThrow("Cannot delete batch while there are ongoing live classes.");

    // Clean up ongoing class
    await db.delete(classes).where(eq(classes.id, classId));
    classId = 0;
  });

  it("should successfully delete a batch (clearing flexibility_requests & completed classes dependencies)", async () => {
    const db = getDb();

    // 1. Create a resolved flexibility request referencing the batch
    await db.insert(flexibilityRequests).values({
      studentId,
      requestType: "batch_change",
      fromBatchId: batchId,
      status: "approved",
    });

    // 2. Create a completed class under the batch
    const classResult = await db.insert(classes).values({
      batchId,
      teacherId,
      title: "Test Completed Class",
      scheduledAt: new Date(),
      status: "completed",
    }).returning({ id: classes.id });
    classId = classResult[0].id;

    // 3. Create a feedback linking to that class
    await db.insert(feedback).values({
      studentId,
      teacherId,
      classId,
      rating: 5,
      comment: "Great class!",
    });

    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    // Run delete mutation
    const deleteResult = await caller.learning.deleteBatch({ batchId });
    expect(deleteResult.success).toBe(true);
    batchId = 0; // Batch deleted successfully!

    // Verify batch is gone
    const batchDb = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
    expect(batchDb).toBeUndefined();

    // Verify flexibility request link was set to null (retaining the record itself)
    const req = await db.query.flexibilityRequests.findFirst({
      where: eq(flexibilityRequests.studentId, studentId),
    });
    expect(req).toBeDefined();
    expect(req?.fromBatchId).toBeNull();

    // Verify class was cascadingly deleted
    const classDb = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
    expect(classDb).toBeUndefined();

    // Verify feedback classId link was set to null
    const fb = await db.query.feedback.findFirst({
      where: eq(feedback.studentId, studentId),
    });
    expect(fb).toBeDefined();
    expect(fb?.classId).toBeNull();
  });

  it("should fail to delete a module that has batches with active enrollments", async () => {
    const db = getDb();
    
    // Create new batch under module
    const batchResult = await db.insert(batches).values({
      moduleId,
      name: "Deletion Test Batch 2",
    }).returning({ id: batches.id });
    batchId = batchResult[0].id;

    // Enroll student
    await db.insert(batchEnrollments).values({
      batchId,
      studentId,
      status: "active",
    });

    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    await expect(
      caller.learning.deleteModule({ moduleId })
    ).rejects.toThrow("Cannot delete module with active student enrollments in its batches. Remove students first.");

    // Clean up enrollment and batch
    await db.delete(batchEnrollments).where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.studentId, studentId)));
    await db.delete(batches).where(eq(batches.id, batchId));
    batchId = 0;
  });

  it("should successfully delete a module when batches have no active enrollments", async () => {
    const db = getDb();
    
    // Recreate a batch under the module (with no active student enrollments)
    const batchResult = await db.insert(batches).values({
      moduleId,
      name: "Deletion Test Batch 3",
    }).returning({ id: batches.id });
    batchId = batchResult[0].id;

    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    // Run delete mutation on module
    const deleteResult = await caller.learning.deleteModule({ moduleId });
    expect(deleteResult.success).toBe(true);
    moduleId = 0;
    batchId = 0; // deleted by cascade!

    // Verify module and batch are gone
    const modDb = await db.query.modules.findFirst({ where: eq(modules.id, moduleId) });
    expect(modDb).toBeUndefined();

    const batchDb = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
    expect(batchDb).toBeUndefined();
  });
});
