import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, classes } from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("Teacher Communication Integration Tests", () => {
  const testTeacherUnionId = "T8888";
  const testTeacherPhone = "8888800001";
  const testTeacherUsername = "test_teacher_comm";

  const testStudentUnionId = "S8888";
  const testStudentPhone = "8888800002";
  const testStudentUsername = "test_student_comm";

  let teacherId: number;
  let studentId: number;
  let moduleId: number;
  let batchId: number;
  let classId: number;

  const cleanup = async () => {
    const db = getDb();

    if (studentId) {
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId));
      await db.delete(users).where(eq(users.id, studentId));
    }
    if (teacherId) {
      await db.delete(classes).where(eq(classes.teacherId, teacherId));
      await db.delete(batches).where(eq(batches.teacherId, teacherId));
      await db.delete(users).where(eq(users.id, teacherId));
    }
    if (moduleId) {
      await db.delete(modules).where(eq(modules.id, moduleId));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create teacher
    const teacherResult = await db.insert(users).values({
      unionId: testTeacherUnionId,
      name: "Comm Test Teacher",
      username: testTeacherUsername,
      phone: testTeacherPhone,
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId = teacherResult[0].id;

    // 2. Create student
    const studentResult = await db.insert(users).values({
      unionId: testStudentUnionId,
      name: "Comm Test Student",
      username: testStudentUsername,
      phone: testStudentPhone,
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = studentResult[0].id;

    // 3. Create module
    const moduleResult = await db.insert(modules).values({
      name: "Comm Test Module",
    }).returning({ id: modules.id });
    moduleId = moduleResult[0].id;

    // 4. Create batch assigned to teacher
    const batchResult = await db.insert(batches).values({
      moduleId,
      name: "Comm Test Batch",
      teacherId,
    }).returning({ id: batches.id });
    batchId = batchResult[0].id;

    // 5. Enroll student
    await db.insert(batchEnrollments).values({
      batchId,
      studentId,
      status: "active",
    });

    // 6. Create class held by teacher
    const classResult = await db.insert(classes).values({
      batchId,
      teacherId,
      title: "Comm Test Class",
      scheduledAt: new Date(),
      status: "completed",
    }).returning({ id: classes.id });
    classId = classResult[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should return assigned batches for the teacher in myBatches query", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Teacher", sessionToken: "" },
    });

    const result = await caller.user.myBatches();
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].batchId).toBe(batchId);
    expect(result[0].batch?.name).toBe("Comm Test Batch");
  });

  it("should allow the teacher to view students enrolled in the batch", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Teacher", sessionToken: "" },
    });

    const result = await caller.learning.listBatchStudents({ batchId });
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(studentId);
    expect(result[0].name).toBe("Comm Test Student");
  });

  it("should return correct teacher statistics including classes and student count", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Teacher", sessionToken: "" },
    });

    const result = await caller.user.getTeacherStats();
    expect(result).toBeDefined();
    expect(result.classesCount).toBe(1);
    expect(result.studentCount).toBe(1);
  });
});
