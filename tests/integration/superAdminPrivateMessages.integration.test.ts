import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, modules, batches, batchEnrollments, privateMessages, privateMessageAuditLogs } from "../../db/schema";
import { eq, or, and, inArray } from "drizzle-orm";

describe("Super Admin Private Messaging Integration Tests", () => {
  let courseId: number;
  let batchId: number;

  let superAdminId: number;
  let adminId: number;
  let teacherId: number;
  let studentId: number;

  const cleanup = async () => {
    const db = getDb();

    // Delete audit logs
    const adminIds = [superAdminId, adminId].filter(Boolean);
    if (adminIds.length > 0) {
      await db.delete(privateMessageAuditLogs).where(inArray(privateMessageAuditLogs.adminId, adminIds));
    }

    // Delete private messages
    const userIds = [superAdminId, adminId, teacherId, studentId].filter(Boolean);
    if (userIds.length > 0) {
      await db.delete(privateMessages).where(
        or(
          inArray(privateMessages.senderId, userIds),
          inArray(privateMessages.receiverId, userIds)
        )
      );
    }

    // Delete enrollments
    if (studentId) {
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId));
    }

    // Delete users
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }

    // Delete batches and courses
    if (batchId) await db.delete(batches).where(eq(batches.id, batchId));
    if (courseId) await db.delete(modules).where(eq(modules.id, courseId));
  };

  beforeAll(async () => {
    const db = getDb();

    // Create course
    const courseRes = await db.insert(modules).values({
      name: "Super Admin PM Test Course",
      status: "active",
    }).returning({ id: modules.id });
    courseId = courseRes[0].id;

    // Create users
    const u1 = await db.insert(users).values({
      unionId: "SA999", name: "PM Super Admin", role: "super_admin", status: "active", username: "pm_superadmin", phone: "9998887771"
    }).returning({ id: users.id });
    superAdminId = u1[0].id;

    const u2 = await db.insert(users).values({
      unionId: "A999", name: "PM Regular Admin", role: "admin", status: "active", username: "pm_regadmin", phone: "9998887772"
    }).returning({ id: users.id });
    adminId = u2[0].id;

    const u3 = await db.insert(users).values({
      unionId: "T999", name: "PM Teacher", role: "teacher", status: "active", username: "pm_teacher", phone: "9998887773"
    }).returning({ id: users.id });
    teacherId = u3[0].id;

    const u4 = await db.insert(users).values({
      unionId: "S999", name: "PM Student", role: "student", status: "active", username: "pm_student", phone: "9998887774"
    }).returning({ id: users.id });
    studentId = u4[0].id;

    // Create batch
    const b = await db.insert(batches).values({
      moduleId: courseId, name: "PM Batch", teacherId: teacherId, status: "active", maxStudents: 20
    }).returning({ id: batches.id });
    batchId = b[0].id;

    // Enroll student
    await db.insert(batchEnrollments).values({
      batchId: batchId, studentId: studentId, status: "active"
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should allow Super Admin to list system-wide conversations in User A ↔ User B format", async () => {
    const db = getDb();
    
    // Insert a message between teacher and student
    await db.insert(privateMessages).values({
      senderId: teacherId,
      receiverId: studentId,
      content: "Hello student",
      type: "text",
      isRead: false,
    });

    const callerSA = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "PM Super Admin", sessionToken: "" },
    });

    const conversations = await callerSA.privateMessage.listConversations();
    expect(conversations.length).toBeGreaterThanOrEqual(1);

    // Verify the name formatting and sender/receiver details
    const conv = conversations.find(
      (c) =>
        (c.sender.id === teacherId && c.receiver.id === studentId) ||
        (c.sender.id === studentId && c.receiver.id === teacherId)
    );
    expect(conv).toBeDefined();
    expect(conv?.otherUser.name).toBe("PM Teacher ↔ PM Student");
    expect(conv?.otherUser.role).toBe("monitoring");
  });

  it("should allow Super Admin to access any conversation and log 'access' action", async () => {
    const db = getDb();
    
    // Clear audit logs first
    await db.delete(privateMessageAuditLogs).where(eq(privateMessageAuditLogs.adminId, superAdminId));

    const callerSA = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "PM Super Admin", sessionToken: "" },
    });

    // Super Admin accesses the teacher-student conversation thread
    const history = await callerSA.privateMessage.getConversation({
      otherUserId: studentId,
      senderId: teacherId,
    });
    expect(history.length).toBeGreaterThanOrEqual(1);

    // Check that audit log has been written
    const logs = await db.select().from(privateMessageAuditLogs).where(
      and(
        eq(privateMessageAuditLogs.adminId, superAdminId),
        eq(privateMessageAuditLogs.action, "access")
      )
    );
    expect(logs.length).toBe(1);
    expect(logs[0].senderId).toBe(teacherId);
    expect(logs[0].receiverId).toBe(studentId);
    expect(logs[0].details).toContain(`Accessed conversation thread between user ${teacherId} and user ${studentId}`);
  });

  it("should allow Super Admin to send a message to any user and log 'send' action", async () => {
    const db = getDb();
    await db.delete(privateMessageAuditLogs).where(eq(privateMessageAuditLogs.adminId, superAdminId));

    const callerSA = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "PM Super Admin", sessionToken: "" },
    });

    const msg = await callerSA.privateMessage.sendMessage({
      receiverId: studentId,
      content: "Super Admin direct message",
      type: "text",
    });

    expect(msg).toBeDefined();
    expect(msg.content).toBe("Super Admin direct message");
    expect(msg.senderId).toBe(superAdminId);
    expect(msg.receiverId).toBe(studentId);

    // Check that audit log has been written
    const logs = await db.select().from(privateMessageAuditLogs).where(
      and(
        eq(privateMessageAuditLogs.adminId, superAdminId),
        eq(privateMessageAuditLogs.action, "send")
      )
    );
    expect(logs.length).toBe(1);
    expect(logs[0].senderId).toBe(superAdminId);
    expect(logs[0].receiverId).toBe(studentId);
    expect(logs[0].messageId).toBe(msg.id);
  });

  it("should allow Super Admin to edit any message and log 'edit' action", async () => {
    const db = getDb();
    
    // Insert a message to edit
    const insertRes = await db.insert(privateMessages).values({
      senderId: teacherId,
      receiverId: studentId,
      content: "Original teacher message",
      type: "text",
      isRead: false,
    }).returning({ id: privateMessages.id });
    const messageId = insertRes[0].id;

    await db.delete(privateMessageAuditLogs).where(eq(privateMessageAuditLogs.adminId, superAdminId));

    const callerSA = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "PM Super Admin", sessionToken: "" },
    });

    const editRes = await callerSA.privateMessage.editMessage({
      messageId: messageId,
      content: "Edited teacher message by Super Admin",
    });
    expect(editRes.success).toBe(true);

    // Verify DB update
    const updatedMsg = await db.query.privateMessages.findFirst({
      where: eq(privateMessages.id, messageId),
    });
    expect(updatedMsg?.content).toBe("Edited teacher message by Super Admin");

    // Verify audit log
    const logs = await db.select().from(privateMessageAuditLogs).where(
      and(
        eq(privateMessageAuditLogs.adminId, superAdminId),
        eq(privateMessageAuditLogs.action, "edit")
      )
    );
    expect(logs.length).toBe(1);
    expect(logs[0].senderId).toBe(teacherId);
    expect(logs[0].receiverId).toBe(studentId);
    expect(logs[0].messageId).toBe(messageId);
    expect(logs[0].details).toContain(`Edited message from "Original teacher message" to "Edited teacher message by Super Admin"`);
  });

  it("should NOT allow regular admin, teacher, or student to edit messages", async () => {
    const db = getDb();
    const insertRes = await db.insert(privateMessages).values({
      senderId: teacherId,
      receiverId: studentId,
      content: "Another message",
      type: "text",
      isRead: false,
    }).returning({ id: privateMessages.id });
    const messageId = insertRes[0].id;

    // Test Admin
    const callerAdmin = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "PM Regular Admin", sessionToken: "" },
    });
    await expect(
      callerAdmin.privateMessage.editMessage({ messageId, content: "Admin tried to edit" })
    ).rejects.toThrow("Only Super Admins can edit private messages.");

    // Test Teacher
    const callerTeacher = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "PM Teacher", sessionToken: "" },
    });
    await expect(
      callerTeacher.privateMessage.editMessage({ messageId, content: "Teacher tried to edit" })
    ).rejects.toThrow("Only Super Admins can edit private messages.");

    // Test Student
    const callerStudent = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "PM Student", sessionToken: "" },
    });
    await expect(
      callerStudent.privateMessage.editMessage({ messageId, content: "Student tried to edit" })
    ).rejects.toThrow("Only Super Admins can edit private messages.");
  });

  it("should allow Super Admin to delete (soft-delete) any message and log 'delete' action", async () => {
    const db = getDb();
    const insertRes = await db.insert(privateMessages).values({
      senderId: teacherId,
      receiverId: studentId,
      content: "Message to delete",
      type: "text",
      isRead: false,
    }).returning({ id: privateMessages.id });
    const messageId = insertRes[0].id;

    await db.delete(privateMessageAuditLogs).where(eq(privateMessageAuditLogs.adminId, superAdminId));

    const callerSA = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "PM Super Admin", sessionToken: "" },
    });

    const deleteRes = await callerSA.privateMessage.deleteMessage({ messageId });
    expect(deleteRes.success).toBe(true);

    // Verify soft-deleted message has deletedAt populated
    const deletedMsg = await db.query.privateMessages.findFirst({
      where: eq(privateMessages.id, messageId),
    });
    expect(deletedMsg?.deletedAt).not.toBeNull();

    // Verify it is NOT returned in getConversation
    const history = await callerSA.privateMessage.getConversation({
      otherUserId: studentId,
      senderId: teacherId,
    });
    expect(history.find((m) => m.id === messageId)).toBeUndefined();

    // Verify audit log
    const logs = await db.select().from(privateMessageAuditLogs).where(
      and(
        eq(privateMessageAuditLogs.adminId, superAdminId),
        eq(privateMessageAuditLogs.action, "delete")
      )
    );
    expect(logs.length).toBe(1);
    expect(logs[0].senderId).toBe(teacherId);
    expect(logs[0].receiverId).toBe(studentId);
    expect(logs[0].messageId).toBe(messageId);
    expect(logs[0].details).toContain(`Deleted message: "Message to delete"`);
  });

  it("should NOT allow regular admin, teacher, or student to delete messages", async () => {
    const db = getDb();
    const insertRes = await db.insert(privateMessages).values({
      senderId: teacherId,
      receiverId: studentId,
      content: "Yet another message",
      type: "text",
      isRead: false,
    }).returning({ id: privateMessages.id });
    const messageId = insertRes[0].id;

    // Test Admin
    const callerAdmin = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "PM Regular Admin", sessionToken: "" },
    });
    await expect(
      callerAdmin.privateMessage.deleteMessage({ messageId })
    ).rejects.toThrow("Only Super Admins can delete private messages.");

    // Test Teacher
    const callerTeacher = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "PM Teacher", sessionToken: "" },
    });
    await expect(
      callerTeacher.privateMessage.deleteMessage({ messageId })
    ).rejects.toThrow("Only Super Admins can delete private messages.");

    // Test Student
    const callerStudent = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "PM Student", sessionToken: "" },
    });
    await expect(
      callerStudent.privateMessage.deleteMessage({ messageId })
    ).rejects.toThrow("Only Super Admins can delete private messages.");
  });

  it("should allow Super Admin to search/select any user except themselves in listAvailableContacts", async () => {
    const callerSA = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: superAdminId, role: "super_admin", name: "PM Super Admin", sessionToken: "" },
    });

    const contacts = await callerSA.privateMessage.listAvailableContacts();
    
    // Should contain teacher, student, and regular admin
    const contactIds = contacts.map(c => c.id);
    expect(contactIds).toContain(teacherId);
    expect(contactIds).toContain(studentId);
    expect(contactIds).toContain(adminId);
    expect(contactIds).not.toContain(superAdminId);
  });
});
