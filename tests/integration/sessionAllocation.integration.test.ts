import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import {
  users,
  modules,
  batches,
  batchEnrollments,
  profiles,
  notifications,
  sessionAllocationLogs,
  oneToOneSessions,
  classes,
  attendance,
} from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { updateStudentSessionBalances } from "../../server/lib/sessionHelper";

describe("Session Allocation Management Integration Tests", () => {
  let superAdminId: number;
  let teacherId: number;
  let studentId: number;
  let activeModuleId: number;
  let activeBatchId: number;
  let groupClassId: number;
  let oneToOneSessionId: number;

  let createdUserIds: number[] = [];
  let createdBatchIds: number[] = [];
  let createdModuleIds: number[] = [];
  let createdClassIds: number[] = [];
  let createdOneToOneSessionIds: number[] = [];

  const cleanup = async () => {
    const db = getDb();

    // Clean up oneToOneSessions
    for (const id of createdOneToOneSessionIds) {
      await db.delete(oneToOneSessions).where(eq(oneToOneSessions.id, id));
    }
    createdOneToOneSessionIds = [];

    // Clean up attendance and classes
    for (const id of createdClassIds) {
      await db.delete(attendance).where(eq(attendance.classId, id));
      await db.delete(classes).where(eq(classes.id, id));
    }
    createdClassIds = [];

    // Clean up profiles, logs, batch enrollments, notifications and users
    for (const uid of createdUserIds) {
      await db.delete(sessionAllocationLogs).where(eq(sessionAllocationLogs.studentId, uid));
      await db.delete(profiles).where(eq(profiles.userId, uid));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, uid));
      await db.delete(notifications).where(eq(notifications.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
    createdUserIds = [];

    // Clean up batches
    for (const bid of createdBatchIds) {
      await db.delete(batches).where(eq(batches.id, bid));
    }
    createdBatchIds = [];

    // Clean up modules
    for (const mid of createdModuleIds) {
      await db.delete(modules).where(eq(modules.id, mid));
    }
    createdModuleIds = [];

    // General cleanup of session threshold notifications for testing
    await db.delete(notifications).where(eq(notifications.type, "session_threshold"));
    await db.delete(notifications).where(eq(notifications.type, "session_exhausted"));
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create Super Admin
    const sa = await db.insert(users).values({
      unionId: "SA_SESSION_TEST",
      name: "Super Admin",
      role: "super_admin",
      status: "active",
      phone: "+91 9000000001",
      countryCode: "+91",
      phoneNumber: "9000000001",
      username: "sa_session_test",
      password: "password123",
    }).returning({ id: users.id });
    superAdminId = sa[0].id;
    createdUserIds.push(superAdminId);

    // 2. Create Teacher
    const t = await db.insert(users).values({
      unionId: "TCH_SESSION_TEST",
      name: "Teacher",
      role: "teacher",
      status: "active",
      phone: "+91 9000000002",
      countryCode: "+91",
      phoneNumber: "9000000002",
      username: "tch_session_test",
      password: "password123",
    }).returning({ id: users.id });
    teacherId = t[0].id;
    createdUserIds.push(teacherId);

    // 3. Create active module
    const m = await db.insert(modules).values({
      name: "Session Test Course",
      status: "active",
    }).returning({ id: modules.id });
    activeModuleId = m[0].id;
    createdModuleIds.push(activeModuleId);

    // 4. Create active batch under active module
    const b = await db.insert(batches).values({
      moduleId: activeModuleId,
      name: "Session Test Batch",
      status: "active",
      maxStudents: 30,
      courseFee: "5000.00",
    }).returning({ id: batches.id });
    activeBatchId = b[0].id;
    createdBatchIds.push(activeBatchId);
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should successfully create student with initial session allocations on registration", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const user = await caller.user.create({
      name: "Session Student",
      phone: "9000000003",
      countryCode: "+91",
      phoneNumber: "9000000003",
      username: "session_student",
      password: "password123",
      role: "student",
      courseId: activeModuleId,
      batchId: activeBatchId,
      allocatedOneToOneSessions: 5,
      allocatedGroupSessions: 10,
    });

    expect(user).toBeDefined();
    expect(user.id).toBeGreaterThan(0);
    studentId = user.id;
    createdUserIds.push(studentId);

    // Verify profile contains the correct initial session fields
    const db = getDb();
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });

    expect(profile).toBeDefined();
    expect(profile?.allocatedOneToOneSessions).toBe(5);
    expect(profile?.allocatedGroupSessions).toBe(10);
    expect(profile?.totalAllocatedSessions).toBe(15);
    expect(profile?.remainingOneToOneSessions).toBe(5);
    expect(profile?.remainingGroupSessions).toBe(10);
    expect(profile?.totalRemainingSessions).toBe(15);
    expect(profile?.attendedOneToOneSessions).toBe(0);
    expect(profile?.attendedGroupSessions).toBe(0);
    expect(profile?.totalAttendedSessions).toBe(0);
  });

  it("should block scheduling a new 1-to-1 session if remaining balance is exhausted", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    // Temporarily set remaining 1-to-1 sessions to 0
    await db.update(profiles)
      .set({ remainingOneToOneSessions: 0 })
      .where(eq(profiles.userId, studentId));

    await expect(
      caller.class.createOneToOne({
        teacherId,
        studentId,
        title: "Test Exhausted 1to1",
        scheduledAt: new Date(Date.now() + 3600000),
      })
    ).rejects.toThrow("Student has exhausted their allocated One-to-One sessions. Cannot schedule a new session.");

    // Restore the remaining sessions to 5
    await db.update(profiles)
      .set({ remainingOneToOneSessions: 5 })
      .where(eq(profiles.userId, studentId));
  });

  it("should block student from joining/requesting group session if remaining balance is exhausted", async () => {
    const db = getDb();
    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Session Student", sessionToken: "" },
    });

    // Create a group class
    const cls = await db.insert(classes).values({
      batchId: activeBatchId,
      teacherId,
      title: "Test Group Session",
      classType: "group",
      scheduledAt: new Date(),
      status: "ongoing",
    }).returning({ id: classes.id });
    groupClassId = cls[0].id;
    createdClassIds.push(groupClassId);

    // Temporarily set remaining Group sessions to 0
    await db.update(profiles)
      .set({ remainingGroupSessions: 0 })
      .where(eq(profiles.userId, studentId));

    // Try joining class
    await expect(
      studentCaller.class.getMeetingDetails({ classId: groupClassId })
    ).rejects.toThrow("You have exhausted your allocated Group sessions. Cannot join this class.");

    // Try requesting join
    await expect(
      studentCaller.class.requestJoin({ classId: groupClassId })
    ).rejects.toThrow("You have exhausted your allocated Group sessions. Cannot join this class.");

    // Restore remaining Group sessions to 10
    await db.update(profiles)
      .set({ remainingGroupSessions: 10 })
      .where(eq(profiles.userId, studentId));
  });

  it("should automatically update balances when a student attends sessions", async () => {
    const db = getDb();

    // 1. Record group attendance as present
    await db.insert(attendance).values({
      classId: groupClassId,
      studentId,
      status: "present",
    });

    // 2. Schedule and complete a 1-to-1 session
    const o2o = await db.insert(oneToOneSessions).values({
      teacherId,
      studentId,
      title: "Completed 1-to-1",
      scheduledAt: new Date(),
      status: "completed",
      studentAttendance: "present",
      teacherAttendance: "present",
      validFrom: new Date(),
      validUntil: new Date(),
    }).returning({ id: oneToOneSessions.id });
    oneToOneSessionId = o2o[0].id;
    createdOneToOneSessionIds.push(oneToOneSessionId);

    // Recalculate
    await updateStudentSessionBalances(db, studentId);

    // Verify balances
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, studentId),
    });

    expect(profile?.attendedGroupSessions).toBe(1);
    expect(profile?.attendedOneToOneSessions).toBe(1);
    expect(profile?.totalAttendedSessions).toBe(2);
    expect(profile?.remainingOneToOneSessions).toBe(4); // 5 - 1 = 4
    expect(profile?.remainingGroupSessions).toBe(9); // 10 - 1 = 9
    expect(profile?.totalRemainingSessions).toBe(13); // 15 - 2 = 13
  });

  it("should trigger low balance (3) and exhausted (0) notifications correctly", async () => {
    const db = getDb();

    // Clear previous notifications
    await db.delete(notifications).where(eq(notifications.userId, studentId));

    // Force remaining One-to-One session count to transition to exactly 3
    // We set old remaining to 4, and new remaining to 3
    await db.update(profiles)
      .set({ remainingOneToOneSessions: 4 })
      .where(eq(profiles.userId, studentId));

    // Create 1-to-1 sessions to match attended count of 2 (so remaining will be 5 - 2 = 3)
    await db.insert(oneToOneSessions).values({
      teacherId,
      studentId,
      title: "Another Completed 1-to-1",
      scheduledAt: new Date(),
      status: "completed",
      studentAttendance: "present",
      teacherAttendance: "present",
      validFrom: new Date(),
      validUntil: new Date(),
    }).returning({ id: oneToOneSessions.id });

    // Recalculate
    await updateStudentSessionBalances(db, studentId);

    // Verify low balance student notification was triggered
    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, studentId),
    });

    const lowBalanceNotif = notifs.find(n => n.type === "session_threshold");
    expect(lowBalanceNotif).toBeDefined();
    expect(lowBalanceNotif?.title).toBe("Low One-to-One Session Balance");

    // Force transition to 0 sessions remaining (5 - 5 = 0, so insert 3 more completed sessions)
    for (let i = 0; i < 3; i++) {
      await db.insert(oneToOneSessions).values({
        teacherId,
        studentId,
        title: `Completed 1-to-1 Extra ${i}`,
        scheduledAt: new Date(),
        status: "completed",
        studentAttendance: "present",
        teacherAttendance: "present",
        validFrom: new Date(),
        validUntil: new Date(),
      });
    }

    // Recalculate
    await updateStudentSessionBalances(db, studentId);

    // Verify exhaustion student notification was triggered
    const notifsExhausted = await db.query.notifications.findMany({
      where: eq(notifications.userId, studentId),
    });

    const exhaustedNotif = notifsExhausted.find(n => n.type === "session_exhausted");
    expect(exhaustedNotif).toBeDefined();
    expect(exhaustedNotif?.title).toBe("One-to-One Sessions Exhausted");
  });

  it("should allow Super Admin to adjust student session allocations and write audit logs", async () => {
    const db = getDb();
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    // Clear logs for student first
    await db.delete(sessionAllocationLogs).where(eq(sessionAllocationLogs.studentId, studentId));

    // Student has:
    // Attended: 5 One-to-One, 1 Group
    // Adjust allocations to: 10 One-to-One, 20 Group
    const result = await caller.admin.adjustStudentSessions({
      studentId,
      allocatedOneToOne: 10,
      allocatedGroup: 20,
      reason: "Excellent progress bonus",
    });

    expect(result).toBeDefined();
    expect(result?.allocatedOneToOneSessions).toBe(10);
    expect(result?.allocatedGroupSessions).toBe(20);
    expect(result?.totalAllocatedSessions).toBe(30);
    expect(result?.remainingOneToOneSessions).toBe(5); // 10 - 5 = 5
    expect(result?.remainingGroupSessions).toBe(19); // 20 - 1 = 19

    // Verify audit log exists
    const logs = await caller.admin.getSessionAllocationLogs({ studentId });
    expect(logs.length).toBe(1);
    expect(logs[0].previousOneToOne).toBe(5);
    expect(logs[0].newOneToOne).toBe(10);
    expect(logs[0].previousGroup).toBe(10);
    expect(logs[0].newGroup).toBe(20);
    expect(logs[0].reason).toBe("Excellent progress bonus");
    expect(logs[0].changedBy).toBe(superAdminId);
  });

  it("should fail validation if Super Admin tries to adjust allocations below attended counts", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    // Student has:
    // Attended: 5 One-to-One, 1 Group
    // Try to adjust One-to-One to 4 (below 5)
    await expect(
      caller.admin.adjustStudentSessions({
        studentId,
        allocatedOneToOne: 4,
        allocatedGroup: 20,
        reason: "Invalid reduction O2O",
      })
    ).rejects.toThrow("Cannot reduce One-to-One sessions below the attended count of 5.");

    // Try to adjust Group to 0 (below 1)
    await expect(
      caller.admin.adjustStudentSessions({
        studentId,
        allocatedOneToOne: 10,
        allocatedGroup: 0,
        reason: "Invalid reduction Group",
      })
    ).rejects.toThrow("Cannot reduce Group sessions below the attended count of 1.");
  });

  it("should block non-Super Admins from adjusting student session allocations", async () => {
    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Teacher", sessionToken: "" },
    });

    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 999, role: "admin", name: "Admin", sessionToken: "" },
    });

    // Teachers are blocked at query middleware level
    await expect(
      teacherCaller.admin.adjustStudentSessions({
        studentId,
        allocatedOneToOne: 10,
        allocatedGroup: 20,
        reason: "Teacher adjustment",
      })
    ).rejects.toThrow("Admin access required");

    // Admins are blocked at mutation logic level
    await expect(
      adminCaller.admin.adjustStudentSessions({
        studentId,
        allocatedOneToOne: 10,
        allocatedGroup: 20,
        reason: "Admin adjustment",
      })
    ).rejects.toThrow("Access Denied: Only Super Admin can adjust session allocations.");
  });
});
