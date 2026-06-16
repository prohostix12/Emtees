import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import {
  users,
  modules,
  batches,
  batchEnrollments,
  classes,
  attendance,
  attendanceAlerts,
  notifications,
  profiles,
  classJoinRequests,
} from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { checkStudentConsecutiveAbsences } from "../../server/lib/scheduler";

describe("Student Attendance Alerts Integration Tests", () => {
  let student1Id: number;
  let student2Id: number;
  let teacher1Id: number;
  let teacher2Id: number;
  let adminId: number;
  let academicHeadId: number;
  let moduleId: number;
  let batch1Id: number;
  let batch2Id: number;
  let classIds: number[] = [];

  const cleanup = async () => {
    const db = getDb();

    // Clean up classes, attendance, alerts, notifications, enrollments, users
    if (classIds.length > 0) {
      await db.delete(classJoinRequests).where(eq(classJoinRequests.studentId, student1Id));
      await db.delete(classJoinRequests).where(eq(classJoinRequests.studentId, student2Id));
      await db.delete(attendance).where(eq(attendance.studentId, student1Id));
      await db.delete(attendance).where(eq(attendance.studentId, student2Id));
      for (const cid of classIds) {
        await db.delete(classes).where(eq(classes.id, cid));
      }
      classIds = [];
    }

    if (student1Id) {
      await db.delete(attendanceAlerts).where(eq(attendanceAlerts.studentId, student1Id));
      await db.delete(notifications).where(eq(notifications.userId, student1Id));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, student1Id));
      await db.delete(profiles).where(eq(profiles.userId, student1Id));
      await db.delete(users).where(eq(users.id, student1Id));
    }
    if (student2Id) {
      await db.delete(attendanceAlerts).where(eq(attendanceAlerts.studentId, student2Id));
      await db.delete(notifications).where(eq(notifications.userId, student2Id));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, student2Id));
      await db.delete(profiles).where(eq(profiles.userId, student2Id));
      await db.delete(users).where(eq(users.id, student2Id));
    }
    if (teacher1Id) {
      await db.delete(notifications).where(eq(notifications.userId, teacher1Id));
      await db.delete(users).where(eq(users.id, teacher1Id));
    }
    if (teacher2Id) {
      await db.delete(notifications).where(eq(notifications.userId, teacher2Id));
      await db.delete(users).where(eq(users.id, teacher2Id));
    }
    if (adminId) {
      await db.delete(notifications).where(eq(notifications.userId, adminId));
      await db.delete(users).where(eq(users.id, adminId));
    }
    if (academicHeadId) {
      await db.delete(notifications).where(eq(notifications.userId, academicHeadId));
      await db.delete(users).where(eq(users.id, academicHeadId));
    }

    if (batch1Id) await db.delete(batches).where(eq(batches.id, batch1Id));
    if (batch2Id) await db.delete(batches).where(eq(batches.id, batch2Id));

    if (moduleId) await db.delete(modules).where(eq(modules.id, moduleId));
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create Teacher, Admin, and Academic Head
    const teacher1Res = await db
      .insert(users)
      .values({
        unionId: "TCH_ALERT_TEST_1",
        name: "Alert Teacher 1",
        role: "teacher",
        status: "active",
      })
      .returning({ id: users.id });
    teacher1Id = teacher1Res[0].id;

    const teacher2Res = await db
      .insert(users)
      .values({
        unionId: "TCH_ALERT_TEST_2",
        name: "Alert Teacher 2",
        role: "teacher",
        status: "active",
      })
      .returning({ id: users.id });
    teacher2Id = teacher2Res[0].id;

    const adminRes = await db
      .insert(users)
      .values({
        unionId: "ADM_ALERT_TEST_1",
        name: "Alert Admin 1",
        role: "admin",
        status: "active",
      })
      .returning({ id: users.id });
    adminId = adminRes[0].id;

    const acadRes = await db
      .insert(users)
      .values({
        unionId: "ACAD_ALERT_TEST_1",
        name: "Alert Acad 1",
        role: "academic_head",
        status: "active",
      })
      .returning({ id: users.id });
    academicHeadId = acadRes[0].id;

    // 2. Create Students
    const stu1Res = await db
      .insert(users)
      .values({
        unionId: "STU1_ALERT_TEST_1",
        name: "Alert Student 1",
        role: "student",
        status: "active",
      })
      .returning({ id: users.id });
    student1Id = stu1Res[0].id;

    const stu2Res = await db
      .insert(users)
      .values({
        unionId: "STU2_ALERT_TEST_2",
        name: "Alert Student 2",
        role: "student",
        status: "active",
      })
      .returning({ id: users.id });
    student2Id = stu2Res[0].id;

    // 3. Create module and batches
    const moduleRes = await db
      .insert(modules)
      .values({
        name: "Alert Course",
      })
      .returning({ id: modules.id });
    moduleId = moduleRes[0].id;

    const batch1Res = await db
      .insert(batches)
      .values({
        moduleId,
        name: "Alert Batch 1",
        teacherId: teacher1Id,
      })
      .returning({ id: batches.id });
    batch1Id = batch1Res[0].id;

    const batch2Res = await db
      .insert(batches)
      .values({
        moduleId,
        name: "Alert Batch 2",
        teacherId: teacher2Id,
      })
      .returning({ id: batches.id });
    batch2Id = batch2Res[0].id;

    // Enroll Student 1 in Batch 1
    await db.insert(batchEnrollments).values({
      batchId: batch1Id,
      studentId: student1Id,
      status: "active",
    });

    // Enroll Student 2 in Batch 2
    await db.insert(batchEnrollments).values({
      batchId: batch2Id,
      studentId: student2Id,
      status: "active",
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should trigger an alert when a student is absent for 7 consecutive classes", async () => {
    const db = getDb();

    // 1. Create 7 completed classes for Batch 1 (all absent)
    for (let i = 0; i < 7; i++) {
      const cls = await db
        .insert(classes)
        .values({
          batchId: batch1Id,
          teacherId: teacher1Id,
          title: `Class ${i + 1}`,
          scheduledAt: new Date(Date.now() - (7 - i) * 24 * 60 * 60 * 1000), // progressively in the past
          status: "completed",
        })
        .returning({ id: classes.id });
      classIds.push(cls[0].id);

      // Student is absent (we record as absent or just don't record at all.
      // The scheduler treats both as absent. Let's record explicitly as absent for some and omit for others)
      if (i % 2 === 0) {
        await db.insert(attendance).values({
          classId: cls[0].id,
          studentId: student1Id,
          status: "absent",
        });
      }
    }

    // 2. Run scheduler check
    await checkStudentConsecutiveAbsences();

    // 3. Verify alert is active
    const alert = await db.query.attendanceAlerts.findFirst({
      where: and(
        eq(attendanceAlerts.studentId, student1Id),
        eq(attendanceAlerts.batchId, batch1Id)
      ),
    });
    expect(alert).toBeDefined();
    expect(alert?.status).toBe("active");
    expect(alert?.consecutiveAbsences).toBe(7);

    // 4. Verify notifications are generated
    // Student notification
    const studentNotifs = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, student1Id),
        eq(notifications.type, "absence_alert")
      ),
    });
    expect(studentNotifs.length).toBeGreaterThan(0);

    // Teacher notification
    const teacherNotifs = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, teacher1Id),
        eq(notifications.type, "absence_alert")
      ),
    });
    expect(teacherNotifs.length).toBeGreaterThan(0);

    // Admin notification
    const adminNotifs = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, adminId),
        eq(notifications.type, "absence_alert")
      ),
    });
    expect(adminNotifs.length).toBeGreaterThan(0);
  });

  it("should resolve the active alert when student becomes present or late", async () => {
    const db = getDb();

    // Create a new ongoing class and join it
    const liveCls = await db
      .insert(classes)
      .values({
        batchId: batch1Id,
        teacherId: teacher1Id,
        title: "Live Class to Join",
        scheduledAt: new Date(),
        status: "ongoing",
      })
      .returning({ id: classes.id });
    classIds.push(liveCls[0].id);

    // Create an approved class join request so student can join
    await db.insert(classJoinRequests).values({
      classId: liveCls[0].id,
      studentId: student1Id,
      status: "approved",
    });

    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Alert Student 1", sessionToken: "" },
    });

    // Student joins class (resolves alert)
    const joinResult = await caller.class.recordJoinTime({ classId: liveCls[0].id });
    expect(joinResult.success).toBe(true);

    // Check alert status is resolved
    const alert = await db.query.attendanceAlerts.findFirst({
      where: and(
        eq(attendanceAlerts.studentId, student1Id),
        eq(attendanceAlerts.batchId, batch1Id)
      ),
    });
    expect(alert?.status).toBe("resolved");
    expect(alert?.resolvedAt).toBeInstanceOf(Date);
  });

  it("should restrict academic head and student roles from fetching attendance alerts", async () => {
    const acadCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: academicHeadId, role: "academic_head", name: "Alert Acad 1", sessionToken: "" },
    });

    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Alert Student 1", sessionToken: "" },
    });

    await expect(
      acadCaller.class.listAttendanceAlerts({ status: "active" })
    ).rejects.toThrow("Access Denied");

    await expect(
      studentCaller.class.listAttendanceAlerts({ status: "active" })
    ).rejects.toThrow("Teacher access required"); // since student fails teacherQuery middleware first
  });

  it("should allow teacher to list alerts only for their assigned batches, and admins for all batches", async () => {
    const db = getDb();

    // Set up active alert for Student 2 under Teacher 2 / Batch 2
    for (let i = 0; i < 7; i++) {
      const cls = await db
        .insert(classes)
        .values({
          batchId: batch2Id,
          teacherId: teacher2Id,
          title: `Class B2-${i + 1}`,
          scheduledAt: new Date(Date.now() - (7 - i) * 24 * 60 * 60 * 1000),
          status: "completed",
        })
        .returning({ id: classes.id });
      classIds.push(cls[0].id);
    }

    // Run scheduler check to trigger alert for student 2
    await checkStudentConsecutiveAbsences();

    // Verify alert 2 exists
    const alert2 = await db.query.attendanceAlerts.findFirst({
      where: and(
        eq(attendanceAlerts.studentId, student2Id),
        eq(attendanceAlerts.batchId, batch2Id)
      ),
    });
    expect(alert2).toBeDefined();
    expect(alert2?.status).toBe("active");

    // Teacher 1 caller
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Alert Teacher 1", sessionToken: "" },
    });

    // Admin caller
    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "Alert Admin 1", sessionToken: "" },
    });

    // Teacher 1 should NOT see alert 2 since it belongs to batch 2 (assigned to Teacher 2)
    const t1Alerts = await teacher1Caller.class.listAttendanceAlerts({ status: "active" });
    const hasAlert2ForT1 = t1Alerts.some((a) => a.id === alert2?.id);
    expect(hasAlert2ForT1).toBe(false);

    // Admin should see alert 2
    const adminAlerts = await adminCaller.class.listAttendanceAlerts({ status: "active" });
    const hasAlert2ForAdmin = adminAlerts.some((a) => a.id === alert2?.id);
    expect(hasAlert2ForAdmin).toBe(true);
  });
});
