import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, oneToOneSessions, notifications, profiles } from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("1-to-1 Class Session Management Integration Tests", () => {
  let student1Id: number;
  let student2Id: number;
  let teacher1Id: number;
  let teacher2Id: number;
  let superAdminId: number;
  let sessionId: number;

  const cleanup = async () => {
    const db = getDb();
    if (sessionId) {
      await db.delete(oneToOneSessions).where(eq(oneToOneSessions.id, sessionId));
    }
    if (student1Id) {
      await db.delete(profiles).where(eq(profiles.userId, student1Id));
      await db.delete(notifications).where(eq(notifications.userId, student1Id));
      await db.delete(users).where(eq(users.id, student1Id));
    }
    if (student2Id) {
      await db.delete(profiles).where(eq(profiles.userId, student2Id));
      await db.delete(notifications).where(eq(notifications.userId, student2Id));
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
    if (superAdminId) {
      await db.delete(users).where(eq(users.id, superAdminId));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create Users
    const superAdminRes = await db.insert(users).values({
      unionId: "SA_OTO_TEST",
      name: "Super Admin",
      role: "super_admin",
      status: "active",
    }).returning({ id: users.id });
    superAdminId = superAdminRes[0].id;

    const teacher1Res = await db.insert(users).values({
      unionId: "TCH1_OTO_TEST",
      name: "Teacher 1",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacher1Id = teacher1Res[0].id;

    const teacher2Res = await db.insert(users).values({
      unionId: "TCH2_OTO_TEST",
      name: "Teacher 2",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacher2Id = teacher2Res[0].id;

    const student1Res = await db.insert(users).values({
      unionId: "STU1_OTO_TEST",
      name: "Student 1",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    student1Id = student1Res[0].id;

    const student2Res = await db.insert(users).values({
      unionId: "STU2_OTO_TEST",
      name: "Student 2",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    student2Id = student2Res[0].id;

    // Create student profiles to support session allocations
    await db.insert(profiles).values({
      userId: student1Id,
      course: "OTO Course 1",
      batch: "OTO Batch 1",
      feesTotal: "1000",
      feesBalance: "1000",
      allocatedOneToOneSessions: 10,
      allocatedGroupSessions: 10,
      totalAllocatedSessions: 20,
      remainingOneToOneSessions: 10,
      remainingGroupSessions: 10,
      totalRemainingSessions: 20,
    });

    await db.insert(profiles).values({
      userId: student2Id,
      course: "OTO Course 2",
      batch: "OTO Batch 2",
      feesTotal: "1000",
      feesBalance: "1000",
      allocatedOneToOneSessions: 10,
      allocatedGroupSessions: 10,
      totalAllocatedSessions: 20,
      remainingOneToOneSessions: 10,
      remainingGroupSessions: 10,
      totalRemainingSessions: 20,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should restrict creation of 1-to-1 sessions only to Super Admin", async () => {
    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Student 1", sessionToken: "" },
    });

    // Student should be rejected
    await expect(
      studentCaller.class.createOneToOne({
        teacherId: teacher1Id,
        studentId: student1Id,
        title: "Forbidden Student Session",
        scheduledAt: new Date(Date.now() + 3600000),
      })
    ).rejects.toThrow("Only Super Admin can create 1-to-1 sessions.");

    // Teacher should be rejected
    await expect(
      teacherCaller.class.createOneToOne({
        teacherId: teacher1Id,
        studentId: student1Id,
        title: "Forbidden Teacher Session",
        scheduledAt: new Date(Date.now() + 3600000),
      })
    ).rejects.toThrow("Only Super Admin can create 1-to-1 sessions.");

    // Super Admin should succeed
    const session = await superAdminCaller.class.createOneToOne({
      teacherId: teacher1Id,
      studentId: student1Id,
      title: "Valid 1-to-1 Session",
      scheduledAt: new Date(Date.now() + 3600000),
    });

    expect(session).toBeDefined();
    expect(session?.id).toBeDefined();
    sessionId = session!.id;

    // Check that notifications were sent to student and teacher
    const db = getDb();
    const studentNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, student1Id),
    });
    expect(studentNotifs.length).toBeGreaterThan(0);
    expect(studentNotifs[0].title).toContain("New 1-to-1 Session Scheduled");

    const teacherNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, teacher1Id),
    });
    expect(teacherNotifs.length).toBeGreaterThan(0);
    expect(teacherNotifs[0].title).toContain("New 1-to-1 Session Scheduled");
  });

  it("should restrict visibility: students/teachers see only their own sessions, super admin sees all", async () => {
    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    const teacher2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher2Id, role: "teacher", name: "Teacher 2", sessionToken: "" },
    });

    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Student 1", sessionToken: "" },
    });

    const student2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student2Id, role: "student", name: "Student 2", sessionToken: "" },
    });

    // Student 1 should see the session
    const list1 = await student1Caller.class.listOneToOne();
    expect(list1.some((s) => s.id === sessionId)).toBe(true);

    // Student 2 should NOT see the session
    const list2 = await student2Caller.class.listOneToOne();
    expect(list2.some((s) => s.id === sessionId)).toBe(false);

    // Teacher 1 should see the session
    const listT1 = await teacher1Caller.class.listOneToOne();
    expect(listT1.some((s) => s.id === sessionId)).toBe(true);

    // Teacher 2 should NOT see the session
    const listT2 = await teacher2Caller.class.listOneToOne();
    expect(listT2.some((s) => s.id === sessionId)).toBe(false);

    // Super Admin should see the session
    const listSA = await superAdminCaller.class.listOneToOne();
    expect(listSA.some((s) => s.id === sessionId)).toBe(true);
  });

  it("should prohibit students from joining the session before the teacher starts it", async () => {
    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Student 1", sessionToken: "" },
    });

    // Session is currently "scheduled", so student should be blocked
    await expect(
      student1Caller.class.joinOneToOne({ sessionId })
    ).rejects.toThrow("Class has not started yet. Please wait for the teacher to start the session.");
  });

  it("should allow teacher/super admin to start the session, updating status and logging teacher attendance", async () => {
    const db = getDb();
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    const result = await teacher1Caller.class.startOneToOne({ sessionId });
    expect(result.success).toBe(true);

    // Verify status is "ongoing" and teacher attendance is "present"
    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionId),
    });
    expect(session?.status).toBe("ongoing");
    expect(session?.teacherAttendance).toBe("present");
    expect(session?.startedAt).toBeInstanceOf(Date);
  });

  it("should allow student to join once the session is ongoing, logging student attendance", async () => {
    const db = getDb();
    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Student 1", sessionToken: "" },
    });

    const details = await student1Caller.class.joinOneToOne({ sessionId });
    expect(details.roomName).toBeDefined();

    // Verify student attendance is "present"
    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionId),
    });
    expect(session?.studentAttendance).toBe("present");
  });

  it("should allow ending the session, recording end time, actual duration, and completing status", async () => {
    const db = getDb();
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    const result = await teacher1Caller.class.endOneToOne({ sessionId });
    expect(result.success).toBe(true);

    // Verify session details are logged correctly
    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionId),
    });
    expect(session?.status).toBe("completed");
    expect(session?.endedAt).toBeInstanceOf(Date);
    expect(session?.actualDuration).toBeDefined();
    expect(session?.completedAt).toBeInstanceOf(Date);
  });

  it("should support rescheduling by Super Admin, resetting reminder flags, updating status to rescheduled, and sending notifications", async () => {
    const db = getDb();
    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    // First reset session status to scheduled so we can test rescheduling
    await db.update(oneToOneSessions)
      .set({
        status: "scheduled",
        reminder1DaySentAt: new Date(),
        reminder1HourSentAt: new Date(),
        reminder10MinSentAt: new Date(),
      })
      .where(eq(oneToOneSessions.id, sessionId));

    const newTime = new Date(Date.now() + 7200000); // 2 hours from now
    const updated = await superAdminCaller.class.rescheduleOneToOne({
      sessionId,
      scheduledAt: newTime,
      sessionLength: 45,
    });

    expect(updated).toBeDefined();
    expect(updated?.status).toBe("rescheduled");
    expect(updated?.sessionLength).toBe(45);
    
    // Check reminders were reset
    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionId),
    });
    expect(session?.reminder1DaySentAt).toBeNull();
    expect(session?.reminder1HourSentAt).toBeNull();
    expect(session?.reminder10MinSentAt).toBeNull();

    // Check reschedule notifications were sent
    const studentNotifs = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, student1Id), eq(notifications.type, "class_scheduled")),
    });
    expect(studentNotifs.some(n => n.title.includes("Rescheduled"))).toBe(true);
  });

  it("should support cancellation by Super Admin, updating status and notifying participants", async () => {
    const db = getDb();
    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const result = await superAdminCaller.class.cancelOneToOne({ sessionId });
    expect(result.success).toBe(true);

    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionId),
    });
    expect(session?.status).toBe("cancelled");

    // Check cancellation notifications
    const studentNotifs = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, student1Id), eq(notifications.type, "class_cancelled")),
    });
    expect(studentNotifs.length).toBeGreaterThan(0);
  });

  it("should trigger scheduled 1-to-1 session reminders at correct intervals", async () => {
    const db = getDb();

    // Setup a new 1-to-1 session scheduled 8 minutes from now
    const upcomingSessionRes = await db.insert(oneToOneSessions).values({
      teacherId: teacher1Id,
      studentId: student1Id,
      title: "Upcoming 1-to-1 Test Session",
      sessionLength: 30,
      scheduledAt: new Date(Date.now() + 8 * 60 * 1000), // 8 mins from now
      status: "scheduled",
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    }).returning({ id: oneToOneSessions.id });
    const upcomingSessionId = upcomingSessionRes[0].id;

    // Run scheduler reminder logic
    const { sendOneToOneReminders } = await import("../../server/lib/scheduler");
    await sendOneToOneReminders();

    // Verify reminder flag updated
    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, upcomingSessionId),
    });
    expect(session?.reminder10MinSentAt).toBeInstanceOf(Date);
    expect(session?.reminder1HourSentAt).toBeNull();

    // Clean up
    await db.delete(oneToOneSessions).where(eq(oneToOneSessions.id, upcomingSessionId));
  });
});
