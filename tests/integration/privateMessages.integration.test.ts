import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, privateMessages, notifications } from "../../db/schema";
import { eq, or, and } from "drizzle-orm";

describe("Private Messaging Integration Tests", () => {
  let courseId: number;
  let batchId1: number;
  let batchId2: number;

  let adminId: number;
  let teacherId1: number;
  let teacherId2: number;
  let studentId1: number;
  let studentId2: number;

  const cleanup = async () => {
    const db = getDb();

    // Delete private messages
    await db.delete(privateMessages).where(
      or(
        eq(privateMessages.senderId, adminId),
        eq(privateMessages.receiverId, adminId),
        eq(privateMessages.senderId, teacherId1),
        eq(privateMessages.receiverId, teacherId1),
        eq(privateMessages.senderId, teacherId2),
        eq(privateMessages.receiverId, teacherId2),
        eq(privateMessages.senderId, studentId1),
        eq(privateMessages.receiverId, studentId1),
        eq(privateMessages.senderId, studentId2),
        eq(privateMessages.receiverId, studentId2)
      )
    );

    // Delete enrollments and profiles
    if (studentId1) await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId1));
    if (studentId2) await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId2));

    // Delete users
    const testIds = [adminId, teacherId1, teacherId2, studentId1, studentId2].filter(Boolean);
    if (testIds.length > 0) {
      await db.delete(users).where(inArray(users.id, testIds));
    }

    // Delete batches and course
    if (batchId1) await db.delete(batches).where(eq(batches.id, batchId1));
    if (batchId2) await db.delete(batches).where(eq(batches.id, batchId2));
    if (courseId) await db.delete(modules).where(eq(modules.id, courseId));

    // Clean up notifications
    await db.delete(notifications).where(eq(notifications.type, "private_message"));
  };

  beforeAll(async () => {
    const db = getDb();
    
    // Create course
    const courseRes = await db.insert(modules).values({
      name: "Private Chat Test Course",
      status: "active",
    }).returning({ id: modules.id });
    courseId = courseRes[0].id;

    // Create users
    const u1 = await db.insert(users).values({
      unionId: "A9991", name: "PM Admin", role: "admin", status: "active", username: "pm_admin", phone: "9990001111"
    }).returning({ id: users.id });
    adminId = u1[0].id;

    const u2 = await db.insert(users).values({
      unionId: "T9991", name: "PM Teacher 1", role: "teacher", status: "active", username: "pm_teacher1", phone: "9990001112"
    }).returning({ id: users.id });
    teacherId1 = u2[0].id;

    const u3 = await db.insert(users).values({
      unionId: "T9992", name: "PM Teacher 2", role: "teacher", status: "active", username: "pm_teacher2", phone: "9990001113"
    }).returning({ id: users.id });
    teacherId2 = u3[0].id;

    const u4 = await db.insert(users).values({
      unionId: "S9991", name: "PM Student 1", role: "student", status: "active", username: "pm_student1", phone: "9990001114"
    }).returning({ id: users.id });
    studentId1 = u4[0].id;

    const u5 = await db.insert(users).values({
      unionId: "S9992", name: "PM Student 2", role: "student", status: "active", username: "pm_student2", phone: "9990001115"
    }).returning({ id: users.id });
    studentId2 = u5[0].id;

    // Create batches
    const b1 = await db.insert(batches).values({
      moduleId: courseId, name: "PM Batch 1", teacherId: teacherId1, status: "active", maxStudents: 20
    }).returning({ id: batches.id });
    batchId1 = b1[0].id;

    const b2 = await db.insert(batches).values({
      moduleId: courseId, name: "PM Batch 2", teacherId: teacherId2, status: "active", maxStudents: 20
    }).returning({ id: batches.id });
    batchId2 = b2[0].id;

    // Enroll Student 1 in Batch 1 (taught by Teacher 1)
    await db.insert(batchEnrollments).values({
      batchId: batchId1, studentId: studentId1, status: "active"
    });

    // Enroll Student 2 in Batch 2 (taught by Teacher 2)
    await db.insert(batchEnrollments).values({
      batchId: batchId2, studentId: studentId2, status: "active"
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should allow Admin to send message to any student", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "PM Admin", sessionToken: "" },
    });

    const msg = await caller.privateMessage.sendMessage({
      receiverId: studentId1,
      content: "Hello student from Admin",
      type: "text",
    });

    expect(msg).toBeDefined();
    expect(msg.content).toBe("Hello student from Admin");
    expect(msg.senderId).toBe(adminId);
    expect(msg.receiverId).toBe(studentId1);

    // Verify notification is created
    const db = getDb();
    const notif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, studentId1), eq(notifications.type, "private_message")),
    });
    expect(notif).toBeDefined();
    expect(notif?.message).toContain("PM Admin");
  });

  it("should allow Student to reply/send message to Admin", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId1, role: "student", name: "PM Student 1", sessionToken: "" },
    });

    const msg = await caller.privateMessage.sendMessage({
      receiverId: adminId,
      content: "Thanks Admin!",
      type: "text",
    });

    expect(msg).toBeDefined();
    expect(msg.content).toBe("Thanks Admin!");
    expect(msg.senderId).toBe(studentId1);
  });

  it("should allow Teacher to message a student enrolled in their batch", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId1, role: "teacher", name: "PM Teacher 1", sessionToken: "" },
    });

    const msg = await caller.privateMessage.sendMessage({
      receiverId: studentId1,
      content: "Homework update",
      type: "text",
    });

    expect(msg).toBeDefined();
    expect(msg.senderId).toBe(teacherId1);
  });

  it("should NOT allow Teacher to message a student NOT enrolled in their batch", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId1, role: "teacher", name: "PM Teacher 1", sessionToken: "" },
    });

    await expect(
      caller.privateMessage.sendMessage({
        receiverId: studentId2, // studentId2 belongs to Teacher 2's batch
        content: "Hello",
        type: "text",
      })
    ).rejects.toThrow("You are not authorized to start or reply to a conversation with this user.");
  });

  it("should allow student to message their batch teacher", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId1, role: "student", name: "PM Student 1", sessionToken: "" },
    });

    const msg = await caller.privateMessage.sendMessage({
      receiverId: teacherId1,
      content: "Question about lesson",
      type: "text",
    });

    expect(msg).toBeDefined();
    expect(msg.senderId).toBe(studentId1);
  });

  it("should NOT allow student to message a teacher not teaching their batch", async () => {
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId1, role: "student", name: "PM Student 1", sessionToken: "" },
    });

    await expect(
      caller.privateMessage.sendMessage({
        receiverId: teacherId2, // teacherId2 is NOT studentId1's teacher
        content: "Hello",
        type: "text",
      })
    ).rejects.toThrow("You are not authorized to start or reply to a conversation with this user.");
  });

  it("should correctly count unread messages and mark them as read when fetching conversation", async () => {
    const db = getDb();
    
    // Clear previous PMs between Admin and Student 1
    await db.delete(privateMessages).where(
      or(
        and(eq(privateMessages.senderId, adminId), eq(privateMessages.receiverId, studentId1)),
        and(eq(privateMessages.senderId, studentId1), eq(privateMessages.receiverId, adminId))
      )
    );

    const callerAdmin = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "PM Admin", sessionToken: "" },
    });

    const callerStudent = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId1, role: "student", name: "PM Student 1", sessionToken: "" },
    });

    // Admin sends two messages
    await callerAdmin.privateMessage.sendMessage({ receiverId: studentId1, content: "Msg 1" });
    await callerAdmin.privateMessage.sendMessage({ receiverId: studentId1, content: "Msg 2" });

    // Verify unread count is 2 in conversations list for Student 1
    const conversations = await callerStudent.privateMessage.listConversations();
    const adminConv = conversations.find(c => c.otherUser.id === adminId);
    expect(adminConv).toBeDefined();
    expect(adminConv?.unreadCount).toBe(2);

    // Student 1 fetches conversation
    const history = await callerStudent.privateMessage.getConversation({ otherUserId: adminId });
    expect(history.length).toBe(2);

    // Verify unread count has been marked as read (is now 0)
    const conversationsAfter = await callerStudent.privateMessage.listConversations();
    const adminConvAfter = conversationsAfter.find(c => c.otherUser.id === adminId);
    expect(adminConvAfter?.unreadCount ?? 0).toBe(0);
  });
});

// Helper for drizzle inArray
import { inArray } from "drizzle-orm";
