import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users, notifications } from "../../db/schema";
import { eq } from "drizzle-orm";
import { setIo } from "../../server/lib/socketInstance";
import { sendNotification } from "../../server/lib/notificationEngine";
import bcryptjs from "bcryptjs";

describe("Teacher Settings Integration Tests", () => {
  const teacherUnionId1 = "TCH_SETTINGS_TEST_1";
  const teacherUnionId2 = "TCH_SETTINGS_TEST_2";

  let teacherId1: number;
  let teacherId2: number;

  const emittedEvents: { room: string; event: string; data: any }[] = [];
  const mockIo = {
    to: (room: string) => ({
      emit: (event: string, data: any) => {
        emittedEvents.push({ room, event, data });
      },
    }),
  } as any;

  const cleanup = async () => {
    const db = getDb();
    if (teacherId1) {
      await db.delete(notifications).where(eq(notifications.userId, teacherId1));
      await db.delete(users).where(eq(users.id, teacherId1));
    } else {
      await db.delete(users).where(eq(users.unionId, teacherUnionId1));
    }
    if (teacherId2) {
      await db.delete(notifications).where(eq(notifications.userId, teacherId2));
      await db.delete(users).where(eq(users.id, teacherId2));
    } else {
      await db.delete(users).where(eq(users.unionId, teacherUnionId2));
    }
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();
    setIo(mockIo);

    // Create Teacher 1
    const hashed = await bcryptjs.hash("password123", 10);
    const t1Res = await db
      .insert(users)
      .values({
        unionId: teacherUnionId1,
        username: "tch_settings_1",
        password: hashed,
        name: "Teacher Settings One",
        phone: "9876543210",
        role: "teacher",
        status: "active",
      })
      .returning({ id: users.id });
    teacherId1 = t1Res[0].id;

    // Create Teacher 2
    const t2Res = await db
      .insert(users)
      .values({
        unionId: teacherUnionId2,
        username: "tch_settings_2",
        password: hashed,
        name: "Teacher Settings Two",
        phone: "9876543211",
        role: "teacher",
        status: "active",
      })
      .returning({ id: users.id });
    teacherId2 = t2Res[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    emittedEvents.length = 0;
  });

  describe("Teacher Profile settings", () => {
    it("should successfully update profile with valid details", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      const res = await caller.user.updateMyProfile({
        name: "Teacher Settings Updated",
        username: "tch_settings_1_new",
        phone: "9123456789",
      });

      expect(res.success).toBe(true);

      // Verify in DB
      const db = getDb();
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, teacherId1),
      });

      expect(updatedUser?.name).toBe("Teacher Settings Updated");
      expect(updatedUser?.username).toBe("tch_settings_1_new");
      expect(updatedUser?.phone).toBe("+91 9123456789");
    });

    it("should reject duplicate username", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      // Try to take teacherId2's username ("tch_settings_2")
      await expect(
        caller.user.updateMyProfile({
          name: "Teacher Settings Updated",
          username: "tch_settings_2",
          phone: "9123456789",
        })
      ).rejects.toThrow("Username already taken");
    });

    it("should reject invalid phone numbers", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      await expect(
        caller.user.updateMyProfile({
          name: "Teacher Settings Updated",
          username: "tch_settings_1_new",
          phone: "1234567890", // invalid prefix
        })
      ).rejects.toThrow("Please enter a valid 10-digit mobile number.");

      await expect(
        caller.user.updateMyProfile({
          name: "Teacher Settings Updated",
          username: "tch_settings_1_new",
          phone: "9876543", // too short
        })
      ).rejects.toThrow("Please enter a valid 10-digit mobile number.");
    });
  });

  describe("Teacher Security (Password Change)", () => {
    it("should reject password change when current password is wrong", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      await expect(
        caller.user.changeMyPassword({
          currentPassword: "wrong_password",
          newPassword: "newpassword123",
          confirmPassword: "newpassword123",
        })
      ).rejects.toThrow("Incorrect current password");
    });

    it("should reject password change when new password and confirm password do not match", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      await expect(
        caller.user.changeMyPassword({
          currentPassword: "password123",
          newPassword: "newpassword123",
          confirmPassword: "mismatchpassword",
        })
      ).rejects.toThrow("New passwords do not match");
    });

    it("should successfully change password, update DB hash, and trigger critical notification", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      const res = await caller.user.changeMyPassword({
        currentPassword: "password123",
        newPassword: "newpassword123",
        confirmPassword: "newpassword123",
      });

      expect(res.success).toBe(true);

      // Verify DB hash can be compared successfully with the new password
      const db = getDb();
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, teacherId1),
      });
      expect(updatedUser?.password).toBeDefined();
      const compare = await bcryptjs.compare("newpassword123", updatedUser!.password!);
      expect(compare).toBe(true);

      // Verify critical security notification was created and sent via socket
      const notifs = await db.query.notifications.findMany({
        where: eq(notifications.userId, teacherId1),
      });
      const securityNotif = notifs.find((n) => n.type === "security");
      expect(securityNotif).toBeDefined();
      expect(securityNotif?.title).toBe("Password Changed");

      // Verify socket emission occurred because security type bypasses pause/rules
      const hasEmitted = emittedEvents.some(
        (evt) => evt.room === `user:${teacherId1}` && evt.event === "notification:new"
      );
      expect(hasEmitted).toBe(true);
    });
  });

  describe("Notification pausing and suppression rules", () => {
    it("should pause notifications for 1 hour and suppress non-critical but allow critical events", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      // 1. Pause notifications for 1 hour
      const res = await caller.user.updateNotificationPause({
        pauseOption: "1_hour",
      });
      expect(res.success).toBe(true);
      expect(res.pausedUntil).toBeDefined();

      const pausedTime = new Date(res.pausedUntil!);
      const diffMs = pausedTime.getTime() - Date.now();
      // Difference should be around 1 hour (3600000 ms)
      expect(diffMs).toBeGreaterThan(50 * 60 * 1000); // > 50 minutes
      expect(diffMs).toBeLessThan(65 * 60 * 1000); // < 65 minutes

      // Clear event log
      emittedEvents.length = 0;

      // 2. Send non-critical notification (e.g. general type)
      await sendNotification(teacherId1, "Non-critical Alert", "This is non-critical", "general");

      // Verify it is saved to DB
      const db = getDb();
      const dbNotifs = await db.query.notifications.findMany({
        where: eq(notifications.userId, teacherId1),
      });
      expect(dbNotifs.some((n) => n.title === "Non-critical Alert")).toBe(true);

      // Verify NO socket event was emitted (suppressed!)
      const hasNonCriticalEmitted = emittedEvents.some((evt) => evt.data.title === "Non-critical Alert");
      expect(hasNonCriticalEmitted).toBe(false);

      // 3. Send critical notification (e.g. security type)
      await sendNotification(teacherId1, "Critical Alert", "This is critical security", "security");

      // Verify it is saved to DB
      const dbNotifs2 = await db.query.notifications.findMany({
        where: eq(notifications.userId, teacherId1),
      });
      expect(dbNotifs2.some((n) => n.title === "Critical Alert")).toBe(true);

      // Verify socket event was emitted (bypassed!)
      const hasCriticalEmitted = emittedEvents.some((evt) => evt.data.title === "Critical Alert");
      expect(hasCriticalEmitted).toBe(true);
    });

    it("should pause notifications indefinitely (far future 9999)", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      const res = await caller.user.updateNotificationPause({
        pauseOption: "indefinite",
      });
      expect(res.success).toBe(true);
      expect(res.pausedUntil).toBe("9999-12-31T23:59:59.000Z");

      emittedEvents.length = 0;

      // Send non-critical
      await sendNotification(teacherId1, "Indefinite Non-critical", "Hello", "announcement");
      const hasNonCritical = emittedEvents.some((evt) => evt.data.title === "Indefinite Non-critical");
      expect(hasNonCritical).toBe(false);

      // Send critical
      await sendNotification(teacherId1, "Indefinite Critical", "Security details", "password_change");
      const hasCritical = emittedEvents.some((evt) => evt.data.title === "Indefinite Critical");
      expect(hasCritical).toBe(true);
    });

    it("should resume notifications and allow non-critical notifications to emit again", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId1, role: "teacher", name: "Teacher Settings One", sessionToken: "" },
      });

      // Resume
      const res = await caller.user.updateNotificationPause({
        pauseOption: "resume",
      });
      expect(res.success).toBe(true);
      expect(res.pausedUntil).toBeNull();

      emittedEvents.length = 0;

      // Send non-critical
      await sendNotification(teacherId1, "Resumed Alert", "Now active", "general");

      // Verify socket event was emitted
      const hasResumedEmitted = emittedEvents.some((evt) => evt.data.title === "Resumed Alert");
      expect(hasResumedEmitted).toBe(true);
    });
  });
});
