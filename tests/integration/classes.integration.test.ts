import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, classes, attendance, classBatches, classJoinRequests } from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("Classes and Jitsi Integration Tests", () => {
  let student1Id: number;
  let student2Id: number;
  let teacherId: number;
  let moduleId: number;
  let batch1Id: number;
  let batch2Id: number;
  let class1Id: number;
  let class2Id: number;

  const cleanup = async () => {
    const db = getDb();

    // Clean up attendance, classes, enrollments, batches, modules, users
    if (class1Id) {
      await db.delete(classJoinRequests).where(eq(classJoinRequests.classId, class1Id));
      await db.delete(attendance).where(eq(attendance.classId, class1Id));
    }
    if (class2Id) {
      await db.delete(classJoinRequests).where(eq(classJoinRequests.classId, class2Id));
      await db.delete(attendance).where(eq(attendance.classId, class2Id));
    }

    if (class1Id) await db.delete(classes).where(eq(classes.id, class1Id));
    if (class2Id) await db.delete(classes).where(eq(classes.id, class2Id));

    if (student1Id) {
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, student1Id));
      await db.delete(users).where(eq(users.id, student1Id));
    }
    if (student2Id) {
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, student2Id));
      await db.delete(users).where(eq(users.id, student2Id));
    }
    if (teacherId) {
      await db.delete(users).where(eq(users.id, teacherId));
    }

    if (batch1Id) await db.delete(batches).where(eq(batches.id, batch1Id));
    if (batch2Id) await db.delete(batches).where(eq(batches.id, batch2Id));

    if (moduleId) await db.delete(modules).where(eq(modules.id, moduleId));
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create Teacher and Students
    const teacherRes = await db.insert(users).values({
      unionId: "TCH_JITSI_TEST",
      name: "Jitsi Teacher",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId = teacherRes[0].id;

    const stu1Res = await db.insert(users).values({
      unionId: "STU1_JITSI_TEST",
      name: "Jitsi Student 1",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    student1Id = stu1Res[0].id;

    const stu2Res = await db.insert(users).values({
      unionId: "STU2_JITSI_TEST",
      name: "Jitsi Student 2",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    student2Id = stu2Res[0].id;

    // 2. Create module and batches
    const moduleRes = await db.insert(modules).values({
      name: "Jitsi Course",
    }).returning({ id: modules.id });
    moduleId = moduleRes[0].id;

    const batch1Res = await db.insert(batches).values({
      moduleId,
      name: "Jitsi Batch 1",
    }).returning({ id: batches.id });
    batch1Id = batch1Res[0].id;

    const batch2Res = await db.insert(batches).values({
      moduleId,
      name: "Jitsi Batch 2",
    }).returning({ id: batches.id });
    batch2Id = batch2Res[0].id;

    // 3. Enroll Student 1 in Batch 1 only. Student 2 has no enrollments.
    await db.insert(batchEnrollments).values({
      batchId: batch1Id,
      studentId: student1Id,
      status: "active",
    });

    // 4. Create classes
    const class1Res = await db.insert(classes).values({
      batchId: batch1Id,
      teacherId,
      title: "Jitsi Batch 1 Class",
      scheduledAt: new Date(),
      status: "ongoing",
    }).returning({ id: classes.id });
    class1Id = class1Res[0].id;

    await db.insert(classJoinRequests).values({
      classId: class1Id,
      studentId: student1Id,
      status: "approved",
    });

    const class2Res = await db.insert(classes).values({
      batchId: batch2Id,
      teacherId,
      title: "Jitsi Batch 2 Class",
      scheduledAt: new Date(),
      status: "ongoing",
    }).returning({ id: classes.id });
    class2Id = class2Res[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should list only classes of batches that the student is actively enrolled in", async () => {
    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Jitsi Student 1", sessionToken: "" },
    });

    const student2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student2Id, role: "student", name: "Jitsi Student 2", sessionToken: "" },
    });

    // Student 1 should see class 1, but NOT class 2
    const classes1 = await student1Caller.class.list();
    expect(classes1.length).toBe(1);
    expect(classes1[0].id).toBe(class1Id);

    // Student 2 should see NO classes
    const classes2 = await student2Caller.class.list();
    expect(classes2.length).toBe(0);
  });

  it("should record student join and leave times in attendance", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Jitsi Student 1", sessionToken: "" },
    });

    // 1. Record Join Time
    const joinResult = await caller.class.recordJoinTime({ classId: class1Id });
    expect(joinResult.success).toBe(true);

    // Verify DB entry
    const joinRecord = await db.query.attendance.findFirst({
      where: and(eq(attendance.classId, class1Id), eq(attendance.studentId, student1Id)),
    });
    expect(joinRecord).toBeDefined();
    expect(joinRecord?.joinedAt).toBeInstanceOf(Date);
    expect(joinRecord?.status).toBe("present");
    expect(joinRecord?.leftAt).toBeNull();

    // 2. Record Leave Time
    const leaveResult = await caller.class.recordLeaveTime({ classId: class1Id });
    expect(leaveResult.success).toBe(true);

    // Verify DB entry has leftAt
    const leaveRecord = await db.query.attendance.findFirst({
      where: and(eq(attendance.classId, class1Id), eq(attendance.studentId, student1Id)),
    });
    expect(leaveRecord?.leftAt).toBeInstanceOf(Date);
  });

  it("should reject join recording if the student is not enrolled in the batch", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student2Id, role: "student", name: "Jitsi Student 2", sessionToken: "" },
    });

    // Student 2 is not enrolled in Batch 1, so joining Class 1 should fail
    await expect(
      caller.class.recordJoinTime({ classId: class1Id })
    ).rejects.toThrow("You are not authorized to join this class session.");
  });

  it("should fetch meeting details securely and verify access controls", async () => {
    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Jitsi Student 1", sessionToken: "" },
    });

    const student2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student2Id, role: "student", name: "Jitsi Student 2", sessionToken: "" },
    });

    // Student 1 (enrolled) can fetch details
    const details = await student1Caller.class.getMeetingDetails({ classId: class1Id });
    expect(details.roomName).toBeDefined();
    expect(details.roomName.startsWith("emtees-")).toBe(true);
    expect(details.isModerator).toBe(false);

    // Student 2 (not enrolled) is rejected
    await expect(
      student2Caller.class.getMeetingDetails({ classId: class1Id })
    ).rejects.toThrow("You are not authorized to join this class session.");
  });

  it("should calculate and update attendance duration on leave", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Jitsi Student 1", sessionToken: "" },
    });

    // Start with a clean slate: reset attendance
    await db.delete(attendance).where(and(eq(attendance.classId, class1Id), eq(attendance.studentId, student1Id)));

    // 1. Join (sets joinedAt)
    await caller.class.recordJoinTime({ classId: class1Id });

    // Manually tweak joinedAt back 10 seconds to simulate elapsed time
    const fakeJoin = new Date(Date.now() - 10000);
    await db.update(attendance)
      .set({ joinedAt: fakeJoin })
      .where(and(eq(attendance.classId, class1Id), eq(attendance.studentId, student1Id)));

    // 2. Leave (calculates duration)
    await caller.class.recordLeaveTime({ classId: class1Id });

    // Verify duration is logged (~10 seconds)
    const record = await db.query.attendance.findFirst({
      where: and(eq(attendance.classId, class1Id), eq(attendance.studentId, student1Id)),
    });
    expect(record?.duration).toBeGreaterThanOrEqual(10);
    expect(record?.duration).toBeLessThanOrEqual(15);
  });

  it("should trigger class reminders at appropriate intervals and update reminder flags", async () => {
    const db = getDb();

    // 1. Create a class scheduled 9 minutes from now (should trigger 10-minute reminder)
    const tenMinClsRes = await db.insert(classes).values({
      batchId: batch1Id,
      teacherId,
      title: "10 Min Reminder Class",
      scheduledAt: new Date(Date.now() + 9 * 60 * 1000), // 9 minutes from now
      status: "scheduled",
    }).returning({ id: classes.id });
    const tenMinClsId = tenMinClsRes[0].id;

    // 2. Create a class scheduled 55 minutes from now (should trigger 1-hour reminder)
    const oneHourClsRes = await db.insert(classes).values({
      batchId: batch1Id,
      teacherId,
      title: "1 Hour Reminder Class",
      scheduledAt: new Date(Date.now() + 55 * 60 * 1000), // 55 minutes from now
      status: "scheduled",
    }).returning({ id: classes.id });
    const oneHourClsId = oneHourClsRes[0].id;

    // 3. Create a class scheduled 23 hours from now (should trigger 1-day reminder)
    const oneDayClsRes = await db.insert(classes).values({
      batchId: batch1Id,
      teacherId,
      title: "1 Day Reminder Class",
      scheduledAt: new Date(Date.now() + 23 * 60 * 60 * 1000), // 23 hours from now
      status: "scheduled",
    }).returning({ id: classes.id });
    const oneDayClsId = oneDayClsRes[0].id;

    // Run scheduler reminder routine
    const { sendClassReminders } = await import("../../server/lib/scheduler");
    await sendClassReminders();

    // Verify DB fields are set
    const tenMinCls = await db.query.classes.findFirst({ where: eq(classes.id, tenMinClsId) });
    expect(tenMinCls?.reminder10MinSentAt).toBeInstanceOf(Date);
    expect(tenMinCls?.reminderSentAt).toBeInstanceOf(Date);
    expect(tenMinCls?.reminder1HourSentAt).toBeNull();

    const oneHourCls = await db.query.classes.findFirst({ where: eq(classes.id, oneHourClsId) });
    expect(oneHourCls?.reminder1HourSentAt).toBeInstanceOf(Date);
    expect(oneHourCls?.reminder10MinSentAt).toBeNull();

    const oneDayCls = await db.query.classes.findFirst({ where: eq(classes.id, oneDayClsId) });
    expect(oneDayCls?.reminder1DaySentAt).toBeInstanceOf(Date);
    expect(oneDayCls?.reminder1HourSentAt).toBeNull();

    // Clean up
    await db.delete(classes).where(eq(classes.id, tenMinClsId));
    await db.delete(classes).where(eq(classes.id, oneHourClsId));
    await db.delete(classes).where(eq(classes.id, oneDayClsId));
  });

  it("should enforce strict role permissions for scheduling live classes", async () => {
    // 1. Student should be blocked
    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Jitsi Student 1", sessionToken: "" },
    });
    await expect(
      studentCaller.class.create({
        batchIds: [batch1Id],
        title: "Unauthorized Student Class",
        scheduledAt: new Date(),
        duration: 45,
        teacherId,
      })
    ).rejects.toThrow("Only Super Admin and Teacher roles can schedule classes.");

    // 2. Admin should be blocked
    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 999, role: "admin", name: "Jitsi Admin", sessionToken: "" },
    });
    await expect(
      adminCaller.class.create({
        batchIds: [batch1Id],
        title: "Unauthorized Admin Class",
        scheduledAt: new Date(),
        duration: 45,
        teacherId,
      })
    ).rejects.toThrow("Only Super Admin and Teacher roles can schedule classes.");
  });

  it("should restrict teachers to schedule only for their assigned batches, while super admins can schedule for any batch", async () => {
    const db = getDb();
    
    // Create a new teacher who is NOT assigned to batch 1 or batch 2
    const otherTeacherRes = await db.insert(users).values({
      unionId: "TCH_JITSI_OTHER",
      name: "Other Teacher",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    const otherTeacherId = otherTeacherRes[0].id;

    // Caller for otherTeacher
    const otherTeacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: otherTeacherId, role: "teacher", name: "Other Teacher", sessionToken: "" },
    });

    // Caller for Super Admin
    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 888, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    // 1. otherTeacher schedules for batch 1 (which they don't teach) -> should fail
    await expect(
      otherTeacherCaller.class.create({
        batchIds: [batch1Id],
        title: "Invalid Teacher Class",
        scheduledAt: new Date(),
        duration: 45,
        teacherId: otherTeacherId,
      })
    ).rejects.toThrow("You can only schedule classes for batches assigned to you.");

    // 2. Super Admin schedules a class for batch 1 and batch 2 (multi-batch) -> should succeed
    const superAdminClass = await superAdminCaller.class.create({
      batchIds: [batch1Id, batch2Id],
      title: "Super Admin Multi Batch Class",
      scheduledAt: new Date(),
      duration: 60,
      teacherId,
    });

    expect(superAdminClass?.id).toBeDefined();
    expect(superAdminClass?.classBatches?.length).toBe(2);

    // Clean up
    if (superAdminClass?.id) {
      await db.delete(classBatches).where(eq(classBatches.classId, superAdminClass.id));
      await db.delete(classes).where(eq(classes.id, superAdminClass.id));
    }
    await db.delete(users).where(eq(users.id, otherTeacherId));
  });

  it("should link multiple batches to a class, deduplicate listing, and authorize students of all batches to join", async () => {
    const db = getDb();
    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 888, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    // 1. Super Admin schedules class linked to batch 1 and batch 2
    const multiClass = await superAdminCaller.class.create({
      batchIds: [batch1Id, batch2Id],
      title: "Shared Multi-Batch Live Class",
      scheduledAt: new Date(),
      duration: 60,
      teacherId,
    });

    // Enroll student 2 in batch 2 (student 1 is already in batch 1)
    await db.insert(batchEnrollments).values({
      batchId: batch2Id,
      studentId: student2Id,
      status: "active",
    });

    // Insert approved join requests for both students
    await db.insert(classJoinRequests).values([
      { classId: multiClass!.id, studentId: student1Id, status: "approved" },
      { classId: multiClass!.id, studentId: student2Id, status: "approved" }
    ]);

    // 2. Verify student 1 (enrolled in batch 1) can list and join
    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Jitsi Student 1", sessionToken: "" },
    });
    const s1List = await student1Caller.class.list();
    const s1Found = s1List.find(c => c.id === multiClass?.id);
    expect(s1Found).toBeDefined();
    
    const s1Join = await student1Caller.class.recordJoinTime({ classId: multiClass!.id });
    expect(s1Join.success).toBe(true);

    // 3. Verify student 2 (enrolled in batch 2) can list and join
    const student2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student2Id, role: "student", name: "Jitsi Student 2", sessionToken: "" },
    });
    const s2List = await student2Caller.class.list();
    const s2Found = s2List.find(c => c.id === multiClass?.id);
    expect(s2Found).toBeDefined();
    
    const s2Join = await student2Caller.class.recordJoinTime({ classId: multiClass!.id });
    expect(s2Join.success).toBe(true);

    // 4. Enroll student 1 in batch 2 as well (so enrolled in both batch 1 and batch 2)
    await db.insert(batchEnrollments).values({
      batchId: batch2Id,
      studentId: student1Id,
      status: "active",
    });

    // Verify student 1 sees the class exactly once in their listed classes (deduplicated)
    const s1DoubleList = await student1Caller.class.list();
    const s1Matches = s1DoubleList.filter(c => c.id === multiClass?.id);
    expect(s1Matches.length).toBe(1);

    // Clean up
    await db.delete(classJoinRequests).where(eq(classJoinRequests.classId, multiClass!.id));
    await db.delete(attendance).where(eq(attendance.classId, multiClass!.id));
    await db.delete(classBatches).where(eq(classBatches.classId, multiClass!.id));
    await db.delete(classes).where(eq(classes.id, multiClass!.id));
    await db.delete(batchEnrollments).where(and(eq(batchEnrollments.batchId, batch2Id), eq(batchEnrollments.studentId, student2Id)));
    await db.delete(batchEnrollments).where(and(eq(batchEnrollments.batchId, batch2Id), eq(batchEnrollments.studentId, student1Id)));
  });
});
