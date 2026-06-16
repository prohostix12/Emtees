import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, profiles, notifications } from "../../db/schema";
import { eq } from "drizzle-orm";

describe("Add User Enhancements Integration Tests", () => {
  let activeModuleId: number;
  let inactiveModuleId: number;
  let activeBatchId: number;
  let inactiveBatchId: number;
  
  let createdUserIds: number[] = [];

  const cleanup = async () => {
    const db = getDb();
    
    // Clean profiles, enrollments, and users created in tests
    if (createdUserIds.length > 0) {
      for (const uid of createdUserIds) {
        await db.delete(profiles).where(eq(profiles.userId, uid));
        await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, uid));
        await db.delete(users).where(eq(users.id, uid));
      }
      createdUserIds = [];
    }

    if (activeBatchId) {
      await db.delete(batchEnrollments).where(eq(batchEnrollments.batchId, activeBatchId));
      await db.delete(batches).where(eq(batches.id, activeBatchId));
    }
    if (inactiveBatchId) {
      await db.delete(batches).where(eq(batches.id, inactiveBatchId));
    }
    if (activeModuleId) {
      await db.delete(modules).where(eq(modules.id, activeModuleId));
    }
    if (inactiveModuleId) {
      await db.delete(modules).where(eq(modules.id, inactiveModuleId));
    }

    // Clean up test notifications
    await db.delete(notifications).where(eq(notifications.type, "capacity_alert"));
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create active module
    const am = await db.insert(modules).values({
      name: "Active Test Course",
      status: "active",
    }).returning({ id: modules.id });
    activeModuleId = am[0].id;

    // 2. Create inactive module
    const im = await db.insert(modules).values({
      name: "Inactive Test Course",
      status: "inactive",
    }).returning({ id: modules.id });
    inactiveModuleId = im[0].id;

    // 3. Create active batch under active module (max capacity = 1)
    const ab = await db.insert(batches).values({
      moduleId: activeModuleId,
      name: "Active Test Batch",
      status: "active",
      maxStudents: 1,
      courseFee: "12500.00",
    }).returning({ id: batches.id });
    activeBatchId = ab[0].id;

    // 4. Create inactive batch under active module
    const ib = await db.insert(batches).values({
      moduleId: activeModuleId,
      name: "Inactive Test Batch",
      status: "inactive",
      maxStudents: 10,
    }).returning({ id: batches.id });
    inactiveBatchId = ib[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should fail when a non-admin (academic_head) attempts to create a user", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 2, role: "academic_head", name: "Academic Head", sessionToken: "" },
    });

    await expect(
      caller.user.create({
        name: "Test Student AH",
        phone: "9111122222",
        username: "test_student_ah",
        password: "password123",
        role: "student",
        courseId: activeModuleId,
        batchId: activeBatchId,
      })
    ).rejects.toThrow("Only administrators are allowed to create users.");
  });

  it("should fail validation if student is missing courseId or batchId", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    await expect(
      caller.user.create({
        name: "Invalid Student 1",
        phone: "9111133333",
        username: "invalid_student_1",
        password: "password123",
        role: "student",
      })
    ).rejects.toThrow("Course and batch are required for student registration.");
  });

  it("should fail validation if selected course is inactive", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    await expect(
      caller.user.create({
        name: "Invalid Student 2",
        phone: "9111144444",
        username: "invalid_student_2",
        password: "password123",
        role: "student",
        courseId: inactiveModuleId,
        batchId: activeBatchId,
      })
    ).rejects.toThrow("Selected course is invalid or inactive.");
  });

  it("should fail validation if selected batch is inactive", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    await expect(
      caller.user.create({
        name: "Invalid Student 3",
        phone: "9111155555",
        username: "invalid_student_3",
        password: "password123",
        role: "student",
        courseId: activeModuleId,
        batchId: inactiveBatchId,
      })
    ).rejects.toThrow("Selected batch is invalid, inactive, or does not belong to the selected course.");
  });

  it("should successfully create student, create profile, create active enrollment, and default course fee", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    const user = await caller.user.create({
      name: "Valid Student 1",
      phone: "9999911111",
      username: "valid_student_1",
      password: "password123",
      role: "student",
      courseId: activeModuleId,
      batchId: activeBatchId,
    });

    expect(user).toBeDefined();
    expect(user.id).toBeGreaterThan(0);
    createdUserIds.push(user.id);

    // Verify profile exists with correct values
    const db = getDb();
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, user.id),
    });
    expect(profile).toBeDefined();
    expect(profile?.course).toBe("Active Test Course");
    expect(profile?.batch).toBe("Active Test Batch");
    expect(parseFloat(profile?.feesTotal ?? "0")).toBe(12500);

    // Verify active batch enrollment exists
    const enrollment = await db.query.batchEnrollments.findFirst({
      where: eq(batchEnrollments.studentId, user.id),
    });
    expect(enrollment).toBeDefined();
    expect(enrollment?.batchId).toBe(activeBatchId);
    expect(enrollment?.status).toBe("active");
  });

  it("should trigger overcrowding alert if enrolling exceeds maxStudents", async () => {
    const db = getDb();
    
    // Clear notifications first
    await db.delete(notifications).where(eq(notifications.type, "capacity_alert"));

    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    // Create a second student in the same batch (maxStudents = 1, we already created 1 in the previous test)
    const user = await caller.user.create({
      name: "Valid Student 2",
      phone: "9999922222",
      username: "valid_student_2",
      password: "password123",
      role: "student",
      courseId: activeModuleId,
      batchId: activeBatchId,
    });

    expect(user).toBeDefined();
    createdUserIds.push(user.id);

    // Check if overcrowding notification was created
    const overcrowdingNotifs = await db.query.notifications.findMany({
      where: eq(notifications.type, "capacity_alert"),
    });

    expect(overcrowdingNotifs.length).toBeGreaterThan(0);
    expect(overcrowdingNotifs[0].title).toBe("Batch Overcrowded");
    expect(overcrowdingNotifs[0].message).toContain("Active Test Batch");
  });
});
