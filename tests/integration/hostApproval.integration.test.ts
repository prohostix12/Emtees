import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, classes, attendance, classJoinRequests, classBatches } from "../../db/schema";
import { eq, and, inArray } from "drizzle-orm";

describe("Live Class Host Approval & Waiting Lobby Integration Tests", () => {
  let student1Id: number;
  let student2Id: number;
  let teacherId: number;
  let moduleId: number;
  let batchId: number;
  let classId: number;

  const cleanup = async () => {
    const db = getDb();

    if (classId) {
      await db.delete(classJoinRequests).where(eq(classJoinRequests.classId, classId));
      await db.delete(attendance).where(eq(attendance.classId, classId));
      await db.delete(classBatches).where(eq(classBatches.classId, classId));
      await db.delete(classes).where(eq(classes.id, classId));
    }

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

    // 1. Create Teacher and Students
    const teacherRes = await db.insert(users).values({
      unionId: "TCH_LOBBY_TEST",
      name: "Lobby Teacher",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId = teacherRes[0].id;

    const stu1Res = await db.insert(users).values({
      unionId: "STU1_LOBBY_TEST",
      name: "Lobby Student 1",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    student1Id = stu1Res[0].id;

    const stu2Res = await db.insert(users).values({
      unionId: "STU2_LOBBY_TEST",
      name: "Lobby Student 2",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    student2Id = stu2Res[0].id;

    // 2. Create Module and Batch
    const moduleRes = await db.insert(modules).values({
      name: "Lobby Course",
    }).returning({ id: modules.id });
    moduleId = moduleRes[0].id;

    const batchRes = await db.insert(batches).values({
      moduleId,
      name: "Lobby Batch",
      teacherId,
    }).returning({ id: batches.id });
    batchId = batchRes[0].id;

    // Enroll Student 1 in Batch. Student 2 has no enrollments initially.
    await db.insert(batchEnrollments).values({
      batchId,
      studentId: student1Id,
      status: "active",
    });

    // 3. Create Class Session
    const classRes = await db.insert(classes).values({
      batchId,
      teacherId,
      title: "Lobby Live Class Session",
      scheduledAt: new Date(),
      status: "ongoing",
    }).returning({ id: classes.id });
    classId = classRes[0].id;

    await db.insert(classBatches).values({
      classId,
      batchId,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should deny access to meeting details if student has not been approved yet", async () => {
    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Lobby Student 1", sessionToken: "" },
    });

    // Requesting meeting details should fail since no request exists
    await expect(
      student1Caller.class.getMeetingDetails({ classId })
    ).rejects.toThrow("You are not authorized to join this class session. Request not approved.");

    // Recording join time should also fail
    await expect(
      student1Caller.class.recordJoinTime({ classId })
    ).rejects.toThrow("You are not authorized to join this class session. Request not approved.");
  });

  it("should fail requestJoin if student is not enrolled in the batch", async () => {
    const student2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student2Id, role: "student", name: "Lobby Student 2", sessionToken: "" },
    });

    await expect(
      student2Caller.class.requestJoin({ classId })
    ).rejects.toThrow("You are not enrolled in any batch linked to this class.");
  });

  it("should create a pending request on requestJoin for enrolled student", async () => {
    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Lobby Student 1", sessionToken: "" },
    });

    const res = await student1Caller.class.requestJoin({ classId });
    expect(res.success).toBe(true);
    expect(res.status).toBe("pending");

    // Verify database entry
    const db = getDb();
    const request = await db.query.classJoinRequests.findFirst({
      where: and(eq(classJoinRequests.classId, classId), eq(classJoinRequests.studentId, student1Id)),
    });
    expect(request).toBeDefined();
    expect(request?.status).toBe("pending");
  });

  it("should allow host (teacher) to list pending requests", async () => {
    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Lobby Teacher", sessionToken: "" },
    });

    const list = await teacherCaller.class.listJoinRequests({ classId });
    expect(list.length).toBe(1);
    expect(list[0].studentId).toBe(student1Id);
    expect(list[0].status).toBe("pending");
    expect(list[0].studentName).toBe("Lobby Student 1");
  });

  it("should block non-host from listing requests", async () => {
    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Lobby Student 1", sessionToken: "" },
    });

    await expect(
      student1Caller.class.listJoinRequests({ classId })
    ).rejects.toThrow("Only class hosts can view join requests.");
  });

  it("should allow host to approve student request, enabling student to join", async () => {
    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Lobby Teacher", sessionToken: "" },
    });

    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Lobby Student 1", sessionToken: "" },
    });

    // 1. Approve student 1
    const approveRes = await teacherCaller.class.approveJoinRequest({ classId, studentId: student1Id });
    expect(approveRes.success).toBe(true);

    // 2. Fetch meeting details as student 1 -> Should now succeed
    const details = await student1Caller.class.getMeetingDetails({ classId });
    expect(details.roomName).toBeDefined();

    // 3. Record join time as student 1 -> Should now succeed
    const joinRes = await student1Caller.class.recordJoinTime({ classId });
    expect(joinRes.success).toBe(true);
  });

  it("should allow host to decline student request, blocking student access", async () => {
    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Lobby Teacher", sessionToken: "" },
    });

    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Lobby Student 1", sessionToken: "" },
    });

    // 1. Decline student 1
    const declineRes = await teacherCaller.class.declineJoinRequest({ classId, studentId: student1Id });
    expect(declineRes.success).toBe(true);

    // 2. Try fetching details again -> Should fail
    await expect(
      student1Caller.class.getMeetingDetails({ classId })
    ).rejects.toThrow("You are not authorized to join this class session. Request not approved.");
  });

  it("should support approveAllJoinRequests to approve multiple pending students simultaneously", async () => {
    const db = getDb();
    
    // Enroll Student 2 in Batch
    await db.insert(batchEnrollments).values({
      batchId,
      studentId: student2Id,
      status: "active",
    });

    const student1Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student1Id, role: "student", name: "Lobby Student 1", sessionToken: "" },
    });

    const student2Caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: student2Id, role: "student", name: "Lobby Student 2", sessionToken: "" },
    });

    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Lobby Teacher", sessionToken: "" },
    });

    // 1. Both submit requests
    await student1Caller.class.requestJoin({ classId });
    await student2Caller.class.requestJoin({ classId });

    // 2. Call approveAllJoinRequests
    const res = await teacherCaller.class.approveAllJoinRequests({ classId });
    expect(res.success).toBe(true);

    // 3. Verify both requests are approved in DB
    const approvedRequests = await db.query.classJoinRequests.findMany({
      where: and(eq(classJoinRequests.classId, classId), inArray(classJoinRequests.studentId, [student1Id, student2Id])),
    });
    expect(approvedRequests.length).toBe(2);
    expect(approvedRequests.every(r => r.status === "approved")).toBe(true);
  });
});
