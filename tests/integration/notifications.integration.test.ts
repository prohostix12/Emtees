import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import {
  users,
  modules,
  batches,
  batchEnrollments,
  notifications,
  announcements,
  announcementDismissals,
  classes,
} from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { sendClassReminders } from "../../server/lib/scheduler";

describe("Notifications Integration Tests", () => {
  const adminUnionId = "ADMIN_NOTIF_999";
  const studentUnionId = "STUDENT_NOTIF_999";
  const teacherUnionId = "TEACHER_NOTIF_999";

  let adminId: number;
  let studentId: number;
  let teacherId: number;
  let moduleId: number;
  let batchId: number;

  const cleanup = async () => {
    const db = getDb();

    // Delete class records
    if (batchId) {
      await db.delete(classes).where(eq(classes.batchId, batchId));
    }

    // Delete student, teacher, admin and notifications data
    if (studentId) {
      await db.delete(notifications).where(eq(notifications.userId, studentId));
      await db.delete(announcementDismissals).where(eq(announcementDismissals.userId, studentId));
      await db.delete(batchEnrollments).where(eq(batchEnrollments.studentId, studentId));
      await db.delete(users).where(eq(users.id, studentId));
    } else {
      await db.delete(users).where(eq(users.unionId, studentUnionId));
    }

    if (teacherId) {
      await db.delete(notifications).where(eq(notifications.userId, teacherId));
      await db.delete(announcementDismissals).where(eq(announcementDismissals.userId, teacherId));
      await db.delete(users).where(eq(users.id, teacherId));
    } else {
      await db.delete(users).where(eq(users.unionId, teacherUnionId));
    }

    if (adminId) {
      await db.delete(users).where(eq(users.id, adminId));
    } else {
      await db.delete(users).where(eq(users.unionId, adminUnionId));
    }

    // Delete batch and module
    if (batchId) {
      await db.delete(batches).where(eq(batches.id, batchId));
    }
    if (moduleId) {
      await db.delete(modules).where(eq(modules.id, moduleId));
    }

    // Delete any orphaned test announcements
    await db.delete(announcements).where(eq(announcements.title, "Test Integration Announcement"));
    await db.delete(announcements).where(eq(announcements.title, "Test Batch Announcement"));
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();

    // 1. Create Admin
    const adminResult = await db
      .insert(users)
      .values({
        unionId: adminUnionId,
        name: "Test Admin Notif",
        role: "admin",
        status: "active",
      })
      .returning({ id: users.id });
    adminId = adminResult[0].id;

    // 2. Create Student
    const studentResult = await db
      .insert(users)
      .values({
        unionId: studentUnionId,
        name: "Test Student Notif",
        role: "student",
        status: "active",
      })
      .returning({ id: users.id });
    studentId = studentResult[0].id;

    // 3. Create Teacher
    const teacherResult = await db
      .insert(users)
      .values({
        unionId: teacherUnionId,
        name: "Test Teacher Notif",
        role: "teacher",
        status: "active",
      })
      .returning({ id: users.id });
    teacherId = teacherResult[0].id;

    // 4. Create Module and Batch
    const moduleResult = await db
      .insert(modules)
      .values({
        name: "Test Module Notif",
      })
      .returning({ id: modules.id });
    moduleId = moduleResult[0].id;

    const batchResult = await db
      .insert(batches)
      .values({
        moduleId,
        name: "Test Batch Notif",
        teacherId,
        timeSlot: "08:00 AM",
      })
      .returning({ id: batches.id });
    batchId = batchResult[0].id;

    // 5. Enroll Student
    await db.insert(batchEnrollments).values({
      batchId,
      studentId,
      status: "active",
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should create a personal notification, list it, mark it as read, and delete it", async () => {
    const db = getDb();

    // 1. Insert a raw notification for the student
    const [notif] = await db
      .insert(notifications)
      .values({
        userId: studentId,
        title: "Test Personal Notif",
        message: "This is a test message.",
        type: "general",
      })
      .returning();

    // 2. Student lists their notifications
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Test Student Notif", sessionToken: "" },
    });

    const listResult = await caller.notification.list({ limit: 10 });
    const found = listResult.items.find((item: any) => item.id === notif.id);
    expect(found).toBeDefined();
    expect(found?.isRead).toBe(false);
    expect(found?.title).toBe("Test Personal Notif");

    // 3. Mark the notification as read
    await caller.notification.markRead({ id: notif.id });

    // Verify it is read
    const listResultAfterRead = await caller.notification.list({ limit: 10 });
    const foundAfterRead = listResultAfterRead.items.find((item: any) => item.id === notif.id);
    expect(foundAfterRead?.isRead).toBe(true);

    // 4. Delete the notification
    await caller.notification.delete({ id: notif.id });

    // Verify it is gone
    const listResultAfterDelete = await caller.notification.list({ limit: 10 });
    const foundAfterDelete = listResultAfterDelete.items.find((item: any) => item.id === notif.id);
    expect(foundAfterDelete).toBeUndefined();
  });

  it("should create a targeted broadcast announcement and allow student to view and dismiss it", async () => {
    const callerAdmin = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: adminId, role: "admin", name: "Test Admin Notif", sessionToken: "" },
    });

    const callerStudent = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Test Student Notif", sessionToken: "" },
    });

    // 1. Admin creates an announcement targeting all students
    const announcement = await callerAdmin.notification.createAnnouncement({
      title: "Test Integration Announcement",
      description: "Important student update.",
      audienceType: "students",
    });

    expect(announcement.id).toBeDefined();
    expect(announcement.audienceType).toBe("students");

    // 2. Student fetches list, announcement should be merged
    const studentList = await callerStudent.notification.list({ limit: 10 });
    const announcementIdStr = `announcement-${announcement.id}`;
    const foundAnnouncement = studentList.items.find((item: any) => item.id === announcementIdStr);
    expect(foundAnnouncement).toBeDefined();
    expect(foundAnnouncement?.title).toBe("Test Integration Announcement");

    // 3. Student dismisses the announcement
    await callerStudent.notification.dismissAnnouncement({
      announcementId: announcement.id,
    });

    // 4. Student fetches list again, announcement should be dismissed (not visible)
    const studentListAfterDismiss = await callerStudent.notification.list({ limit: 10 });
    const foundAfterDismiss = studentListAfterDismiss.items.find((item: any) => item.id === announcementIdStr);
    expect(foundAfterDismiss).toBeUndefined();
  });

  it("should send class start reminders to both teacher and enrolled students when class is scheduled", async () => {
    const db = getDb();

    // 1. Create a class starting in 5 minutes (for the 10-min reminder)
    const in5Minutes = new Date(Date.now() + 5 * 60 * 1000);
    const [newClass] = await db
      .insert(classes)
      .values({
        batchId,
        teacherId,
        title: "Test Live Class Reminders",
        scheduledAt: in5Minutes,
        status: "scheduled",
      })
      .returning();

    // 2. Run the scheduler's class reminder sender function
    await sendClassReminders();

    // 3. Verify that student and teacher received a notification
    const studentCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: studentId, role: "student", name: "Test Student Notif", sessionToken: "" },
    });

    const teacherCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: teacherId, role: "teacher", name: "Test Teacher Notif", sessionToken: "" },
    });

    const studentNotifs = await studentCaller.notification.list({ limit: 10 });
    const teacherNotifs = await teacherCaller.notification.list({ limit: 10 });

    const studentReminder = studentNotifs.items.find(
      (item: any) => item.type === "class_reminder" && item.title.includes("Test Live Class Reminders")
    );
    const teacherReminder = teacherNotifs.items.find(
      (item: any) => item.type === "class_reminder" && item.title.includes("Test Live Class Reminders")
    );

    expect(studentReminder).toBeDefined();
    expect(studentReminder?.message).toContain("Test Live Class Reminders");
    expect(studentReminder?.message).toContain("Test Batch Notif"); // Batch Name
    expect(studentReminder?.message).toContain("Test Module Notif"); // Course Name

    expect(teacherReminder).toBeDefined();
    expect(teacherReminder?.title).toContain("Class Reminder (Teacher)");
    expect(teacherReminder?.message).toContain("Test Live Class Reminders");
  });
});
