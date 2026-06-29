import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  performanceConfigs,
  performanceReports,
  users,
  profiles,
  batches,
  batchEnrollments,
  classes,
  attendance,
  oneToOneSessions,
  assignments,
  assignmentSubmissions,
  feedback,
  messages,
  privateMessages,
  modules
} from "@db/schema";
import { sendNotification } from "../lib/notificationEngine";

const DEFAULT_STUDENT_CRITERIA = {
  attendanceWeight: 30,
  oneToOneWeight: 25,
  assignmentsWeight: 25,
  engagementWeight: 20,
};

const DEFAULT_TEACHER_CRITERIA = {
  classCompletionWeight: 40,
  punctualityWeight: 30,
  feedbackWeight: 30,
};

export const performanceRouter = createRouter({
  // Get active configuration criteria
  getDefaultConfig: authedQuery
    .input(z.object({ type: z.enum(["student", "teacher"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      const config = await db.query.performanceConfigs.findFirst({
        where: and(
          eq(performanceConfigs.type, input.type),
          eq(performanceConfigs.isDefault, true)
        ),
      });

      if (config) return config;

      // Return synthetic default config if none exists in DB
      return {
        id: 0,
        type: input.type,
        name: `Default ${input.type === "student" ? "Student" : "Teacher"} Evaluation Criteria`,
        criteria: input.type === "student" ? DEFAULT_STUDENT_CRITERIA : DEFAULT_TEACHER_CRITERIA,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),

  // Save/update configuration (Admin only)
  saveConfig: adminQuery
    .input(
      z.object({
        type: z.enum(["student", "teacher"]),
        name: z.string(),
        criteria: z.any(),
        isDefault: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // If set to default, unset other defaults
      if (input.isDefault) {
        await db
          .update(performanceConfigs)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(performanceConfigs.type, input.type));
      }

      const [inserted] = await db
        .insert(performanceConfigs)
        .values({
          type: input.type,
          name: input.name,
          criteria: input.criteria,
          isDefault: input.isDefault,
          createdBy: ctx.user.id,
        })
        .returning();

      return inserted;
    }),

  // List users for selection in report creation
  listTargetUsers: adminQuery
    .input(z.object({ type: z.enum(["student", "teacher"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.query.users.findMany({
        where: and(
          eq(users.role, input.type),
          eq(users.status, "active")
        ),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
        orderBy: [users.name],
      });
    }),

  // Generate performance metrics draft (Admin only)
  generateDraftReport: adminQuery
    .input(
      z.object({
        targetUserId: z.number(),
        type: z.enum(["student", "teacher"]),
        assessmentPeriod: z.string(),
        startDate: z.string(), // ISO String
        endDate: z.string(), // ISO String
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      // Verify target user exists
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, input.targetUserId),
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
      }

      // Fetch active configuration criteria
      let config = await db.query.performanceConfigs.findFirst({
        where: and(
          eq(performanceConfigs.type, input.type),
          eq(performanceConfigs.isDefault, true)
        ),
      });

      const criteria = config
        ? (config.criteria as any)
        : input.type === "student"
        ? DEFAULT_STUDENT_CRITERIA
        : DEFAULT_TEACHER_CRITERIA;

      let autoMetrics: any = {};
      let totalScore = 0;

      if (input.type === "student") {
        // --- STUDENT AUTO-METRICS ---

        // 1. Batches & Attendance
        const enrolls = await db.query.batchEnrollments.findMany({
          where: and(
            eq(batchEnrollments.studentId, input.targetUserId),
            eq(batchEnrollments.status, "active")
          ),
        });
        const batchIds = enrolls.map((e) => e.batchId);

        let totalClasses = 0;
        let attendedClasses = 0;

        if (batchIds.length > 0) {
          const periodClasses = await db.query.classes.findMany({
            where: and(
              inArray(classes.batchId, batchIds),
              eq(classes.status, "completed"),
              sql`${classes.scheduledAt} >= ${start}`,
              sql`${classes.scheduledAt} <= ${end}`
            ),
          });
          totalClasses = periodClasses.length;

          if (totalClasses > 0) {
            const classIds = periodClasses.map((c) => c.id);
            const attendList = await db.query.attendance.findMany({
              where: and(
                eq(attendance.studentId, input.targetUserId),
                inArray(attendance.classId, classIds),
                inArray(attendance.status, ["present", "late"])
              ),
            });
            attendedClasses = attendList.length;
          }
        }

        const attendanceRate = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0;

        // 2. One-to-One Session Attendance
        const otoList = await db.query.oneToOneSessions.findMany({
          where: and(
            eq(oneToOneSessions.studentId, input.targetUserId),
            sql`${oneToOneSessions.scheduledAt} >= ${start}`,
            sql`${oneToOneSessions.scheduledAt} <= ${end}`
          ),
        });
        const totalOto = otoList.length;
        const attendedOto = otoList.filter(
          (s) => s.status === "completed" && s.studentAttendance === "present"
        ).length;
        const oneToOneRate = totalOto > 0 ? Math.round((attendedOto / totalOto) * 100) : 0;

        // 3. Assignment Submissions & Average Marks
        let totalAssignments = 0;
        let submittedAssignments = 0;
        let sumMarks = 0;
        let gradedSubmissions = 0;

        if (batchIds.length > 0) {
          const periodAssignments = await db.query.assignments.findMany({
            where: and(
              inArray(assignments.batchId, batchIds),
              sql`${assignments.createdAt} >= ${start}`,
              sql`${assignments.createdAt} <= ${end}`
            ),
          });
          totalAssignments = periodAssignments.length;

          if (totalAssignments > 0) {
            const assignIds = periodAssignments.map((a) => a.id);
            const subs = await db.query.assignmentSubmissions.findMany({
              where: and(
                eq(assignmentSubmissions.studentId, input.targetUserId),
                inArray(assignmentSubmissions.assignmentId, assignIds)
              ),
            });
            submittedAssignments = subs.length;
            subs.forEach((sub) => {
              if (sub.marks !== null && sub.marks !== undefined) {
                sumMarks += sub.marks;
                gradedSubmissions++;
              }
            });
          }
        }

        const assignmentSubmissionRate = totalAssignments > 0 ? Math.round((submittedAssignments / totalAssignments) * 100) : 0;
        const assignmentAvgMarks = gradedSubmissions > 0 ? Math.round(sumMarks / gradedSubmissions) : 0;

        // 4. Student Engagement (Message count in public & private chat)
        const publicMsgs = await db
          .select({ count: sql`count(*)` })
          .from(messages)
          .where(
            and(
              eq(messages.senderId, input.targetUserId),
              sql`${messages.createdAt} >= ${start}`,
              sql`${messages.createdAt} <= ${end}`
            )
          );

        const privateMsgs = await db
          .select({ count: sql`count(*)` })
          .from(privateMessages)
          .where(
            and(
              eq(privateMessages.senderId, input.targetUserId),
              sql`${privateMessages.createdAt} >= ${start}`,
              sql`${privateMessages.createdAt} <= ${end}`
            )
          );

        const messageCount = Number(publicMsgs[0]?.count || 0) + Number(privateMsgs[0]?.count || 0);
        // Engagement Score: 1 message is 5%, capped at 100% (20 messages)
        const engagementScore = Math.min(100, messageCount * 5);

        autoMetrics = {
          totalClasses,
          attendedClasses,
          attendanceRate,
          totalOto,
          attendedOto,
          oneToOneRate,
          totalAssignments,
          submittedAssignments,
          assignmentSubmissionRate,
          assignmentAvgMarks,
          messageCount,
          engagementScore,
        };

        // Weighted Score out of 100
        const attW = criteria.attendanceWeight ?? 30;
        const otoW = criteria.oneToOneWeight ?? 25;
        const assW = criteria.assignmentsWeight ?? 25;
        const engW = criteria.engagementWeight ?? 20;

        totalScore =
          (attendanceRate * attW +
            oneToOneRate * otoW +
            assignmentSubmissionRate * assW +
            engagementScore * engW) /
          100;
      } else {
        // --- TEACHER AUTO-METRICS ---

        // 1. Class Completion
        const periodClasses = await db.query.classes.findMany({
          where: and(
            eq(classes.teacherId, input.targetUserId),
            eq(classes.classType, "group"),
            sql`${classes.scheduledAt} >= ${start}`,
            sql`${classes.scheduledAt} <= ${end}`
          ),
        });

        const totalClasses = periodClasses.length;
        const completedClasses = periodClasses.filter((c) => c.status === "completed").length;
        const classCompletionRate = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;

        // 2. Class Punctuality
        let punctualClasses = 0;
        let totalCompletedClassesWithTimes = 0;
        let totalDelayMinutes = 0;

        periodClasses.forEach((c) => {
          if (c.status === "completed" && c.startedAt) {
            totalCompletedClassesWithTimes++;
            const diffMs = c.startedAt.getTime() - c.scheduledAt.getTime();
            const diffMins = diffMs / (60 * 1000);
            if (diffMins <= 5) {
              punctualClasses++;
            }
            if (diffMins > 0) {
              totalDelayMinutes += diffMins;
            }
          }
        });

        const classPunctualityRate =
          totalCompletedClassesWithTimes > 0 ? Math.round((punctualClasses / totalCompletedClassesWithTimes) * 100) : 0;
        const avgDelayMins = totalCompletedClassesWithTimes > 0 ? Math.round(totalDelayMinutes / totalCompletedClassesWithTimes) : 0;

        // 3. One-to-One Completion
        const periodOto = await db.query.oneToOneSessions.findMany({
          where: and(
            eq(oneToOneSessions.teacherId, input.targetUserId),
            sql`${oneToOneSessions.scheduledAt} >= ${start}`,
            sql`${oneToOneSessions.scheduledAt} <= ${end}`
          ),
        });
        const totalOto = periodOto.length;
        const completedOto = periodOto.filter((s) => s.status === "completed").length;
        const oneToOneCompletionRate = totalOto > 0 ? Math.round((completedOto / totalOto) * 100) : 0;

        // 4. Student Feedback Average
        const feedbackList = await db.query.feedback.findMany({
          where: and(
            eq(feedback.teacherId, input.targetUserId),
            sql`${feedback.createdAt} >= ${start}`,
            sql`${feedback.createdAt} <= ${end}`
          ),
        });
        const feedbackCount = feedbackList.length;
        const avgRating =
          feedbackCount > 0
            ? Number((feedbackList.reduce((sum, f) => sum + f.rating, 0) / feedbackCount).toFixed(2))
            : 0;

        autoMetrics = {
          totalClasses,
          completedClasses,
          classCompletionRate,
          punctualClasses,
          classPunctualityRate,
          avgDelayMins,
          totalOto,
          completedOto,
          oneToOneCompletionRate,
          feedbackCount,
          avgRating,
        };

        const compW = criteria.classCompletionWeight ?? 40;
        const puncW = criteria.punctualityWeight ?? 30;
        const feedW = criteria.feedbackWeight ?? 30;

        // Convert average feedback rating (out of 5) to percentage
        const feedbackPct = avgRating > 0 ? (avgRating / 5) * 100 : 0;

        totalScore =
          (classCompletionRate * compW + classPunctualityRate * puncW + feedbackPct * feedW) / 100;
      }

      // Compute grade
      let grade = "F";
      if (totalScore >= 90) grade = "A+";
      else if (totalScore >= 80) grade = "A";
      else if (totalScore >= 70) grade = "B";
      else if (totalScore >= 60) grade = "C";
      else if (totalScore >= 50) grade = "D";

      return {
        targetUserId: input.targetUserId,
        targetUserName: targetUser.name,
        type: input.type,
        configId: config?.id || null,
        assessmentPeriod: input.assessmentPeriod,
        startDate: input.startDate,
        endDate: input.endDate,
        autoMetrics,
        totalScore: Number(totalScore.toFixed(2)),
        grade,
      };
    }),

  // Create report (Admin only)
  createReport: adminQuery
    .input(
      z.object({
        targetUserId: z.number(),
        type: z.enum(["student", "teacher"]),
        configId: z.number().nullable(),
        assessmentPeriod: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        status: z.enum(["draft", "published", "archived"]).default("draft"),
        autoMetrics: z.any(),
        totalScore: z.number(),
        grade: z.string(),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const [inserted] = await db
        .insert(performanceReports)
        .values({
          targetUserId: input.targetUserId,
          type: input.type,
          configId: input.configId,
          assessmentPeriod: input.assessmentPeriod,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          status: input.status,
          autoMetrics: input.autoMetrics,
          qualitativeScores: {}, // Not required as per feedback, using overall remarks
          totalScore: String(input.totalScore),
          grade: input.grade,
          remarks: input.remarks || "",
          createdBy: ctx.user.id,
        })
        .returning();

      if (inserted && input.status === "published") {
        const periodStr = `${new Date(input.startDate).toLocaleDateString()} - ${new Date(
          input.endDate
        ).toLocaleDateString()}`;
        await sendNotification(
          input.targetUserId,
          "New Performance Report Published",
          `Your performance report for the period ${periodStr} has been published by the Academic Head. Final Score: ${input.totalScore} (${input.grade})`,
          "performance_report",
          { reportId: inserted.id }
        );
      }

      return inserted;
    }),

  // Update report (Admin only)
  updateReport: adminQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["draft", "published", "archived"]),
        totalScore: z.number(),
        grade: z.string(),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Find active report
      const currentReport = await db.query.performanceReports.findFirst({
        where: eq(performanceReports.id, input.id),
      });

      if (!currentReport) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }

      if (currentReport.status === "draft") {
        // Overwrite in-place
        const [updated] = await db
          .update(performanceReports)
          .set({
            status: input.status,
            totalScore: String(input.totalScore),
            grade: input.grade,
            remarks: input.remarks || "",
            updatedAt: new Date(),
          })
          .where(eq(performanceReports.id, input.id))
          .returning();

        if (updated && input.status === "published") {
          const periodStr = `${new Date(updated.startDate).toLocaleDateString()} - ${new Date(
            updated.endDate
          ).toLocaleDateString()}`;
          await sendNotification(
            updated.targetUserId,
            "Performance Report Published",
            `Your performance report for the period ${periodStr} has been published. Final Score: ${input.totalScore} (${input.grade})`,
            "performance_report",
            { reportId: updated.id }
          );
        }
        return updated;
      } else {
        // Preserve history: Create new version, mark previous as not latest
        await db
          .update(performanceReports)
          .set({ isLatest: false, updatedAt: new Date() })
          .where(eq(performanceReports.id, input.id));

        const parentReportId = currentReport.parentReportId ?? currentReport.id;

        const [newVersion] = await db
          .insert(performanceReports)
          .values({
            parentReportId,
            version: currentReport.version + 1,
            isLatest: true,
            targetUserId: currentReport.targetUserId,
            type: currentReport.type,
            configId: currentReport.configId,
            assessmentPeriod: currentReport.assessmentPeriod,
            startDate: currentReport.startDate,
            endDate: currentReport.endDate,
            status: input.status,
            autoMetrics: currentReport.autoMetrics,
            qualitativeScores: currentReport.qualitativeScores,
            totalScore: String(input.totalScore),
            grade: input.grade,
            remarks: input.remarks || "",
            createdBy: ctx.user.id,
          })
          .returning();

        if (newVersion && input.status === "published") {
          const periodStr = `${new Date(newVersion.startDate).toLocaleDateString()} - ${new Date(
            newVersion.endDate
          ).toLocaleDateString()}`;
          await sendNotification(
            newVersion.targetUserId,
            "Performance Report Updated",
            `Your performance report for the period ${periodStr} has been updated. Final Score: ${input.totalScore} (${input.grade})`,
            "performance_report",
            { reportId: newVersion.id }
          );
        }
        return newVersion;
      }
    }),

  // Archive a report (Admin only)
  archiveReport: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [updated] = await db
        .update(performanceReports)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(performanceReports.id, input.id))
        .returning();
      return updated;
    }),

  // List reports with filters
  listReports: authedQuery
    .input(
      z.object({
        type: z.enum(["student", "teacher"]).optional(),
        targetUserId: z.number().optional(),
        assessmentPeriod: z.string().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        batchId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const role = ctx.user.role;

      // Base filters
      const conditions = [eq(performanceReports.isLatest, true)];

      // Security check: students and teachers can only view their own PUBLISHED reports
      if (role === "student" || role === "teacher") {
        conditions.push(
          eq(performanceReports.targetUserId, ctx.user.id),
          eq(performanceReports.status, "published")
        );
      } else {
        // Admins/Academic Head
        if (input.type) {
          conditions.push(eq(performanceReports.type, input.type));
        }
        if (input.targetUserId) {
          conditions.push(eq(performanceReports.targetUserId, input.targetUserId));
        }
        if (input.assessmentPeriod) {
          conditions.push(eq(performanceReports.assessmentPeriod, input.assessmentPeriod));
        }
        if (input.status) {
          conditions.push(eq(performanceReports.status, input.status));
        }
      }

      const reportsList = await db.query.performanceReports.findMany({
        where: and(...conditions),
        orderBy: desc(performanceReports.createdAt),
        with: {
          targetUser: {
            columns: { id: true, name: true, email: true, role: true },
            with: {
              profile: {
                columns: { batch: true, course: true },
              },
            },
          },
        },
      });

      // Filter by Batch (done in JS because batch is in nested profile JSON / string field)
      if (input.batchId) {
        const batchRecord = await db.query.batches.findFirst({
          where: eq(batches.id, input.batchId),
        });
        if (batchRecord) {
          return reportsList.filter(
            (r: any) =>
              r.targetUser?.profile?.batch === batchRecord.name ||
              r.targetUser?.profile?.course === batchRecord.name
          );
        }
      }

      return reportsList;
    }),

  // Get version history of a report
  getReportHistory: authedQuery
    .input(z.object({ reportId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const role = ctx.user.role;

      const report = await db.query.performanceReports.findFirst({
        where: eq(performanceReports.id, input.reportId),
      });

      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }

      // Security check: students and teachers can only view their own report history
      if (
        (role === "student" || role === "teacher") &&
        report.targetUserId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const parentId = report.parentReportId ?? report.id;

      const history = await db.query.performanceReports.findMany({
        where: or(
          eq(performanceReports.id, parentId),
          eq(performanceReports.parentReportId, parentId)
        ),
        orderBy: desc(performanceReports.version),
        with: {
          createdBy: {
            columns: { name: true },
          },
        },
      });

      // If student/teacher, filter out drafts in history
      if (role === "student" || role === "teacher") {
        return history.filter((h) => h.status === "published");
      }

      return history;
    }),

  // Fetch batches & modules for filters
  getFiltersData: adminQuery.query(async () => {
    const db = getDb();
    const batchesList = await db.query.batches.findMany({
      columns: { id: true, name: true },
      orderBy: [batches.name],
    });
    const coursesList = await db.query.modules.findMany({
      columns: { id: true, name: true },
      orderBy: [modules.name],
    });
    return {
      batches: batchesList,
      courses: coursesList,
    };
  }),
});
