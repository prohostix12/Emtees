import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import {
  users,
  oneToOneSessions,
  notifications,
  profiles,
  oneToOneRescheduleRequests
} from "../../db/schema";
import { eq, and } from "drizzle-orm";

describe("1-to-1 Class Rescheduling Requests Integration Tests", () => {
  let student1Id: number;
  let teacher1Id: number;
  let teacher2Id: number;
  let superAdminId: number;
  let sessionIdFuture: number;
  let sessionIdPast: number;
  let sessionIdAlreadyRescheduled: number;

  const cleanup = async () => {
    const db = getDb();
    // Delete reschedule requests first to prevent foreign key issues
    await db.delete(oneToOneRescheduleRequests);
    await db.delete(oneToOneSessions);
    if (student1Id) {
      await db.delete(profiles).where(eq(profiles.userId, student1Id));
      await db.delete(notifications).where(eq(notifications.userId, student1Id));
      await db.delete(users).where(eq(users.id, student1Id));
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
      await db.delete(notifications).where(eq(notifications.userId, superAdminId));
      await db.delete(users).where(eq(users.id, superAdminId));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create Users
    const superAdminRes = await db.insert(users).values({
      unionId: "SA_RESCH_TEST",
      name: "Super Admin",
      role: "super_admin",
      status: "active",
    }).returning({ id: users.id });
    superAdminId = superAdminRes[0].id;

    const teacher1Res = await db.insert(users).values({
      unionId: "TCH1_RESCH_TEST",
      name: "Teacher 1",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacher1Id = teacher1Res[0].id;

    const teacher2Res = await db.insert(users).values({
      unionId: "TCH2_RESCH_TEST",
      name: "Teacher 2",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacher2Id = teacher2Res[0].id;

    const student1Res = await db.insert(users).values({
      unionId: "STU1_RESCH_TEST",
      name: "Student 1",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    student1Id = student1Res[0].id;

    // Create student profile
    await db.insert(profiles).values({
      userId: student1Id,
      course: "OTO Reschedule Course",
      batch: "OTO Reschedule Batch",
      feesTotal: "1000",
      feesBalance: "1000",
      allocatedOneToOneSessions: 10,
      allocatedGroupSessions: 10,
      totalAllocatedSessions: 20,
      remainingOneToOneSessions: 10,
      remainingGroupSessions: 10,
      totalRemainingSessions: 20,
    });

    // 2. Create One-to-One Sessions
    // Future Session
    const sessionFutureRes = await db.insert(oneToOneSessions).values({
      teacherId: teacher1Id,
      studentId: student1Id,
      title: "Upcoming Session",
      scheduledAt: new Date(Date.now() + 7200000), // 2 hours from now
      status: "scheduled",
      validFrom: new Date(Date.now() + 7200000),
      validUntil: new Date(Date.now() + 7200000 + 86400000),
    }).returning({ id: oneToOneSessions.id });
    sessionIdFuture = sessionFutureRes[0].id;

    // Past Session
    const sessionPastRes = await db.insert(oneToOneSessions).values({
      teacherId: teacher1Id,
      studentId: student1Id,
      title: "Past Session",
      scheduledAt: new Date(Date.now() - 3600000), // 1 hour ago
      status: "scheduled",
      validFrom: new Date(Date.now() - 3600000),
      validUntil: new Date(Date.now() - 3600000 + 86400000),
    }).returning({ id: oneToOneSessions.id });
    sessionIdPast = sessionPastRes[0].id;

    // Session for another approval flow
    const sessionReschedRes = await db.insert(oneToOneSessions).values({
      teacherId: teacher1Id,
      studentId: student1Id,
      title: "Session to Resolve",
      scheduledAt: new Date(Date.now() + 14400000), // 4 hours from now
      status: "scheduled",
      validFrom: new Date(Date.now() + 14400000),
      validUntil: new Date(Date.now() + 14400000 + 86400000),
    }).returning({ id: oneToOneSessions.id });
    sessionIdAlreadyRescheduled = sessionReschedRes[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should fail reschedule request if the user is not a teacher", async () => {
    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Student 1", sessionToken: "" },
    });

    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    await expect(
      studentCaller.class.requestReschedule({
        sessionId: sessionIdFuture,
        proposedScheduledAt: new Date(Date.now() + 86400000),
        reason: "Need to change",
      })
    ).rejects.toThrow("Only Teachers can request rescheduling.");

    await expect(
      superAdminCaller.class.requestReschedule({
        sessionId: sessionIdFuture,
        proposedScheduledAt: new Date(Date.now() + 86400000),
        reason: "Need to change",
      })
    ).rejects.toThrow("Only Teachers can request rescheduling.");
  });

  it("should fail reschedule request if the teacher is not assigned to the session", async () => {
    const teacher2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher2Id, role: "teacher", name: "Teacher 2", sessionToken: "" },
    });

    await expect(
      teacher2Caller.class.requestReschedule({
        sessionId: sessionIdFuture,
        proposedScheduledAt: new Date(Date.now() + 86400000),
        reason: "Not my session",
      })
    ).rejects.toThrow("You can only request rescheduling for sessions assigned to you.");
  });

  it("should fail reschedule request if the session has already started or is in the past", async () => {
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    await expect(
      teacher1Caller.class.requestReschedule({
        sessionId: sessionIdPast,
        proposedScheduledAt: new Date(Date.now() + 86400000),
        reason: "Rescheduling past class",
      })
    ).rejects.toThrow("Cannot request rescheduling after the session start time.");
  });

  it("should successfully create reschedule request and notify admin", async () => {
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    const db = getDb();
    // Clear any previous notifications to super admin
    await db.delete(notifications).where(eq(notifications.userId, superAdminId));

    const proposedTime = new Date(Date.now() + 100000000); // about 27.7 hours from now
    const request = await teacher1Caller.class.requestReschedule({
      sessionId: sessionIdFuture,
      proposedScheduledAt: proposedTime,
      reason: "Urgent personal work",
    });

    expect(request).toBeDefined();
    expect(request.id).toBeDefined();
    expect(request.status).toBe("pending");
    expect(new Date(request.proposedScheduledAt).getTime()).toBe(proposedTime.getTime());

    // Verify rescheduling request exists in the DB
    const dbReq = await db.query.oneToOneRescheduleRequests.findFirst({
      where: eq(oneToOneRescheduleRequests.id, request.id),
    });
    expect(dbReq).toBeDefined();
    expect(dbReq?.status).toBe("pending");

    // Verify session status transitioned to reschedule_request_pending
    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionIdFuture),
    });
    expect(session?.status).toBe("reschedule_request_pending");

    // Verify Admin was notified
    const adminNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, superAdminId),
    });
    expect(adminNotifs.length).toBeGreaterThan(0);
    expect(adminNotifs[0].type).toBe("reschedule_request_submitted");
    expect(adminNotifs[0].title).toContain("Reschedule Request");
    expect(adminNotifs[0].message).toContain("Teacher 1 has requested to reschedule");
  });

  it("should fail reschedule request if another request is already pending", async () => {
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    // There is already a pending request from the previous test
    await expect(
      teacher1Caller.class.requestReschedule({
        sessionId: sessionIdFuture,
        proposedScheduledAt: new Date(Date.now() + 120000000),
        reason: "Another reason",
      })
    ).rejects.toThrow("A rescheduling request is already pending for this session.");
  });

  it("should restrict listing reschedule requests correctly", async () => {
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

    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    // Teacher 1 should see their request
    const listT1 = await teacher1Caller.class.listRescheduleRequests();
    expect(listT1.length).toBeGreaterThan(0);
    expect(listT1.every(r => r.requestedBy === teacher1Id)).toBe(true);

    // Teacher 2 should see 0 requests (since they haven't submitted any)
    const listT2 = await teacher2Caller.class.listRescheduleRequests();
    expect(listT2.length).toBe(0);

    // Admin should see requests
    const listAdmin = await superAdminCaller.class.listRescheduleRequests();
    expect(listAdmin.length).toBeGreaterThan(0);
  });

  it("should fail resolution if non-admin attempts it", async () => {
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    const db = getDb();
    const pendingReq = await db.query.oneToOneRescheduleRequests.findFirst({
      where: eq(oneToOneRescheduleRequests.status, "pending"),
    });
    expect(pendingReq).toBeDefined();

    await expect(
      teacher1Caller.class.resolveRescheduleRequest({
        requestId: pendingReq!.id,
        status: "approved",
      })
    ).rejects.toThrow("Only Admins can approve or reject reschedule requests.");
  });

  it("should successfully approve reschedule request, updating session time & notifying student + teacher", async () => {
    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const db = getDb();
    const pendingReq = await db.query.oneToOneRescheduleRequests.findFirst({
      where: and(
        eq(oneToOneRescheduleRequests.sessionId, sessionIdFuture),
        eq(oneToOneRescheduleRequests.status, "pending")
      ),
    });
    expect(pendingReq).toBeDefined();

    // Set reminder logs on session to verify they get reset
    await db.update(oneToOneSessions).set({
      reminder1DaySentAt: new Date(),
      reminder1HourSentAt: new Date(),
      reminder10MinSentAt: new Date(),
    }).where(eq(oneToOneSessions.id, sessionIdFuture));

    // Clear notifications for student and teacher
    await db.delete(notifications).where(eq(notifications.userId, student1Id));
    await db.delete(notifications).where(eq(notifications.userId, teacher1Id));

    const res = await superAdminCaller.class.resolveRescheduleRequest({
      requestId: pendingReq!.id,
      status: "approved",
      adminRemarks: "Approved as requested",
    });
    expect(res.success).toBe(true);

    // Verify request updated in DB
    const resolvedReq = await db.query.oneToOneRescheduleRequests.findFirst({
      where: eq(oneToOneRescheduleRequests.id, pendingReq!.id),
    });
    expect(resolvedReq?.status).toBe("approved");
    expect(resolvedReq?.adminRemarks).toBe("Approved as requested");
    expect(resolvedReq?.resolvedBy).toBe(superAdminId);

    // Verify session updated in DB
    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionIdFuture),
    });
    expect(new Date(session!.scheduledAt).getTime()).toBe(new Date(pendingReq!.proposedScheduledAt).getTime());
    expect(session?.status).toBe("rescheduled");
    // Verify reminder flags reset
    expect(session?.reminder1DaySentAt).toBeNull();
    expect(session?.reminder1HourSentAt).toBeNull();
    expect(session?.reminder10MinSentAt).toBeNull();

    // Verify student and teacher notified
    const studentNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, student1Id),
    });
    expect(studentNotifs.length).toBeGreaterThan(0);
    expect(studentNotifs[0].type).toBe("class_scheduled");
    expect(studentNotifs[0].title).toContain("Rescheduled");

    const teacherNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, teacher1Id),
    });
    expect(teacherNotifs.length).toBeGreaterThan(0);
    expect(teacherNotifs[0].type).toBe("class_scheduled");
    expect(teacherNotifs[0].title).toContain("Reschedule Approved");
  });

  it("should successfully approve reschedule request with custom modified time", async () => {
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const db = getDb();
    // Submit a new request on sessionIdAlreadyRescheduled
    const req = await teacher1Caller.class.requestReschedule({
      sessionId: sessionIdAlreadyRescheduled,
      proposedScheduledAt: new Date(Date.now() + 200000000),
      reason: "Want to move",
    });

    const customTime = new Date(Date.now() + 300000000); // Custom time proposed by Admin
    const res = await superAdminCaller.class.resolveRescheduleRequest({
      requestId: req.id,
      status: "approved",
      proposedScheduledAt: customTime,
      adminRemarks: "Approved with modified time slots",
    });
    expect(res.success).toBe(true);

    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionIdAlreadyRescheduled),
    });
    expect(new Date(session!.scheduledAt).getTime()).toBe(customTime.getTime());
    expect(session?.status).toBe("rescheduled");
  });

  it("should successfully reject reschedule request, leaving session time unchanged & notifying teacher", async () => {
    const teacher1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacher1Id, role: "teacher", name: "Teacher 1", sessionToken: "" },
    });

    const superAdminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
    });

    const db = getDb();
    // Create a new session to reject reschedule request
    const sessionRes = await db.insert(oneToOneSessions).values({
      teacherId: teacher1Id,
      studentId: student1Id,
      title: "Session to Reject Reschedule",
      scheduledAt: new Date(Date.now() + 18000000), // 5 hours from now
      status: "scheduled",
      validFrom: new Date(Date.now() + 18000000),
      validUntil: new Date(Date.now() + 18000000 + 86400000),
    }).returning({ id: oneToOneSessions.id });
    const sessionToRejectId = sessionRes[0].id;

    const req = await teacher1Caller.class.requestReschedule({
      sessionId: sessionToRejectId,
      proposedScheduledAt: new Date(Date.now() + 25000000),
      reason: "Conflict",
    });

    // Verify session status transitioned to reschedule_request_pending before resolving
    const sessionBeforeResolve = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionToRejectId),
    });
    expect(sessionBeforeResolve?.status).toBe("reschedule_request_pending");

    // Clear notifications for teacher and student
    await db.delete(notifications).where(eq(notifications.userId, teacher1Id));
    await db.delete(notifications).where(eq(notifications.userId, student1Id));

    const originalScheduledTime = new Date(Date.now() + 18000000);

    const res = await superAdminCaller.class.resolveRescheduleRequest({
      requestId: req.id,
      status: "rejected",
      adminRemarks: "Cannot approve due to slot conflicts",
    });
    expect(res.success).toBe(true);

    // Verify request updated in DB
    const resolvedReq = await db.query.oneToOneRescheduleRequests.findFirst({
      where: eq(oneToOneRescheduleRequests.id, req.id),
    });
    expect(resolvedReq?.status).toBe("rejected");
    expect(resolvedReq?.adminRemarks).toBe("Cannot approve due to slot conflicts");

    // Verify session unchanged and status reverted to scheduled
    const session = await db.query.oneToOneSessions.findFirst({
      where: eq(oneToOneSessions.id, sessionToRejectId),
    });
    // Check that it's close to originalScheduledTime (ignoring minor milliseconds difference)
    expect(Math.abs(new Date(session!.scheduledAt).getTime() - originalScheduledTime.getTime())).toBeLessThan(1000);
    expect(session?.status).toBe("scheduled"); // remains scheduled, not rescheduled

    // Verify teacher notified of rejection
    const teacherNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, teacher1Id),
    });
    expect(teacherNotifs.length).toBeGreaterThan(0);
    expect(teacherNotifs[0].type).toBe("reschedule_request_rejected");
    expect(teacherNotifs[0].title).toContain("Reschedule Rejected");
    expect(teacherNotifs[0].message).toContain("Cannot approve due to slot conflicts");

    // Verify student notified of rejection
    const studentNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, student1Id),
    });
    expect(studentNotifs.length).toBeGreaterThan(0);
    expect(studentNotifs[0].type).toBe("reschedule_request_rejected");
    expect(studentNotifs[0].title).toContain("Reschedule Rejected");
    expect(studentNotifs[0].message).toContain("The request to reschedule your 1-to-1 session");

    // Cleanup session to reject reschedule
    await db.delete(oneToOneSessions).where(eq(oneToOneSessions.id, sessionToRejectId));
  });
});
