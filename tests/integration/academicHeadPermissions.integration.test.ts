import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, privateMessages, messages, modules, batches } from "../../db/schema";
import { eq, or, inArray } from "drizzle-orm";

describe("Academic Head Permissions Integration Tests", () => {
  let superAdminId: number;
  let superAdminId2: number;
  let adminId: number;
  let academicHeadId: number;
  let teacherId: number;
  let studentId: number;
  let batchId: number;
  let moduleId: number;

  const cleanup = async () => {
    const db = getDb();
    
    // Cleanup messages
    if (batchId) {
      await db.delete(messages).where(eq(messages.batchId, batchId));
    }
    // Cleanup private messages
    const userIds = [superAdminId, superAdminId2, adminId, academicHeadId, teacherId, studentId].filter(Boolean);
    if (userIds.length > 0) {
      await db.delete(privateMessages).where(
        or(
          inArray(privateMessages.senderId, userIds),
          inArray(privateMessages.receiverId, userIds)
        )
      );
    }
    // Cleanup batches & modules
    if (batchId) {
      await db.delete(batches).where(eq(batches.id, batchId));
    }
    if (moduleId) {
      await db.delete(modules).where(eq(modules.id, moduleId));
    }
    // Cleanup users
    for (const id of userIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // Create users
    const sa1 = await db.insert(users).values({
      unionId: "SA1_PERM_TEST",
      name: "Super Admin One",
      role: "super_admin",
      status: "active",
    }).returning({ id: users.id });
    superAdminId = sa1[0].id;

    const sa2 = await db.insert(users).values({
      unionId: "SA2_PERM_TEST",
      name: "Super Admin Two",
      role: "super_admin",
      status: "active",
    }).returning({ id: users.id });
    superAdminId2 = sa2[0].id;

    const adm = await db.insert(users).values({
      unionId: "ADM_PERM_TEST",
      name: "Admin User",
      role: "admin",
      status: "active",
    }).returning({ id: users.id });
    adminId = adm[0].id;

    const ah = await db.insert(users).values({
      unionId: "AH_PERM_TEST",
      name: "Academic Head User",
      role: "academic_head",
      status: "active",
    }).returning({ id: users.id });
    academicHeadId = ah[0].id;

    const t = await db.insert(users).values({
      unionId: "T_PERM_TEST",
      name: "Teacher User",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId = t[0].id;

    const s = await db.insert(users).values({
      unionId: "S_PERM_TEST",
      name: "Student User",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = s[0].id;

    // Create module and batch for announcements test
    const m = await db.insert(modules).values({ name: "Academic Head Module" }).returning({ id: modules.id });
    moduleId = m[0].id;

    const b = await db.insert(batches).values({
      moduleId: moduleId,
      name: "Academic Head Batch",
      timeSlot: "10:00 AM",
      teacherId: teacherId,
      status: "active",
    }).returning({ id: batches.id });
    batchId = b[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("Super Admin Protection", () => {
    it("should allow a Super Admin to delete another Super Admin", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: superAdminId, role: "super_admin", name: "Super Admin One", sessionToken: "" },
      });

      const res = await caller.user.delete({ id: superAdminId2 });
      expect(res.success).toBe(true);

      // Re-create the second super admin so we can test non-super_admins failing
      const db = getDb();
      const sa2 = await db.insert(users).values({
        unionId: "SA2_PERM_TEST",
        name: "Super Admin Two",
        role: "super_admin",
        status: "active",
      }).returning({ id: users.id });
      superAdminId2 = sa2[0].id;
    });

    it("should prevent an Admin or Academic Head from deleting a Super Admin", async () => {
      const adminCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: adminId, role: "admin", name: "Admin User", sessionToken: "" },
      });

      await expect(
        adminCaller.user.delete({ id: superAdminId })
      ).rejects.toThrow("Access Denied: Only a Super Admin can delete another Super Admin.");

      const ahCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: academicHeadId, role: "academic_head", name: "Academic Head User", sessionToken: "" },
      });

      await expect(
        ahCaller.user.delete({ id: superAdminId })
      ).rejects.toThrow("Only administrators are allowed to delete users.");
    });
  });

  describe("Financial / Payment Restrictions", () => {
    it("should block Academic Head from all fee and payment endpoints", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: academicHeadId, role: "academic_head", name: "Academic Head User", sessionToken: "" },
      });

      await expect(caller.admin.listPayments()).rejects.toThrow("Access Denied");
      await expect(caller.admin.createPayment({ studentId, amount: 100 })).rejects.toThrow("Access Denied");
      await expect(caller.admin.recordPayment({ paymentId: 1, amount: 100 })).rejects.toThrow("Access Denied");
      await expect(caller.admin.listOverdueStudents()).rejects.toThrow("Access Denied");
      await expect(caller.admin.adjustStudentFees({ studentId })).rejects.toThrow("Access Denied");
      await expect(caller.admin.sendManualReminder({ studentId })).rejects.toThrow("Access Denied");
      await expect(caller.admin.exportPaymentReport({})).rejects.toThrow("Access Denied");
      await expect(caller.admin.listSalaries()).rejects.toThrow("Access Denied");
      await expect(caller.admin.calculateSalary({ teacherId, month: "2026-06" })).rejects.toThrow("Access Denied");
      await expect(caller.admin.exportSalaryReport({ teacherId, month: "2026-06" })).rejects.toThrow("Access Denied");
    });

    it("should filter out salaries from exportTeacherReport for Academic Head", async () => {
      const ahCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: academicHeadId, role: "academic_head", name: "Academic Head User", sessionToken: "" },
      });

      const report = await ahCaller.admin.exportTeacherReport({ teacherId });
      expect(report.data.salaries).toEqual([]);

      const saCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: superAdminId, role: "super_admin", name: "Super Admin One", sessionToken: "" },
      });

      const reportSa = await saCaller.admin.exportTeacherReport({ teacherId });
      expect(reportSa.data.salaries).toBeDefined();
    });
  });

  describe("Private Messaging Restrictions & Snooping", () => {
    it("should block Academic Head from sending private messages", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: academicHeadId, role: "academic_head", name: "Academic Head User", sessionToken: "" },
      });

      await expect(
        caller.privateMessage.sendMessage({ receiverId: studentId, content: "Hello Student" })
      ).rejects.toThrow("Read-Only Access: Academic Head cannot participate in conversations.");
    });

    it("should allow Academic Head to monitor (snoop) all private chats in read-only mode", async () => {
      const db = getDb();

      // Insert a private message between Teacher and Student
      await db.insert(privateMessages).values({
        senderId: teacherId,
        receiverId: studentId,
        content: "Private chat content",
        isRead: false,
      });

      const ahCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: academicHeadId, role: "academic_head", name: "Academic Head User", sessionToken: "" },
      });

      const conversations = await ahCaller.privateMessage.listConversations();
      expect(conversations.length).toBeGreaterThan(0);
      
      const conv = conversations.find(c => c.sender?.id === teacherId && c.receiver?.id === studentId);
      expect(conv).toBeDefined();
      expect(conv?.otherUser.name).toBe("Teacher User ↔ Student User");
      expect(conv?.otherUser.role).toBe("monitoring");

      // Test getConversation with senderId override for monitoring
      const messages = await ahCaller.privateMessage.getConversation({
        otherUserId: studentId,
        senderId: teacherId,
      });
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("Private chat content");
    });
  });

  describe("Group Chat & Announcements Restriction", () => {
    it("should allow Academic Head to send group chat announcements but block regular messages", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: academicHeadId, role: "academic_head", name: "Academic Head User", sessionToken: "" },
      });

      // Send announcement - allowed
      const annRes = await caller.learning.sendMessage({
        batchId: batchId,
        content: "Important Announcement!",
        isAnnouncement: true,
      });
      expect(annRes).toBeDefined();
      expect(annRes?.isAnnouncement).toBe(true);

      // Send regular message - blocked
      await expect(
        caller.learning.sendMessage({
          batchId: batchId,
          content: "Just a regular hello",
          isAnnouncement: false,
        })
      ).rejects.toThrow("Academic Head can only send announcements.");
    });
  });
});
