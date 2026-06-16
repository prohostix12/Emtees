import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, profiles } from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("Batch Enrollment Integration Tests", () => {
  const testStudentUnionId = "S9999";
  const testStudentPhone = "9999900001";
  const testStudentUsername = "test_student_enrollment";
  
  let studentId: number;
  let moduleId: number;
  let batchId: number;

  const cleanup = async () => {
    const db = getDb();
    
    // Delete student and profile
    if (studentId) {
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

    // 1. Create a test student user
    const studentResult = await db.insert(users).values({
      unionId: testStudentUnionId,
      name: "Enrollment Test Student",
      username: testStudentUsername,
      phone: testStudentPhone,
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = studentResult[0].id;

    // 2. Create a test module
    const moduleResult = await db.insert(modules).values({
      name: "Test Module 99",
      description: "Test Module Description",
      maxStudents: 10,
      minStudents: 2,
    }).returning({ id: modules.id });
    moduleId = moduleResult[0].id;

    // 3. Create a test batch under the module
    const batchResult = await db.insert(batches).values({
      moduleId,
      name: "Test Batch 99A",
      timeSlot: "11:00 AM",
      maxStudents: 5,
    }).returning({ id: batches.id });
    batchId = batchResult[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should successfully enroll a student using their alphanumeric unionId S9999", async () => {
    const db = getDb();
    
    // Create TRPC caller as admin
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    // Run the mutation
    const enrollResult = await caller.learning.enrollStudent({
      batchId,
      studentId: testStudentUnionId,
    });

    expect(enrollResult.success).toBe(true);

    // Verify batchEnrollments row was created
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.studentId, studentId),
        eq(batchEnrollments.status, "active")
      ),
    });
    expect(enrollment).toBeDefined();

    // Verify student profile was updated with the batch and course details
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });
    expect(profile).toBeDefined();
    expect(profile?.batch).toBe("Test Batch 99A");
    expect(profile?.batchTime).toBe("11:00 AM");
    expect(profile?.course).toBe("Test Module 99");
  });

  it("should fail to enroll the student if they are already enrolled", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    await expect(
      caller.learning.enrollStudent({
        batchId,
        studentId: testStudentUnionId,
      })
    ).rejects.toThrow("Student already enrolled in this batch");
  });

  it("should successfully remove the student from the batch and update profile", async () => {
    const db = getDb();
    
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    // Run the mutation
    const removeResult = await caller.learning.removeStudent({
      batchId,
      studentId: testStudentUnionId,
    });

    expect(removeResult.success).toBe(true);

    // Verify batchEnrollments row status is now inactive
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.studentId, studentId)
      ),
    });
    expect(enrollment?.status).toBe("inactive");
    expect(enrollment?.leftAt).toBeInstanceOf(Date);

    // Verify student profile batch details are cleared
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });
    expect(profile?.batch).toBeNull();
    expect(profile?.batchTime).toBeNull();
    expect(profile?.course).toBeNull();
  });
});
