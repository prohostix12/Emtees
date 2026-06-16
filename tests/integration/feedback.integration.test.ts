import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import {
  users,
  modules,
  batches,
  batchEnrollments,
  classes,
  feedback,
  notifications,
  systemSettings,
  oneToOneSessions
} from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { setIo } from "../../server/lib/socketInstance";

describe("Feedback System Integration Tests", () => {
  let studentId: number;
  let teacherId: number;
  let adminId: number;
  let moduleId: number;
  let batchId: number;
  let classId: number;

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
    
    // Delete feedbacks
    await db.delete(feedback);
    // Delete settings
    await db.delete(systemSettings);
    // Delete notifications
    await db.delete(notifications);
    // Delete classes
    await db.delete(classes);
    // Delete enrollments
    await db.delete(batchEnrollments);
    // Delete batches
    await db.delete(batches);
    // Delete modules
    await db.delete(modules);
    // Delete users
    await db.delete(users).where(eq(users.username, "stu_feedback_test"));
    await db.delete(users).where(eq(users.username, "tch_feedback_test"));
    await db.delete(users).where(eq(users.username, "adm_feedback_test"));
  };

  beforeAll(async () => {
    const db = getDb();
    await cleanup();
    setIo(mockIo);

    // Create Admin
    const [adminRow] = await db.insert(users).values({
      unionId: "ADM_FEEDBACK_TEST",
      username: "adm_feedback_test",
      name: "Admin Feedback Test",
      role: "admin",
      status: "active",
    }).returning();
    adminId = adminRow.id;

    // Create Teacher
    const [teacherRow] = await db.insert(users).values({
      unionId: "TCH_FEEDBACK_TEST",
      username: "tch_feedback_test",
      name: "Teacher Feedback Test",
      role: "teacher",
      status: "active",
    }).returning();
    teacherId = teacherRow.id;

    // Create Student
    const [studentRow] = await db.insert(users).values({
      unionId: "STU_FEEDBACK_TEST",
      username: "stu_feedback_test",
      name: "Student Feedback Test",
      role: "student",
      status: "active",
    }).returning();
    studentId = studentRow.id;

    // Create Course (Module)
    const [moduleRow] = await db.insert(modules).values({
      name: "Module Feedback Test",
      status: "active",
    }).returning();
    moduleId = moduleRow.id;

    // Create Batch
    const [batchRow] = await db.insert(batches).values({
      moduleId: moduleId,
      name: "Batch Feedback Test",
      teacherId: teacherId,
      status: "active",
    }).returning();
    batchId = batchRow.id;

    // Enroll Student in Batch
    await db.insert(batchEnrollments).values({
      batchId: batchId,
      studentId: studentId,
      status: "active",
    });

    // Create Completed Class for Batch & Teacher
    const [classRow] = await db.insert(classes).values({
      batchId: batchId,
      teacherId: teacherId,
      title: "Completed Class Session",
      status: "completed",
      scheduledAt: new Date(),
    }).returning();
    classId = classRow.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    emittedEvents.length = 0;
  });

  describe("Student Feedback Submission", () => {
    it("should fail submission if student is not enrolled in the batch", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: studentId, role: "student", name: "Student Feedback Test", sessionToken: "" },
      });

      // Attempt to submit for an invalid batch ID (e.g. batchId + 1000)
      await expect(
        caller.student.submitFeedback({
          teacherId: teacherId,
          batchId: batchId + 1000,
          rating: 5,
          comment: "Great teacher!",
        })
      ).rejects.toThrow("You are not enrolled in this batch.");
    });

    it("should fail submission if the teacher has not conducted completed classes for the student", async () => {
      const db = getDb();
      // Temporarily create another teacher with no completed classes
      const [otherTeacher] = await db.insert(users).values({
        unionId: "TCH_FEEDBACK_TEST_OTHER",
        username: "tch_feedback_test_other",
        name: "Other Teacher",
        role: "teacher",
        status: "active",
      }).returning();

      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: studentId, role: "student", name: "Student Feedback Test", sessionToken: "" },
      });

      await expect(
        caller.student.submitFeedback({
          teacherId: otherTeacher.id,
          batchId: batchId,
          rating: 4,
          comment: "I shouldn't be able to submit this.",
        })
      ).rejects.toThrow("This teacher has not conducted any completed classes for you.");

      // Cleanup
      await db.delete(users).where(eq(users.id, otherTeacher.id));
    });

    it("should successfully submit feedback when enrolled and teacher conducted completed class", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: studentId, role: "student", name: "Student Feedback Test", sessionToken: "" },
      });

      const res = await caller.student.submitFeedback({
        teacherId: teacherId,
        batchId: batchId,
        rating: 5,
        comment: "Excellent class!",
      });

      expect(res.success).toBe(true);

      // Verify db insertion
      const db = getDb();
      const feedbackRecord = await db.query.feedback.findFirst({
        where: and(
          eq(feedback.studentId, studentId),
          eq(feedback.teacherId, teacherId)
        ),
      });
      expect(feedbackRecord).toBeDefined();
      expect(feedbackRecord?.rating).toBe(5);
      expect(feedbackRecord?.comment).toBe("Excellent class!");
      expect(feedbackRecord?.batchId).toBe(batchId);

      // Verify notifications sent to admin
      const adminNotif = await db.query.notifications.findFirst({
        where: eq(notifications.userId, adminId),
      });
      expect(adminNotif).toBeDefined();
      expect(adminNotif?.title).toBe("New Feedback Submitted");
      expect(adminNotif?.message).toContain("submitted feedback for teacher Teacher Feedback Test");
    });

    it("should enforce single feedback per batch constraint when enabled", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: studentId, role: "student", name: "Student Feedback Test", sessionToken: "" },
      });

      // Submit feedback again (should throw error since limit per batch is true by default)
      await expect(
        caller.student.submitFeedback({
          teacherId: teacherId,
          batchId: batchId,
          rating: 4,
          comment: "Attempting duplicate",
        })
      ).rejects.toThrow("You have already submitted feedback for this teacher in this batch.");
    });
  });

  describe("Student Feedback Editing", () => {
    it("should allow editing feedback rating and comment within the edit window", async () => {
      const db = getDb();
      // Ensure settings have edit duration = 10 minutes
      await db.insert(systemSettings).values({
        key: "feedback_edit_period_minutes",
        value: "10",
      }).onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: "10" }
      });

      const feedbackRecord = await db.query.feedback.findFirst({
        where: and(
          eq(feedback.studentId, studentId),
          eq(feedback.teacherId, teacherId)
        ),
      });
      expect(feedbackRecord).toBeDefined();

      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: studentId, role: "student", name: "Student Feedback Test", sessionToken: "" },
      });

      const res = await caller.student.editFeedback({
        feedbackId: feedbackRecord!.id,
        rating: 4,
        comment: "Updated feedback comment!",
      });
      expect(res.success).toBe(true);

      const updatedRecord = await db.query.feedback.findFirst({
        where: eq(feedback.id, feedbackRecord!.id),
      });
      expect(updatedRecord?.rating).toBe(4);
      expect(updatedRecord?.comment).toBe("Updated feedback comment!");
    });

    it("should deny edits if elapsed time is outside the edit window", async () => {
      const db = getDb();
      // Change edit window to 0 minutes (disabled or elapsed)
      await db.update(systemSettings)
        .set({ value: "0" })
        .where(eq(systemSettings.key, "feedback_edit_period_minutes"));

      const feedbackRecord = await db.query.feedback.findFirst({
        where: and(
          eq(feedback.studentId, studentId),
          eq(feedback.teacherId, teacherId)
        ),
      });

      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: studentId, role: "student", name: "Student Feedback Test", sessionToken: "" },
      });

      await expect(
        caller.student.editFeedback({
          feedbackId: feedbackRecord!.id,
          rating: 5,
          comment: "I should not be allowed to edit this",
        })
      ).rejects.toThrow("Editing feedback is disabled.");
    });
  });

  describe("Feedback Settings & Aggregated Stats permissions", () => {
    it("should allow admin to retrieve feedback settings", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: adminId, role: "admin", name: "Admin Feedback Test", sessionToken: "" },
      });

      const settings = await caller.admin.getFeedbackSettings();
      expect(settings.feedback_limit_per_batch).toBe(true);
      expect(settings.feedback_teacher_stats_enabled).toBe(false);
    });

    it("should reject teacher retrieving aggregated stats if stats view is disabled", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId, role: "teacher", name: "Teacher Feedback Test", sessionToken: "" },
      });

      await expect(
        caller.admin.getTeacherAggregatedStats()
      ).rejects.toThrow("Feedback statistics view is currently disabled by the Super Admin.");
    });

    it("should successfully return aggregated stats to teacher when enabled, but hide comments/names", async () => {
      const db = getDb();
      // Enable teacher stats setting
      await db.insert(systemSettings).values({
        key: "feedback_teacher_stats_enabled",
        value: "true",
      }).onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: "true" }
      });

      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId, role: "teacher", name: "Teacher Feedback Test", sessionToken: "" },
      });

      const stats = await caller.admin.getTeacherAggregatedStats();
      expect(stats.totalCount).toBe(1);
      expect(stats.averageRating).toBe(4);
      expect(stats.distribution[4]).toBe(1);
      expect((stats as any).recentComments).toBeUndefined(); // Verify comments are excluded
    });

    it("should allow admins to view all feedback listings and details", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: adminId, role: "admin", name: "Admin Feedback Test", sessionToken: "" },
      });

      const list = await caller.admin.listFeedback();
      expect(list.length).toBe(1);
      expect(list[0].student.name).toBe("Student Feedback Test");
      expect(list[0].comment).toBe("Updated feedback comment!");
    });
  });
});
