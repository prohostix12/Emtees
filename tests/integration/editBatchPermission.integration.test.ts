import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchAuditLogs } from "../../db/schema";
import { eq } from "drizzle-orm";

describe("Batch Edit Permission Integration Tests", () => {
  let superAdminId: number;
  let adminId: number;
  let academicHeadId: number;
  let teacherId1: number;
  let teacherId2: number;
  let studentId: number;
  let moduleId1: number;
  let moduleId2: number;
  let batchId: number;

  const cleanup = async () => {
    const db = getDb();

    if (batchId) {
      await db.delete(batchAuditLogs).where(eq(batchAuditLogs.batchId, batchId));
      await db.delete(batches).where(eq(batches.id, batchId));
    }
    if (moduleId1) {
      await db.delete(modules).where(eq(modules.id, moduleId1));
    }
    if (moduleId2) {
      await db.delete(modules).where(eq(modules.id, moduleId2));
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
    if (teacherId1) {
      await db.delete(users).where(eq(users.id, teacherId1));
    }
    if (teacherId2) {
      await db.delete(users).where(eq(users.id, teacherId2));
    }
    if (studentId) {
      await db.delete(users).where(eq(users.id, studentId));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create users
    const superAdminRes = await db.insert(users).values({
      unionId: "SADM_EDIT_TEST",
      name: "Super Admin User",
      role: "super_admin",
      status: "active",
    }).returning({ id: users.id });
    superAdminId = superAdminRes[0].id;

    const adminRes = await db.insert(users).values({
      unionId: "ADM_EDIT_TEST",
      name: "Admin User",
      role: "admin",
      status: "active",
    }).returning({ id: users.id });
    adminId = adminRes[0].id;

    const headRes = await db.insert(users).values({
      unionId: "HEAD_EDIT_TEST",
      name: "Academic Head User",
      role: "academic_head",
      status: "active",
    }).returning({ id: users.id });
    academicHeadId = headRes[0].id;

    const teacherRes1 = await db.insert(users).values({
      unionId: "TCH1_EDIT_TEST",
      name: "Teacher User 1",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId1 = teacherRes1[0].id;

    const teacherRes2 = await db.insert(users).values({
      unionId: "TCH2_EDIT_TEST",
      name: "Teacher User 2",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId2 = teacherRes2[0].id;

    const studentRes = await db.insert(users).values({
      unionId: "STU_EDIT_TEST",
      name: "Student User",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = studentRes[0].id;

    // 2. Create modules
    const m1 = await db.insert(modules).values({ name: "Module 1" }).returning({ id: modules.id });
    moduleId1 = m1[0].id;

    const m2 = await db.insert(modules).values({ name: "Module 2" }).returning({ id: modules.id });
    moduleId2 = m2[0].id;

    // 3. Create batch
    const b = await db.insert(batches).values({
      moduleId: moduleId1,
      name: "Original Batch Name",
      description: "Original Description",
      timeSlot: "10:00 AM",
      teacherId: teacherId1,
      maxStudents: 20,
      status: "active",
    }).returning({ id: batches.id });
    batchId = b[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should allow Super Admin to successfully update batch details and generate correct audit logs", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin User", sessionToken: "" },
    });

    const result = await caller.learning.updateBatch({
      id: batchId,
      name: "Updated Batch Name",
      description: "Updated Description",
      timeSlot: "11:00 AM",
      teacherId: teacherId2,
      maxStudents: 30,
      status: "inactive",
      moduleId: moduleId2,
    });

    expect(result).toBeDefined();
    expect(result?.name).toBe("Updated Batch Name");
    expect(result?.description).toBe("Updated Description");
    expect(result?.timeSlot).toBe("11:00 AM");
    expect(result?.maxStudents).toBe(30);
    expect(result?.status).toBe("inactive");
    expect(result?.moduleId).toBe(moduleId2);
    expect(result?.teacherId).toBe(teacherId2);

    // Verify Audit Logs
    const logs = await db.query.batchAuditLogs.findMany({
      where: eq(batchAuditLogs.batchId, batchId),
    });

    // We changed: name, description, timeSlot, teacher, maxStudents, status, course (7 fields)
    expect(logs.length).toBe(7);

    const nameLog = logs.find(l => l.fieldName === "name");
    expect(nameLog).toBeDefined();
    expect(nameLog?.previousValue).toBe("Original Batch Name");
    expect(nameLog?.newValue).toBe("Updated Batch Name");
    expect(nameLog?.changedBy).toBe(superAdminId);

    const descLog = logs.find(l => l.fieldName === "description");
    expect(descLog).toBeDefined();
    expect(descLog?.previousValue).toBe("Original Description");
    expect(descLog?.newValue).toBe("Updated Description");

    const teacherLog = logs.find(l => l.fieldName === "teacher");
    expect(teacherLog).toBeDefined();
    expect(teacherLog?.previousValue).toContain("Teacher User 1");
    expect(teacherLog?.newValue).toContain("Teacher User 2");

    const courseLog = logs.find(l => l.fieldName === "course");
    expect(courseLog).toBeDefined();
    expect(courseLog?.previousValue).toContain("Module 1");
    expect(courseLog?.newValue).toContain("Module 2");
  });

  it("should block Admin, Academic Head, Teacher, Student from editing batches", async () => {
    const rolesToTest = [
      { id: adminId, role: "admin", name: "Admin User" },
      { id: academicHeadId, role: "academic_head", name: "Academic Head User" },
      { id: teacherId1, role: "teacher", name: "Teacher User 1" },
      { id: studentId, role: "student", name: "Student User" },
    ];

    for (const u of rolesToTest) {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: u.id, role: u.role, name: u.name, sessionToken: "" },
      });

      if (u.role === "admin" || u.role === "academic_head") {
        await expect(
          caller.learning.updateBatch({
            id: batchId,
            name: "Hacker Batch Name",
          })
        ).rejects.toThrow("Access Denied");
      } else {
        await expect(
          caller.learning.updateBatch({
            id: batchId,
            name: "Hacker Batch Name",
          })
        ).rejects.toThrow("Admin access required");
      }
    }
  });

  it("should block Admin from deleting batches and allow only Super Admin", async () => {
    const callerAdmin = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "Admin User", sessionToken: "" },
    });

    await expect(
      callerAdmin.learning.deleteBatch({
        batchId,
      })
    ).rejects.toThrow("Access Denied");
  });
});
