import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, sql, count, inArray, ne, or, isNull, isNotNull, asc } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, profiles, batchEnrollments, batches, classes, modules, payments, attendance, privateMessages, feedback, sessionAllocationLogs, oneToOneSessions, studentCourseAuditLogs, studentClassAllocations, attendanceAlerts } from "@db/schema";
import { updateStudentSessionBalances } from "../lib/sessionHelper";
import { sendNotification, sendBulkNotification, getAdminUserIds } from "../lib/notificationEngine";
import { getNextUniqueId } from "../lib/idGenerator";
import { generateNextEnrollmentId } from "../lib/studentIdGenerator";
import { env } from "../lib/env";
import { isStudentFeeRestricted, recalculateStudentFees } from "../lib/feeHelper";
import { phoneSchema, parseFullPhone, validatePhoneNumber, PHONE_ERROR_MESSAGE, getCountryISOFromDialCode } from "@contracts/validation";
import { sendUserCredentialsEmail } from "../lib/email";
import bcrypt from "bcryptjs";
import { EnrollmentPaymentService } from "../lib/EnrollmentPaymentService";


export const studentsRouter = createRouter({
  list: teacherQuery
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "active", "inactive", "pending_enrollment", "alumni"]).default("all"),
        courseId: z.number().optional(),
        batchId: z.number().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const filters = [eq(users.role, "student")];

      // Enforce assigned student restrictions for Teachers
      if (ctx.user.role === "teacher") {
        const teacherBatches = await db.select({ id: batches.id })
          .from(batches)
          .where(eq(batches.teacherId, ctx.user.id));
        const batchIds = teacherBatches.map((b) => b.id);

        if (batchIds.length === 0) {
          return { items: [], total: 0 };
        }

        const enrolledStudents = await db.selectDistinct({ studentId: batchEnrollments.studentId })
          .from(batchEnrollments)
          .where(and(
            inArray(batchEnrollments.batchId, batchIds),
            eq(batchEnrollments.status, "active")
          ));
        const studentIds = enrolledStudents.map((e) => e.studentId);

        if (studentIds.length === 0) {
          return { items: [], total: 0 };
        }

        filters.push(inArray(users.id, studentIds));
      }

      // Search filters
      if (input?.search) {
        filters.push(
          sql`(${users.name} ILIKE ${"%" + input.search + "%"} OR ${users.phone} ILIKE ${"%" + input.search + "%"} OR ${users.email} ILIKE ${"%" + input.search + "%"} OR ${users.unionId} ILIKE ${"%" + input.search + "%"} OR ${profiles.enrollmentId} ILIKE ${"%" + input.search + "%"})`
        );
      }

      // Status filters
      if (input?.status === "active") {
        filters.push(eq(users.status, "active"));
        filters.push(isNull(profiles.completionDate));
      } else if (input?.status === "inactive") {
        filters.push(eq(users.status, "inactive"));
      } else if (input?.status === "pending_enrollment") {
        filters.push(eq(users.status, "active"));
        filters.push(sql`NOT EXISTS (
          SELECT 1 FROM batch_enrollments
          WHERE batch_enrollments.student_id = ${users.id}
          AND batch_enrollments.status = 'active'
        )`);
      } else if (input?.status === "alumni") {
        filters.push(isNotNull(profiles.completionDate));
      }

      // Course and batch ID filters
      if (input?.batchId) {
        const batchUsers = await db.select({ studentId: batchEnrollments.studentId })
          .from(batchEnrollments)
          .where(and(
            eq(batchEnrollments.batchId, input.batchId),
            eq(batchEnrollments.status, "active")
          ));
        const batchUserIds = batchUsers.map((bu) => bu.studentId);
        if (batchUserIds.length === 0) {
          return { items: [], total: 0 };
        }
        filters.push(inArray(users.id, batchUserIds));
      } else if (input?.courseId) {
        const courseBatches = await db.select({ id: batches.id })
          .from(batches)
          .where(eq(batches.moduleId, input.courseId));
        const courseBatchIds = courseBatches.map((cb) => cb.id);
        if (courseBatchIds.length === 0) {
          return { items: [], total: 0 };
        }
        const courseUsers = await db.select({ studentId: batchEnrollments.studentId })
          .from(batchEnrollments)
          .where(and(
            inArray(batchEnrollments.batchId, courseBatchIds),
            eq(batchEnrollments.status, "active")
          ));
        const courseUserIds = courseUsers.map((cu) => cu.studentId);
        if (courseUserIds.length === 0) {
          return { items: [], total: 0 };
        }
        filters.push(inArray(users.id, courseUserIds));
      }

      const where = and(...filters);

      // Query total count
      const totalRes = await db
        .select({ value: count() })
        .from(users)
        .leftJoin(profiles, eq(users.id, profiles.userId))
        .where(where);
      const total = totalRes[0]?.value || 0;

      const items = await db
        .select({
          id: users.id,
          unionId: users.unionId,
          username: users.username,
          name: users.name,
          email: users.email,
          phone: users.phone,
          countryCode: users.countryCode,
          phoneNumber: users.phoneNumber,
          role: users.role,
          status: users.status,
          avatar: users.avatar,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          batchId: batchEnrollments.batchId,
          courseId: batches.moduleId,
          classAllocation: studentClassAllocations.allocation,
          profile: {
            id: profiles.id,
            enrollmentId: profiles.enrollmentId,
            course: profiles.course,
            batch: profiles.batch,
            batchTime: profiles.batchTime,
            feesTotal: profiles.feesTotal,
            feesPaid: profiles.feesPaid,
            feesBalance: profiles.feesBalance,
            paymentStatus: profiles.paymentStatus,
            minInitialPayment: profiles.minInitialPayment,
            paymentDueDate: profiles.paymentDueDate,
            gracePeriodDays: profiles.gracePeriodDays,
            admissionDate: profiles.admissionDate,
            completionDate: profiles.completionDate,
            allocatedOneToOneSessions: profiles.allocatedOneToOneSessions,
            allocatedGroupSessions: profiles.allocatedGroupSessions,
            totalAllocatedSessions: profiles.totalAllocatedSessions,
            attendedOneToOneSessions: profiles.attendedOneToOneSessions,
            attendedGroupSessions: profiles.attendedGroupSessions,
            totalAttendedSessions: profiles.totalAttendedSessions,
            remainingOneToOneSessions: profiles.remainingOneToOneSessions,
            remainingGroupSessions: profiles.remainingGroupSessions,
            totalRemainingSessions: profiles.totalRemainingSessions,
            documents: profiles.documents,
            activityTimeline: profiles.activityTimeline,
            gender: profiles.gender,
            dob: profiles.dob,
            educationalQualification: profiles.educationalQualification,
            parentName: profiles.parentName,
            parentPhone: profiles.parentPhone,
            notes: profiles.notes,
            photo: profiles.photo,
          }
        })
        .from(users)
        .leftJoin(profiles, eq(users.id, profiles.userId))
        .leftJoin(batchEnrollments, and(eq(users.id, batchEnrollments.studentId), eq(batchEnrollments.status, "active")))
        .leftJoin(batches, eq(batchEnrollments.batchId, batches.id))
        .leftJoin(studentClassAllocations, eq(users.id, studentClassAllocations.studentId))
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(users.createdAt));

      return {
        items,
        total,
      };
    }),

  getProfile: teacherQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = input.id;

      // Permission check: Students can only view their own profile
      if (ctx.user.role === "student" && ctx.user.id !== userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Students can only access their own profile." });
      }

      // Enforce assigned student checks for Teachers
      if (ctx.user.role === "teacher") {
        const teacherBatches = await db.select({ id: batches.id })
          .from(batches)
          .where(eq(batches.teacherId, ctx.user.id));
        const batchIds = teacherBatches.map((b) => b.id);

        if (batchIds.length === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this student." });
        }

        const enrollment = await db.query.batchEnrollments.findFirst({
          where: and(
            eq(batchEnrollments.studentId, userId),
            inArray(batchEnrollments.batchId, batchIds),
            eq(batchEnrollments.status, "active")
          ),
        });

        if (!enrollment) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this student." });
        }
      }

      const student = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.role, "student")),
        with: {
          profile: true,
        },
      });

      if (!student) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }

      // 1. Fetch Attendance History
      const attendanceList = await db.query.attendance.findMany({
        where: eq(attendance.studentId, userId),
        orderBy: desc(attendance.recordedAt),
        with: {
          class: true,
        },
      });

      // 2. Fetch Payments History
      const paymentsList = await db.query.payments.findMany({
        where: eq(payments.studentId, userId),
        orderBy: desc(payments.createdAt),
        with: {
          batch: true,
        },
      });

      // 3. Fetch Feedback / Performance reports
      const feedbackList = await db.query.feedback.findMany({
        where: eq(feedback.studentId, userId),
        orderBy: desc(feedback.createdAt),
        with: {
          teacher: true,
        },
      });

      // 4. Fetch Session Allocation Logs
      const sessionLogs = await db.query.sessionAllocationLogs.findMany({
        where: eq(sessionAllocationLogs.studentId, userId),
        orderBy: desc(sessionAllocationLogs.changedAt),
        with: {
          changedByUser: true,
        },
      });

      // 5. Fetch Communication History (Private Messages)
      const chatHistory = await db.query.privateMessages.findMany({
        where: and(
          or(
            eq(privateMessages.senderId, userId),
            eq(privateMessages.receiverId, userId)
          ),
          isNull(privateMessages.deletedAt)
        ),
        orderBy: desc(privateMessages.createdAt),
        limit: 100,
        with: {
          sender: true,
          receiver: true,
        },
      });

      // Fetch Enrollments & resolved teachers
      const enrollmentsList = await db.query.batchEnrollments.findMany({
        where: eq(batchEnrollments.studentId, userId),
        orderBy: desc(batchEnrollments.joinedAt),
        with: {
          batch: {
            with: {
              module: true,
              teacher: {
                columns: { id: true, name: true }
              }
            }
          }
        }
      });

      const resolvedEnrollments = await Promise.all(enrollmentsList.map(async (e) => {
        let teacherIds: number[] = [];
        if (e.assignedTeachers && Array.isArray(e.assignedTeachers)) {
          teacherIds = e.assignedTeachers as number[];
        }
        
        let resolvedTeachers: { id: number, name: string }[] = [];
        if (teacherIds.length > 0) {
          resolvedTeachers = await db.select({
            id: users.id,
            name: users.name
          })
          .from(users)
          .where(and(
            inArray(users.id, teacherIds),
            eq(users.role, "teacher")
          ));
        }
        
        return {
          ...e,
          resolvedTeachers
        };
      }));

      // Fetch One-to-One Sessions for combined history
      const o2oSessions = await db.query.oneToOneSessions.findMany({
        where: eq(oneToOneSessions.studentId, userId),
        orderBy: desc(oneToOneSessions.scheduledAt),
        with: {
          teacher: {
            columns: { id: true, name: true }
          }
        }
      });

      // Fetch Group Attendance list for combined history
      const groupAttendances = await db.query.attendance.findMany({
        where: eq(attendance.studentId, userId),
        orderBy: desc(attendance.recordedAt),
        with: {
          class: {
            with: {
              teacher: {
                columns: { id: true, name: true }
              }
            }
          }
        }
      });

      // Fetch Student Course Audit Logs
      const auditLogsList = await db.query.studentCourseAuditLogs.findMany({
        where: eq(studentCourseAuditLogs.studentId, userId),
        orderBy: desc(studentCourseAuditLogs.changedAt),
        with: {
          changedByUser: {
            columns: { id: true, name: true }
          }
        }
      });

      const formattedO2O = o2oSessions.map((s) => ({
        id: `o2o_${s.id}`,
        sessionType: "one_to_one",
        title: s.title || "1-to-1 Session",
        duration: s.sessionLength || 30,
        teacherName: s.teacher?.name || "Unassigned",
        teacherId: s.teacherId,
        date: s.scheduledAt,
        status: s.status === "completed" 
          ? (s.studentAttendance === "present" ? "completed" : "absent")
          : (s.status === "cancelled" ? "cancelled" : (s.status === "rescheduled" ? "rescheduled" : "scheduled")),
        notes: s.remarks || "",
      }));

      const formattedGroup = groupAttendances.map((a) => ({
        id: `group_${a.id}`,
        sessionType: "group",
        title: a.class?.title || "Group Class",
        duration: a.class?.duration || a.duration || 0,
        teacherName: a.class?.teacher?.name || "Unassigned",
        teacherId: a.class?.teacherId,
        date: a.class?.scheduledAt || a.recordedAt,
        status: a.class?.status === "cancelled" 
          ? "cancelled"
          : (a.status === "present" ? "completed" : (a.status === "late" ? "completed" : "absent")),
        notes: a.class?.description || "",
      }));

      const combinedHistory = [...formattedO2O, ...formattedGroup].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const activeEnrollment = resolvedEnrollments.find((e: any) => e.status === "active") || resolvedEnrollments[0];
      const classAllocation = activeEnrollment ? {
        oneToOne: {
          teacherId: (activeEnrollment.assignedTeachers as any)?.[0] || null,
          sessions30: activeEnrollment.oneOnOne30Allocated,
          sessions45: activeEnrollment.oneOnOne45Allocated,
          sessions60: activeEnrollment.oneOnOne60Allocated,
          completed30: activeEnrollment.oneOnOne30Used,
          completed45: activeEnrollment.oneOnOne45Used,
          completed60: activeEnrollment.oneOnOne60Used,
          remaining30: Math.max(0, activeEnrollment.oneOnOne30Allocated - activeEnrollment.oneOnOne30Used),
          remaining45: Math.max(0, activeEnrollment.oneOnOne45Allocated - activeEnrollment.oneOnOne45Used),
          remaining60: Math.max(0, activeEnrollment.oneOnOne60Allocated - activeEnrollment.oneOnOne60Used),
        },
        group: {
          teacherId: (activeEnrollment.assignedTeachers as any)?.[1] || (activeEnrollment.assignedTeachers as any)?.[0] || null,
          batchId: activeEnrollment.batchId,
          sessions30: activeEnrollment.group30Allocated,
          sessions45: activeEnrollment.group45Allocated,
          sessions60: activeEnrollment.group60Allocated,
          completed30: activeEnrollment.group30Used,
          completed45: activeEnrollment.group45Used,
          completed60: activeEnrollment.group60Used,
          remaining30: Math.max(0, activeEnrollment.group30Allocated - activeEnrollment.group30Used),
          remaining45: Math.max(0, activeEnrollment.group45Allocated - activeEnrollment.group45Used),
          remaining60: Math.max(0, activeEnrollment.group60Allocated - activeEnrollment.group60Used),
        }
      } : null;

      return {
        student,
        attendance: attendanceList,
        payments: paymentsList,
        feedback: feedbackList,
        sessionAllocationLogs: sessionLogs,
        chatHistory,
        enrollments: resolvedEnrollments,
        classHistory: combinedHistory,
        studentCourseAuditLogs: auditLogsList,
        classAllocation,
      };
    }),

  create: adminQuery
    .input(
      z.object({
        name: z.string().min(2),
        countryCode: z.string(),
        countryISO: z.string().optional(),
        phoneNumber: z.string(),
        email: z.string().email().optional(),
        username: z.string().min(3),
        password: z.string().min(6),
        enrollmentId: z.string().optional(),
        courseId: z.number(),
        batchId: z.number(),
        feesTotal: z.number(),
        allocatedOneToOneSessions: z.number().default(0),
        allocatedGroupSessions: z.number().default(0),
        paymentType: z.enum(["FULL_PAYMENT", "INSTALLMENT"]).default("FULL_PAYMENT"),
        installments: z.array(
          z.object({
            installmentNumber: z.number(),
            amount: z.number(),
            dueDate: z.string().optional(),
          })
        ).optional(),
        // Personal Details
        gender: z.string().optional(),
        dob: z.string().optional(),
        educationalQualification: z.string().optional(),
        parentName: z.string().optional(),
        parentCountryCode: z.string().optional(),
        parentCountryISO: z.string().optional(),
        parentPhoneNumber: z.string().optional(),
        parentPhone: z.string().optional(),
        notes: z.string().optional(),
        // Structured Class Allocation
        classAllocation: z.object({
          oneToOne: z.object({
            teacherId: z.number().nullable().optional(),
            sessions30: z.number().default(0),
            sessions45: z.number().default(0),
            sessions60: z.number().default(0),
          }),
          group: z.object({
            teacherId: z.number().nullable().optional(),
            batchId: z.number().nullable().optional(),
            sessions30: z.number().default(0),
            sessions45: z.number().default(0),
            sessions60: z.number().default(0),
          }),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Check phone uniqueness
      let countryISO = input.countryISO;
      if (!countryISO) {
        countryISO = getCountryISOFromDialCode(input.countryCode) || "IN";
      }

      const valError = validatePhoneNumber(input.countryCode, input.phoneNumber, countryISO);
      if (valError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: valError });
      }

      const fullIntNum = `${input.countryCode}${input.phoneNumber}`.replace(/\s+/g, "");
      const existingPhone = await db.query.users.findFirst({
        where: eq(users.fullInternationalNumber, fullIntNum),
      });
      if (existingPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
      }

      // Check username uniqueness
      const existingUsername = await db.query.users.findFirst({
        where: eq(users.username, input.username),
      });
      if (existingUsername) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
      }

      // Check enrollmentId uniqueness
      let finalEnrollmentId: string;
      if (input.enrollmentId && input.enrollmentId.trim() !== "") {
        const trimmedId = input.enrollmentId.trim();
        const existingProfile = await db.query.profiles.findFirst({
          where: eq(profiles.enrollmentId, trimmedId),
        });
        if (existingProfile) {
          throw new TRPCError({ code: "CONFLICT", message: `Enrollment ID "${trimmedId}" is already taken.` });
        }
        const existingUser = await db.query.users.findFirst({
          where: and(eq(users.unionId, trimmedId), eq(users.role, "student")),
        });
        if (existingUser) {
          throw new TRPCError({ code: "CONFLICT", message: `Enrollment ID "${trimmedId}" conflicts with an existing Student ID.` });
        }
        finalEnrollmentId = trimmedId;
      } else {
        finalEnrollmentId = await generateNextEnrollmentId();
      }

      // Validate course and batch
      const course = await db.query.modules.findFirst({
        where: eq(modules.id, input.courseId),
      });
      if (!course || course.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected course is invalid or inactive." });
      }

      const batch = await db.query.batches.findFirst({
        where: eq(batches.id, input.batchId),
      });
      if (!batch || batch.status !== "active" || Number(batch.moduleId) !== input.courseId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected batch is invalid or does not match course." });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);
      const uniqueId = await getNextUniqueId("student");
      const formattedPhone = `${input.countryCode}${input.phoneNumber}`.replace(/\s+/g, "");

      const result = await db.insert(users).values({
        unionId: uniqueId,
        name: input.name,
        phone: formattedPhone,
        countryCode: input.countryCode,
        countryISO,
        phoneNumber: input.phoneNumber,
        fullInternationalNumber: fullIntNum,
        email: input.email,
        username: input.username,
        password: hashedPassword,
        role: "student",
        status: "active",
        mustChangePassword: true,
      }).returning({ id: users.id });

      const userId = result[0]?.id;

      let paymentDueDate: Date | null = null;
      if (input.paymentType === "INSTALLMENT" && input.installments && input.installments.length > 0) {
        const firstInst = input.installments.find((i) => i.installmentNumber === 1);
        if (firstInst?.dueDate) {
          paymentDueDate = new Date(firstInst.dueDate);
        }
      }

      // Validate and parse parent phone
      let parentCountryCode = input.parentCountryCode;
      let parentCountryISO = input.parentCountryISO;
      let parentPhoneNumber = input.parentPhoneNumber;
      let parentFullInt = "";

      if (parentCountryCode && parentPhoneNumber) {
        if (!parentCountryISO) {
          parentCountryISO = getCountryISOFromDialCode(parentCountryCode) || "IN";
        }
        const parentValError = validatePhoneNumber(parentCountryCode, parentPhoneNumber, parentCountryISO);
        if (parentValError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Parent phone: ${parentValError}` });
        }
        parentFullInt = `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "");
      } else if (input.parentPhone) {
        const parsedParent = parseFullPhone(input.parentPhone);
        if (parsedParent) {
          parentCountryCode = parsedParent.countryCode;
          parentCountryISO = parsedParent.countryISO;
          parentPhoneNumber = parsedParent.phoneNumber;
          parentFullInt = `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "");
        }
      }

      const sessionsO2O30 = input.allocatedOneToOneSessions ? input.allocatedOneToOneSessions : (batch.oneOnOne30Allocated || 0);
      const sessionsO2O45 = input.allocatedOneToOneSessions ? 0 : (batch.oneOnOne45Allocated || 0);
      const sessionsO2O60 = input.allocatedOneToOneSessions ? 0 : (batch.oneOnOne60Allocated || 0);
      const totalO2O = sessionsO2O30 + sessionsO2O45 + sessionsO2O60;

      const sessionsGroup30 = input.allocatedGroupSessions ? input.allocatedGroupSessions : (batch.group30Allocated || 0);
      const sessionsGroup45 = input.allocatedGroupSessions ? 0 : (batch.group45Allocated || 0);
      const sessionsGroup60 = input.allocatedGroupSessions ? 0 : (batch.group60Allocated || 0);
      const totalGroup = sessionsGroup30 + sessionsGroup45 + sessionsGroup60;

      const totalAllocated = totalO2O + totalGroup;

      const packageConfig = {
        oneToOne: {
          total: totalO2O,
          min30: sessionsO2O30,
          min45: sessionsO2O45,
          min60: sessionsO2O60
        },
        group: {
          total: totalGroup,
          min30: sessionsGroup30,
          min45: sessionsGroup45,
          min60: sessionsGroup60
        }
      };

      try {
        await EnrollmentPaymentService.processEnrollment(db, {
          studentId: userId,
          batchId: input.batchId,
          moduleId: batch.moduleId,
          totalCourseFee: input.feesTotal,
          paymentOption: input.paymentType === "INSTALLMENT" ? "installment" : "full_payment",
          paidAmount: 0, // Unpaid registration initially
          remainingBalance: input.feesTotal,
          paymentStatus: "unpaid",
          registrationSource: "direct",
          installments: input.installments || undefined,
          extraProfileFields: {
            gender: input.gender,
            dob: input.dob ? new Date(input.dob) : null,
            educationalQualification: input.educationalQualification,
            parentName: input.parentName,
            parentPhone: parentCountryCode && parentPhoneNumber ? `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "") : (input.parentPhone ? input.parentPhone.replace(/[^\d+]/g, "") : null),
            parentCountryCode,
            parentCountryISO,
            parentPhoneNumber,
            parentFullInternationalNumber: parentFullInt || null,
            notes: input.notes,
          }
        });
      } catch (err: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message || "Failed to process enrollment" });
      }

      // Handle capacity warnings
      const [{ value: activeCount }] = await db
        .select({ value: count() })
        .from(batchEnrollments)
        .where(and(eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active")));

      if (batch.maxStudents != null && activeCount > batch.maxStudents) {
        const adminIds = await getAdminUserIds();
        await sendBulkNotification(
          adminIds,
          "Batch Overcrowded",
          `Batch "${batch.name}" has exceeded its maximum capacity (${activeCount}/${batch.maxStudents}).`,
          "capacity_alert",
          { batchId: input.batchId, activeCount, maxStudents: batch.maxStudents }
        );
      }

      // Send credential email
      let emailError: string | null = null;
      if (input.email) {
        try {
          const origin = ctx.req.headers.get("origin") || "https://your-lms-domain.com";
          const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : `${origin}/login`;
          const emailResult = await sendUserCredentialsEmail({
            email: input.email,
            name: input.name,
            username: input.username,
            password: input.password,
            loginUrl,
          });
          if (!emailResult.success) {
            emailError = emailResult.error || "Email delivery failed";
          }
        } catch (e: any) {
          emailError = e.message || String(e);
        }
      }

      await recalculateStudentFees(userId);

      return {
        id: userId,
        unionId: uniqueId,
        emailError,
      };
    }),

  update: adminQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        countryCode: z.string().optional(),
        countryISO: z.string().optional(),
        phoneNumber: z.string().optional(),
        email: z.string().email().optional(),
        status: z.enum(["active", "inactive", "suspended", "on_hold"]).optional(),
        // Profile details
        course: z.string().optional(),
        batch: z.string().optional(),
        courseId: z.number().optional(),
        batchId: z.number().optional(),
        feesTotal: z.number().optional(),
        paymentType: z.enum(["FULL_PAYMENT", "INSTALLMENT"]).optional(),
        completionDate: z.string().nullable().optional(),
        // Personal details
        gender: z.string().optional(),
        dob: z.string().nullable().optional(),
        educationalQualification: z.string().optional(),
        parentName: z.string().optional(),
        parentCountryCode: z.string().optional(),
        parentCountryISO: z.string().optional(),
        parentPhoneNumber: z.string().optional(),
        parentPhone: z.string().optional(),
        notes: z.string().optional(),
        enrollmentId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, course, batch, courseId, batchId, feesTotal, completionDate, gender, dob, educationalQualification, parentName, parentPhone, notes, enrollmentId, paymentType, ...userData } = input;

      const currentStudent = await db.query.users.findFirst({
        where: eq(users.id, id),
      });

      if (!currentStudent || currentStudent.role !== "student") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }

      const existingProfile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, id),
      });

      // Build the user update data object from non-profile fields
      const updateData: any = { ...userData };

      let countryISO = input.countryISO;
      if (input.countryCode || input.phoneNumber) {
        const countryCode = input.countryCode || currentStudent.countryCode || "";
        const phoneNumber = input.phoneNumber || currentStudent.phoneNumber || "";
        if (!countryISO) {
          countryISO = input.countryISO || currentStudent.countryISO || getCountryISOFromDialCode(countryCode) || "IN";
        }
        const valError = validatePhoneNumber(countryCode, phoneNumber, countryISO);
        if (valError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: valError });
        }
        const fullIntNum = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
        const existingPhone = await db.query.users.findFirst({
          where: and(
            eq(users.fullInternationalNumber, fullIntNum),
            ne(users.id, id)
          ),
        });
        if (existingPhone) {
          throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
        }

        updateData.countryCode = countryCode;
        updateData.countryISO = countryISO;
        updateData.phoneNumber = phoneNumber;
        updateData.fullInternationalNumber = fullIntNum;
        updateData.phone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
      }

      let parentCountryCode = input.parentCountryCode;
      let parentCountryISO = input.parentCountryISO;
      let parentPhoneNumber = input.parentPhoneNumber;
      let parentFullInt = "";

      if (parentCountryCode || parentPhoneNumber) {
        parentCountryCode = parentCountryCode || existingProfile?.parentCountryCode || "";
        parentPhoneNumber = parentPhoneNumber || existingProfile?.parentPhoneNumber || "";
        parentCountryISO = parentCountryISO || existingProfile?.parentCountryISO || getCountryISOFromDialCode(parentCountryCode) || "IN";

        if (parentCountryCode && parentPhoneNumber) {
          const parentValError = validatePhoneNumber(parentCountryCode, parentPhoneNumber, parentCountryISO);
          if (parentValError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Parent phone: ${parentValError}` });
          }
          parentFullInt = `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "");
        }
      } else if (input.parentPhone) {
        const parsedParent = parseFullPhone(input.parentPhone);
        if (parsedParent) {
          parentCountryCode = parsedParent.countryCode;
          parentCountryISO = parsedParent.countryISO;
          parentPhoneNumber = parsedParent.phoneNumber;
          parentFullInt = `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "");
        }
      }

      const profileUpdate: any = {
        gender,
        educationalQualification,
        parentName,
        notes,
      };

      if (course !== undefined) profileUpdate.course = course;
      if (batch !== undefined) profileUpdate.batch = batch;

      if (parentCountryCode !== undefined) profileUpdate.parentCountryCode = parentCountryCode;
      if (parentCountryISO !== undefined) profileUpdate.parentCountryISO = parentCountryISO;
      if (parentPhoneNumber !== undefined) profileUpdate.parentPhoneNumber = parentPhoneNumber;
      if (parentFullInt !== "") profileUpdate.parentFullInternationalNumber = parentFullInt;
      if (input.parentPhone !== undefined) {
        profileUpdate.parentPhone = parentCountryCode && parentPhoneNumber ? `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "") : (input.parentPhone ? input.parentPhone.replace(/[^\d+]/g, "") : input.parentPhone);
      }

      if (enrollmentId !== undefined) {
        const trimmedId = enrollmentId?.trim() || "";
        if (trimmedId !== "") {
          const existingEnrollmentId = await db.query.profiles.findFirst({
            where: and(
              eq(profiles.enrollmentId, trimmedId),
              ne(profiles.userId, id)
            ),
          });
          if (existingEnrollmentId) {
            throw new TRPCError({ code: "CONFLICT", message: `Enrollment ID "${trimmedId}" is already taken.` });
          }
          const existingUser = await db.query.users.findFirst({
            where: and(eq(users.unionId, trimmedId), eq(users.role, "student"), ne(users.id, id)),
          });
          if (existingUser) {
            throw new TRPCError({ code: "CONFLICT", message: `Enrollment ID "${trimmedId}" conflicts with an existing Student ID.` });
          }
          profileUpdate.enrollmentId = trimmedId;
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Enrollment ID cannot be empty." });
        }
      }

      if (dob !== undefined) {
        profileUpdate.dob = dob ? new Date(dob) : null;
      }

      if (completionDate !== undefined) {
        profileUpdate.completionDate = completionDate ? new Date(completionDate) : null;
      }

      // Validate selected Course & Batch if provided
      let selectedCourse = null;
      let selectedBatch = null;

      if (courseId) {
        selectedCourse = await db.query.modules.findFirst({
          where: eq(modules.id, courseId),
        });
        if (!selectedCourse) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Selected course not found." });
        }
        if (selectedCourse.status !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected course is inactive." });
        }
        profileUpdate.course = selectedCourse.name;
      }

      if (batchId) {
        selectedBatch = await db.query.batches.findFirst({
          where: eq(batches.id, batchId),
          with: { module: true, teacher: true },
        });
        if (!selectedBatch) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Selected batch not found." });
        }
        if (selectedBatch.status !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected batch is inactive or archived/deleted." });
        }
        if (courseId && Number(selectedBatch.moduleId) !== courseId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected batch does not match the selected course." });
        }
        profileUpdate.batch = selectedBatch.name;
        profileUpdate.batchTime = selectedBatch.timeSlot || "";
      }

      // Fetch active batch enrollment before transaction
      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, id),
          eq(batchEnrollments.status, "active")
        ),
      });

      const isBatchChanged = batchId !== undefined && (!activeEnrollment || activeEnrollment.batchId !== batchId);

      await db.transaction(async (tx) => {
        // Apply user table update
        await tx.update(users).set(updateData).where(eq(users.id, id));

        // If batch is changing, handle transfer logic
        if (isBatchChanged && batchId && selectedBatch) {
          let oldBatchName = "-";
          let oldBatchId: number | null = null;

          if (activeEnrollment) {
            oldBatchId = activeEnrollment.batchId;
            const oldBatch = await tx.query.batches.findFirst({
              where: eq(batches.id, oldBatchId),
            });
            oldBatchName = oldBatch ? oldBatch.name : "-";

            // Mark previous enrollment as inactive
            await tx.update(batchEnrollments)
              .set({ status: "inactive", leftAt: new Date() })
              .where(eq(batchEnrollments.id, activeEnrollment.id));
          }

          // Insert new active enrollment
          await tx.insert(batchEnrollments).values({
            batchId: batchId,
            studentId: id,
            status: "active",
            joinedAt: new Date(),
            assignedTeachers: selectedBatch.teacherId ? [selectedBatch.teacherId] : [],
          });

          // Resolve active attendance alerts for previous batch
          if (oldBatchId) {
            await tx.update(attendanceAlerts)
              .set({ status: "resolved", resolvedAt: new Date() })
              .where(and(
                eq(attendanceAlerts.studentId, id),
                eq(attendanceAlerts.batchId, oldBatchId),
                eq(attendanceAlerts.status, "active")
              ));
          }

          // Update studentClassAllocations
          const classAllocRecord = await tx.query.studentClassAllocations.findFirst({
            where: eq(studentClassAllocations.studentId, id),
          });

          if (classAllocRecord) {
            const alloc = classAllocRecord.allocation as any;
            const updatedAlloc = {
              ...alloc,
              group: {
                ...(alloc?.group || {}),
                batchId: batchId,
                teacherId: selectedBatch.teacherId || null,
              },
            };
            await tx.update(studentClassAllocations)
              .set({ allocation: updatedAlloc, updatedAt: new Date() })
              .where(eq(studentClassAllocations.studentId, id));
          } else {
            const newAlloc = {
              oneToOne: { teacherId: null, sessions30: 0, sessions45: 0, sessions60: 0, completed30: 0, completed45: 0, completed60: 0, remaining30: 0, remaining45: 0, remaining60: 0 },
              group: {
                teacherId: selectedBatch.teacherId || null,
                batchId: batchId,
                sessions30: 0,
                sessions45: 0,
                sessions60: 0,
                completed30: 0,
                completed45: 0,
                completed60: 0,
                remaining30: 0,
                remaining45: 0,
                remaining60: 0,
              },
            };
            await tx.insert(studentClassAllocations).values({
              studentId: id,
              allocation: newAlloc,
            });
          }

          // Recalculate session balances
          await updateStudentSessionBalances(tx, id);

          // Audit batch changes
          if (selectedCourse && existingProfile && existingProfile.course !== selectedCourse.name) {
            await tx.insert(studentCourseAuditLogs).values({
              studentId: id,
              changedBy: ctx.user.id,
              changeType: "course_changed",
              oldValue: `Course: ${existingProfile.course || "None"}`,
              newValue: `Course: ${selectedCourse.name}`,
            });
          }

          await tx.insert(studentCourseAuditLogs).values({
            studentId: id,
            changedBy: ctx.user.id,
            changeType: "batch_changed",
            oldValue: `Batch: ${oldBatchName}`,
            newValue: `Batch: ${selectedBatch.name}`,
          });

          // Course fee adjustments
          let diff = 0;
          if (activeEnrollment && oldBatchId) {
            const oldBatch = await tx.query.batches.findFirst({
              where: eq(batches.id, oldBatchId),
            });
            const oldFee = parseFloat(oldBatch?.courseFee ?? "0");
            const newFee = parseFloat(selectedBatch.courseFee ?? "0");
            diff = newFee - oldFee;
          } else {
            diff = parseFloat(selectedBatch.courseFee ?? "0");
          }

          const currentTotal = feesTotal !== undefined ? feesTotal : parseFloat(profileUpdate.feesTotal || existingProfile?.feesTotal || "0");
          const currentPaid = parseFloat(existingProfile?.feesPaid ?? "0");
          const nextTotal = Math.max(0, currentTotal + diff);
          const nextBalance = Math.max(0, nextTotal - currentPaid);
          const nextPaymentStatus = nextBalance <= 0 ? "paid" : (currentPaid > 0 ? "partial" : "unpaid");

          profileUpdate.feesTotal = String(nextTotal);
          profileUpdate.feesBalance = String(nextBalance);
          profileUpdate.paymentStatus = nextPaymentStatus;
        } else if (feesTotal !== undefined) {
          profileUpdate.feesTotal = String(feesTotal);
          if (existingProfile) {
            const feesPaid = parseFloat(existingProfile.feesPaid ?? "0");
            profileUpdate.feesBalance = String(feesTotal - feesPaid);
          }
        }

        if (profileUpdate.feesTotal !== undefined) {
          profileUpdate.totalCourseFee = profileUpdate.feesTotal;
        }
        if (profileUpdate.feesBalance !== undefined) {
          profileUpdate.remainingBalance = profileUpdate.feesBalance;
        }
        if (input.paymentType !== undefined) {
          profileUpdate.paymentOption = input.paymentType === "INSTALLMENT" ? "installment" : "full_payment";
        }

        // Apply profile table updates
        if (existingProfile) {
          await tx.update(profiles).set(profileUpdate).where(eq(profiles.userId, id));
        } else {
          await tx.insert(profiles).values({
            userId: id,
            course: profileUpdate.course || "",
            batch: profileUpdate.batch || "",
            feesTotal: profileUpdate.feesTotal || "0",
            feesBalance: profileUpdate.feesBalance || "0",
            totalCourseFee: profileUpdate.feesTotal || "0",
            remainingBalance: profileUpdate.feesBalance || "0",
            paymentOption: input.paymentType === "INSTALLMENT" ? "installment" : "full_payment",
            ...profileUpdate,
          });
        }

        // Community enrollment on course completion
        if (completionDate) {
          const communityBatch = await tx.query.batches.findFirst({
            where: eq(batches.isCommunityGroup, true),
          });
          if (communityBatch) {
            const existingEnrollment = await tx.query.batchEnrollments.findFirst({
              where: and(
                eq(batchEnrollments.batchId, communityBatch.id),
                eq(batchEnrollments.studentId, id)
              ),
            });
            if (!existingEnrollment) {
              await tx.insert(batchEnrollments).values({
                batchId: communityBatch.id,
                studentId: id,
                status: "active",
              });
              await sendNotification(
                id,
                "Welcome to the Community Group",
                `Congratulations on completing your course! You have been enrolled in the community group: ${communityBatch.name}.`,
                "community_group_welcome"
              );
            }
          }
        }
      });

      await recalculateStudentFees(id);

      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const student = await db.query.users.findFirst({
        where: eq(users.id, input.id),
      });

      if (!student || student.role !== "student") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student record not found" });
      }

      await db.delete(users).where(eq(users.id, input.id));
      return { success: true };
    }),

  import: adminQuery
    .input(z.object({ csvData: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const lines = input.csvData.split("\n");
      let importedCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        const [enrollmentId, name, phone, email, courseName, batchName, feesTotalStr] = line.split(",").map((s) => s.trim());
        if (!name || !phone) continue;

        // Skip header if matches header names
        if (enrollmentId && (enrollmentId.toLowerCase() === "enrollment id" || enrollmentId.toLowerCase() === "enrollmentid" || name.toLowerCase() === "name")) {
          continue;
        }

        const parsed = parseFullPhone(phone);
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid phone number format for student ${name}: ${phone}`,
          });
        }
        const { countryCode, phoneNumber, countryISO } = parsed;
        const valError = validatePhoneNumber(countryCode, phoneNumber, countryISO);
        if (valError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Validation failed for student ${name} (${phone}): ${valError}`,
          });
        }

        const fullIntNum = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
        const existingUser = await db.query.users.findFirst({
          where: eq(users.fullInternationalNumber, fullIntNum),
        });

        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Phone number ${phone} is already registered.`,
          });
        }

        let finalEnrollmentId = enrollmentId;
        if (finalEnrollmentId) {
          const existingProfile = await db.query.profiles.findFirst({
            where: eq(profiles.enrollmentId, finalEnrollmentId),
          });
          if (existingProfile) continue;

          const existingUserWithId = await db.query.users.findFirst({
            where: and(eq(users.unionId, finalEnrollmentId), eq(users.role, "student")),
          });
          if (existingUserWithId) continue;
        } else {
          finalEnrollmentId = await generateNextEnrollmentId();
        }

        let uniqueId = await getNextUniqueId("student");

        const username = name.toLowerCase().replace(/[^a-z0-9]/g, "") + Math.floor(1000 + Math.random() * 9000);
        const tempPassword = Math.random().toString(36).substring(2, 10);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const result = await db.insert(users).values({
          unionId: uniqueId,
          name,
          phone: `${countryCode}${phoneNumber}`.replace(/\s+/g, ""),
          countryCode,
          countryISO,
          phoneNumber,
          fullInternationalNumber: fullIntNum,
          email: email || null,
          username,
          password: hashedPassword,
          role: "student",
          status: "active",
          mustChangePassword: true,
        }).returning({ id: users.id });

        const userId = result[0]?.id;
        const feesTotal = feesTotalStr ? parseFloat(feesTotalStr) : 0;

        await db.insert(profiles).values({
          userId,
          enrollmentId: finalEnrollmentId,
          course: courseName || "",
          batch: batchName || "",
          feesTotal: String(feesTotal),
          feesBalance: String(feesTotal),
          paymentStatus: "unpaid",
          allocatedOneToOneSessions: 0,
          allocatedGroupSessions: 0,
          totalAllocatedSessions: 0,
          remainingOneToOneSessions: 0,
          remainingGroupSessions: 0,
          totalRemainingSessions: 0,
          attendedOneToOneSessions: 0,
          attendedGroupSessions: 0,
          totalAttendedSessions: 0,
          documents: [],
        });

        if (email) {
          try {
            const origin = ctx.req.headers.get("origin") || "https://your-lms-domain.com";
            const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : `${origin}/login`;
            await sendUserCredentialsEmail({
              email,
              name,
              username,
              password: tempPassword,
              loginUrl,
            });
          } catch (err) {
            console.error(`[importStudents] Failed to send credentials email to ${email}:`, err);
          }
        }

        importedCount++;
      }

      return { imported: importedCount };
    }),

  addDocument: adminQuery
    .input(z.object({
      studentId: z.number(),
      name: z.string(),
      url: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });
      const currentDocs = Array.isArray(profile.documents) ? profile.documents as any[] : [];
      const newDoc = {
        id: Math.random().toString(36).substring(2, 9),
        name: input.name,
        url: input.url,
        uploadedAt: new Date().toISOString(),
      };
      currentDocs.push(newDoc);
      await db.update(profiles)
        .set({ documents: currentDocs })
        .where(eq(profiles.userId, input.studentId));
      return { success: true, document: newDoc };
    }),

  deleteDocument: adminQuery
    .input(z.object({
      studentId: z.number(),
      documentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });
      const currentDocs = Array.isArray(profile.documents) ? profile.documents as any[] : [];
      const filteredDocs = currentDocs.filter((d: any) => d.id !== input.documentId);
      await db.update(profiles)
        .set({ documents: filteredDocs })
        .where(eq(profiles.userId, input.studentId));
      return { success: true };
    }),

  getTeachersAvailability: adminQuery
    .query(async () => {
      const db = getDb();
      const teachersList = await db.query.users.findMany({
        where: and(
          eq(users.role, "teacher"),
          eq(users.status, "active")
        ),
      });

      const teachersWithWorkload = await Promise.all(teachersList.map(async (t) => {
        const activeEnrollments = await db.query.batchEnrollments.findMany({
          where: eq(batchEnrollments.status, "active"),
          with: {
            batch: true
          }
        });

        const teacherActiveStudents = activeEnrollments.filter((e: any) => {
          if (e.batch?.teacherId === t.id) return true;
          if (e.assignedTeachers && Array.isArray(e.assignedTeachers)) {
            const list = e.assignedTeachers as number[];
            return list.includes(t.id);
          }
          return false;
        });

        const activeStudentsCount = teacherActiveStudents.length;

        const scheduledGroupClasses = await db.select({ count: sql<number>`count(*)` })
          .from(classes)
          .where(and(
            eq(classes.teacherId, t.id),
            eq(classes.status, "scheduled")
          ));
        const groupCount = Number(scheduledGroupClasses[0]?.count || 0);

        const scheduledO2OClasses = await db.select({ count: sql<number>`count(*)` })
          .from(oneToOneSessions)
          .where(and(
            eq(oneToOneSessions.teacherId, t.id),
            eq(oneToOneSessions.status, "scheduled")
          ));
        const o2oCount = Number(scheduledO2OClasses[0]?.count || 0);

        const assignedSessionsCount = groupCount + o2oCount;

        const availabilityStatus = "Available";

        return {
          id: t.id,
          name: t.name,
          activeStudentsCount,
          assignedSessionsCount,
          availabilityStatus,
          status: t.status,
        };
      }));

      return teachersWithWorkload;
    }),

  updateStudentPackage: adminQuery
    .input(z.object({
      studentId: z.number(),
      packageConfig: z.object({
        oneToOne: z.object({
          total: z.number().nonnegative(),
          min30: z.number().nonnegative(),
          min45: z.number().nonnegative(),
          min60: z.number().nonnegative(),
        }),
        group: z.object({
          total: z.number().nonnegative(),
          min30: z.number().nonnegative(),
          min45: z.number().nonnegative(),
          min60: z.number().nonnegative(),
        })
      })
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { studentId, packageConfig } = input;

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId),
      });

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found." });
      }

      const o2oSum = packageConfig.oneToOne.min30 + packageConfig.oneToOne.min45 + packageConfig.oneToOne.min60;
      const groupSum = packageConfig.group.min30 + packageConfig.group.min45 + packageConfig.group.min60;

      if (o2oSum !== packageConfig.oneToOne.total) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `One-to-One session duration sum (${o2oSum}) does not match One-to-One total (${packageConfig.oneToOne.total}).`,
        });
      }

      if (groupSum !== packageConfig.group.total) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Group session duration sum (${groupSum}) does not match Group total (${packageConfig.group.total}).`,
        });
      }

      const totalAllocated = packageConfig.oneToOne.total + packageConfig.group.total;

      const oldOneToOne = profile.allocatedOneToOneSessions ?? 0;
      const oldGroup = profile.allocatedGroupSessions ?? 0;
      const oldTotal = profile.totalAllocatedSessions ?? 0;
      const oldConfig = profile.packageConfig as any;

      await db.transaction(async (tx) => {
        await tx.update(profiles)
          .set({
            allocatedOneToOneSessions: packageConfig.oneToOne.total,
            allocatedGroupSessions: packageConfig.group.total,
            totalAllocatedSessions: totalAllocated,
            packageConfig,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, studentId));

        await updateStudentSessionBalances(tx, studentId);

        if (oldOneToOne !== packageConfig.oneToOne.total || oldGroup !== packageConfig.group.total) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "class_count_updated",
            oldValue: `One-to-One: ${oldOneToOne}, Group: ${oldGroup} (Total: ${oldTotal})`,
            newValue: `One-to-One: ${packageConfig.oneToOne.total}, Group: ${packageConfig.group.total} (Total: ${totalAllocated})`,
          });
        }

        const oldO2OStr = oldConfig?.oneToOne
          ? `O2O [30m: ${oldConfig.oneToOne.min30 || 0}, 45m: ${oldConfig.oneToOne.min45 || 0}, 60m: ${oldConfig.oneToOne.min60 || 0}]`
          : `O2O [Unconfigured]`;
        const oldGStr = oldConfig?.group
          ? `Group [30m: ${oldConfig.group.min30 || 0}, 45m: ${oldConfig.group.min45 || 0}, 60m: ${oldConfig.group.min60 || 0}]`
          : `Group [Unconfigured]`;

        const newO2OStr = `O2O [30m: ${packageConfig.oneToOne.min30}, 45m: ${packageConfig.oneToOne.min45}, 60m: ${packageConfig.oneToOne.min60}]`;
        const newGStr = `Group [30m: ${packageConfig.group.min30}, 45m: ${packageConfig.group.min45}, 60m: ${packageConfig.group.min60}]`;

        if (oldO2OStr !== newO2OStr || oldGStr !== newGStr) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "session_distribution_updated",
            oldValue: `${oldO2OStr}, ${oldGStr}`,
            newValue: `${newO2OStr}, ${newGStr}`,
          });
        }
      });

      return { success: true };
    }),

  updateTeacherAssignment: adminQuery
    .input(z.object({
      studentId: z.number(),
      enrollmentId: z.number(),
      teacherIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { studentId, enrollmentId, teacherIds } = input;

      const enrollment = await db.query.batchEnrollments.findFirst({
        where: eq(batchEnrollments.id, enrollmentId),
      });

      if (!enrollment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Enrollment not found." });
      }

      const teachersList = await db.select({
        id: users.id,
        name: users.name,
        status: users.status,
      })
      .from(users)
      .where(and(
        inArray(users.id, teacherIds),
        eq(users.role, "teacher")
      ));

      if (teachersList.length !== teacherIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more selected teachers are invalid or do not exist.",
        });
      }

      const inactiveTeachers = teachersList.filter((t) => t.status !== "active");
      if (inactiveTeachers.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot assign inactive teacher(s): ${inactiveTeachers.map((t) => t.name).join(", ")}.`,
        });
      }

      const oldTeacherIds = enrollment.assignedTeachers && Array.isArray(enrollment.assignedTeachers)
        ? enrollment.assignedTeachers as number[]
        : [];

      let oldTeacherNames = "None";
      if (oldTeacherIds.length > 0) {
        const oldTeachers = await db.select({ name: users.name })
          .from(users)
          .where(inArray(users.id, oldTeacherIds));
        oldTeacherNames = oldTeachers.map((t) => t.name).join(", ");
      }

      const newTeacherNames = teachersList.length > 0
        ? teachersList.map((t) => t.name).join(", ")
        : "None";

      await db.transaction(async (tx) => {
        await tx.update(batchEnrollments)
          .set({
            assignedTeachers: teacherIds,
          })
          .where(eq(batchEnrollments.id, enrollmentId));

        await tx.insert(studentCourseAuditLogs).values({
          studentId,
          changedBy: ctx.user.id,
          changeType: "teacher_changed",
          oldValue: `Assigned: ${oldTeacherNames}`,
          newValue: `Assigned: ${newTeacherNames}`,
        });
      });

      return { success: true };
    }),

  changeBatch: adminQuery
    .input(z.object({
      studentId: z.number(),
      newBatchId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const studentId = input.studentId;
      const toBatchId = input.newBatchId;

      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, studentId),
          eq(batchEnrollments.status, "active")
        ),
      });

      const newBatch = await db.query.batches.findFirst({
        where: eq(batches.id, toBatchId),
        with: { module: true },
      });

      if (!newBatch) {
        throw new TRPCError({ code: "NOT_FOUND", message: "New batch not found" });
      }

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId),
      });

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });
      }

      let oldBatchName = "-";
      let oldBatchId: number | null = null;
      if (activeEnrollment) {
        oldBatchId = activeEnrollment.batchId;
        const oldBatch = await db.query.batches.findFirst({
          where: eq(batches.id, oldBatchId),
        });
        oldBatchName = oldBatch ? oldBatch.name : "-";
      }

      await db.transaction(async (tx) => {
        if (activeEnrollment) {
          await tx.update(batchEnrollments)
            .set({ status: "inactive", leftAt: new Date() })
            .where(eq(batchEnrollments.id, activeEnrollment.id));
        }

        await tx.insert(batchEnrollments).values({
          batchId: toBatchId,
          studentId,
          status: "active",
          assignedTeachers: [],
        });

        let diff = 0;
        if (activeEnrollment && oldBatchId) {
          const oldBatch = await tx.query.batches.findFirst({
            where: eq(batches.id, oldBatchId),
          });
          const oldFee = parseFloat(oldBatch?.courseFee ?? "0");
          const newFee = parseFloat(newBatch.courseFee ?? "0");
          diff = newFee - oldFee;
        } else {
          diff = parseFloat(newBatch.courseFee ?? "0");
        }

        const currentTotal = parseFloat(profile.feesTotal ?? "0");
        const currentPaid = parseFloat(profile.feesPaid ?? "0");
        const nextTotal = Math.max(0, currentTotal + diff);
        const nextBalance = Math.max(0, nextTotal - currentPaid);
        const nextPaymentStatus = nextBalance <= 0 ? "paid" : (currentPaid > 0 ? "partial" : "unpaid");

        await tx.update(profiles)
          .set({
            batch: newBatch.name,
            batchTime: newBatch.timeSlot,
            course: newBatch.module?.name || null,
            feesTotal: String(nextTotal),
            feesBalance: String(nextBalance),
            paymentStatus: nextPaymentStatus,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, studentId));

        await tx.insert(studentCourseAuditLogs).values({
          studentId,
          changedBy: ctx.user.id,
          changeType: "batch_changed",
          oldValue: `Batch: ${oldBatchName}`,
          newValue: `Batch: ${newBatch.name}`,
        });
      });

      return { success: true };
    }),

  updateClassAllocation: adminQuery
    .input(z.object({
      studentId: z.number(),
      allocation: z.object({
        oneToOne: z.object({
          teacherId: z.number().nullable().optional(),
          sessions30: z.number().nonnegative(),
          sessions45: z.number().nonnegative(),
          sessions60: z.number().nonnegative(),
        }),
        group: z.object({
          teacherId: z.number().nullable().optional(),
          batchId: z.number().nullable().optional(),
          sessions30: z.number().nonnegative(),
          sessions45: z.number().nonnegative(),
          sessions60: z.number().nonnegative(),
        }),
      })
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { studentId, allocation } = input;

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId),
      });
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found." });
      }

      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, studentId),
          eq(batchEnrollments.status, "active")
        )
      });
      if (!activeEnrollment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Active enrollment not found for student." });
      }

      const oldAlloc = {
        oneToOne: {
          teacherId: (activeEnrollment.assignedTeachers as any)?.[0] || null,
          sessions30: activeEnrollment.oneOnOne30Allocated,
          sessions45: activeEnrollment.oneOnOne45Allocated,
          sessions60: activeEnrollment.oneOnOne60Allocated,
          completed30: activeEnrollment.oneOnOne30Used,
          completed45: activeEnrollment.oneOnOne45Used,
          completed60: activeEnrollment.oneOnOne60Used,
        },
        group: {
          teacherId: (activeEnrollment.assignedTeachers as any)?.[1] || (activeEnrollment.assignedTeachers as any)?.[0] || null,
          batchId: activeEnrollment.batchId,
          sessions30: activeEnrollment.group30Allocated,
          sessions45: activeEnrollment.group45Allocated,
          sessions60: activeEnrollment.group60Allocated,
          completed30: activeEnrollment.group30Used,
          completed45: activeEnrollment.group45Used,
          completed60: activeEnrollment.group60Used,
        }
      };
      
      await db.transaction(async (tx) => {
        const completedO2O30 = activeEnrollment.oneOnOne30Used || 0;
        const completedO2O45 = activeEnrollment.oneOnOne45Used || 0;
        const completedO2O60 = activeEnrollment.oneOnOne60Used || 0;

        const completedGroup30 = activeEnrollment.group30Used || 0;
        const completedGroup45 = activeEnrollment.group45Used || 0;
        const completedGroup60 = activeEnrollment.group60Used || 0;

        const teacherIds: number[] = [];
        if (allocation.oneToOne.teacherId) teacherIds.push(allocation.oneToOne.teacherId);
        if (allocation.group.teacherId) teacherIds.push(allocation.group.teacherId);

        await tx.update(batchEnrollments)
          .set({
            oneOnOne30Allocated: allocation.oneToOne.sessions30,
            oneOnOne45Allocated: allocation.oneToOne.sessions45,
            oneOnOne60Allocated: allocation.oneToOne.sessions60,
            group30Allocated: allocation.group.sessions30,
            group45Allocated: allocation.group.sessions45,
            group60Allocated: allocation.group.sessions60,
            assignedTeachers: teacherIds,
          })
          .where(eq(batchEnrollments.id, activeEnrollment.id));

        // Recalculate and sync with profile
        await updateStudentSessionBalances(tx, studentId);

        // Audit Teacher assignment changes
        const oldO2OTeacherId = oldAlloc?.oneToOne?.teacherId;
        const newO2OTeacherId = allocation.oneToOne.teacherId;
        if (oldO2OTeacherId !== newO2OTeacherId) {
          const oldT = oldO2OTeacherId ? await tx.query.users.findFirst({ where: eq(users.id, oldO2OTeacherId) }) : null;
          const newT = newO2OTeacherId ? await tx.query.users.findFirst({ where: eq(users.id, newO2OTeacherId) }) : null;
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "teacher_changed",
            oldValue: `O2O Teacher: ${oldT?.name || "None"}`,
            newValue: `O2O Teacher: ${newT?.name || "None"}`,
          });
        }

        const oldGTeacherId = oldAlloc?.group?.teacherId;
        const newGTeacherId = allocation.group.teacherId;
        if (oldGTeacherId !== newGTeacherId) {
          const oldT = oldGTeacherId ? await tx.query.users.findFirst({ where: eq(users.id, oldGTeacherId) }) : null;
          const newT = newGTeacherId ? await tx.query.users.findFirst({ where: eq(users.id, newGTeacherId) }) : null;
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "teacher_changed",
            oldValue: `Group Teacher: ${oldT?.name || "None"}`,
            newValue: `Group Teacher: ${newT?.name || "None"}`,
          });
        }

        // Audit Batch change (Group Session Batch)
        const oldBatchId = oldAlloc?.group?.batchId;
        const newBatchId = allocation.group.batchId;
        if (newBatchId && oldBatchId !== newBatchId) {
          const newBatch = await tx.query.batches.findFirst({ where: eq(batches.id, newBatchId) });
          const oldBatch = oldBatchId ? await tx.query.batches.findFirst({ where: eq(batches.id, oldBatchId) }) : null;

          if (newBatch) {
            const activeEnrollment = await tx.query.batchEnrollments.findFirst({
              where: and(
                eq(batchEnrollments.studentId, studentId),
                eq(batchEnrollments.status, "active")
              )
            });

            if (activeEnrollment) {
              await tx.update(batchEnrollments)
                .set({ status: "inactive", leftAt: new Date() })
                .where(eq(batchEnrollments.id, activeEnrollment.id));
            }

            await tx.insert(batchEnrollments).values({
              batchId: newBatchId,
              studentId,
              status: "active",
              assignedTeachers: newGTeacherId ? [newGTeacherId] : []
            });

            await tx.update(profiles)
              .set({
                batch: newBatch.name,
                batchTime: newBatch.timeSlot,
                updatedAt: new Date()
              })
              .where(eq(profiles.userId, studentId));

            await tx.insert(studentCourseAuditLogs).values({
              studentId,
              changedBy: ctx.user.id,
              changeType: "batch_changed",
              oldValue: `Batch: ${oldBatch?.name || "None"}`,
              newValue: `Batch: ${newBatch.name}`,
            });
          }
        }

        // Audit session count adjustments
        const oldO2OTotal = (oldAlloc?.oneToOne?.sessions30 || 0) + (oldAlloc?.oneToOne?.sessions45 || 0) + (oldAlloc?.oneToOne?.sessions60 || 0);
        const newO2OTotal = allocation.oneToOne.sessions30 + allocation.oneToOne.sessions45 + allocation.oneToOne.sessions60;
        const oldGTotal = (oldAlloc?.group?.sessions30 || 0) + (oldAlloc?.group?.sessions45 || 0) + (oldAlloc?.group?.sessions60 || 0);
        const newGTotal = allocation.group.sessions30 + allocation.group.sessions45 + allocation.group.sessions60;

        if (oldO2OTotal !== newO2OTotal || oldGTotal !== newGTotal) {
          await tx.insert(studentCourseAuditLogs).values({
            studentId,
            changedBy: ctx.user.id,
            changeType: "class_count_updated",
            oldValue: `O2O: ${oldO2OTotal}, Group: ${oldGTotal}`,
            newValue: `O2O: ${newO2OTotal}, Group: ${newGTotal}`,
          });
        }
      });

      return { success: true };
    }),

  listAllocations: authedQuery
    .input(z.object({
      teacherId: z.number().optional(),
      sessionType: z.enum(["one_to_one", "group"]).optional()
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      
      const allAllocations = await db.query.studentClassAllocations.findMany({
        with: {
          student: {
            with: {
              profile: true
            }
          }
        }
      });

      const enriched = await Promise.all(allAllocations.map(async (record) => {
        const alloc = record.allocation as any;
        
        let o2oTeacher = null;
        if (alloc?.oneToOne?.teacherId) {
          o2oTeacher = await db.query.users.findFirst({ where: eq(users.id, alloc.oneToOne.teacherId) });
        }

        let groupTeacher = null;
        if (alloc?.group?.teacherId) {
          groupTeacher = await db.query.users.findFirst({ where: eq(users.id, alloc.group.teacherId) });
        }

        let groupBatch = null;
        if (alloc?.group?.batchId) {
          groupBatch = await db.query.batches.findFirst({ where: eq(batches.id, alloc.group.batchId) });
        }

        return {
          id: record.id,
          studentId: record.studentId,
          student: record.student,
          allocation: alloc,
          o2oTeacher,
          groupTeacher,
          groupBatch,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      }));

      let filtered = enriched;
      if (ctx.user.role === "teacher") {
        filtered = enriched.filter(e => 
          e.allocation?.oneToOne?.teacherId === ctx.user.id || 
          e.allocation?.group?.teacherId === ctx.user.id
        );
      } else if (input?.teacherId) {
        filtered = enriched.filter(e => 
          e.allocation?.oneToOne?.teacherId === input.teacherId || 
          e.allocation?.group?.teacherId === input.teacherId
        );
      }

      return filtered;
    }),
});
