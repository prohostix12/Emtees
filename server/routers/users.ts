import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, sql, count, inArray, ne } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, profiles, batchEnrollments, batches, classes, modules, teacherSalaries, payments, studentClassAllocations } from "@db/schema";
import { sendNotification, sendBulkNotification, getAdminUserIds } from "../lib/notificationEngine";
import { getNextUniqueId } from "../lib/idGenerator";
import { env } from "../lib/env";
import { isStudentFeeRestricted } from "../lib/feeHelper";
import { phoneSchema, parseFullPhone, validatePhoneNumber, PHONE_ERROR_MESSAGE, getCountryISOFromDialCode } from "@contracts/validation";
import { sendUserCredentialsEmail } from "../lib/email";
import bcrypt from "bcryptjs";
import { generateNextEnrollmentId } from "../lib/studentIdGenerator";
import { updateStudentSessionBalances } from "../lib/sessionHelper";


export const userRouter = createRouter({
  list: adminQuery
    .input(
      z.object({
        role: z.enum(["all", "student", "teacher", "admin", "academic_head", "super_admin"]).default("all"),
        search: z.string().optional(),
        status: z.enum(["all", "active", "inactive", "suspended", "on_hold"]).default("all"),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];
      if (input?.role && input.role !== "all") {
        if ((input.role as string) === "sales_executive") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sales executives must be managed through Sales Executive Module." });
        }
        filters.push(eq(users.role, input.role));
      } else if (input?.role === "all" || !input?.role) {
        filters.push(and(ne(users.role, "student"), ne(users.role, "sales_executive")));
      }
      if (input?.status && input.status !== "all") filters.push(eq(users.status, input.status));
      if (input?.search) {
        filters.push(
          sql`${users.name} ILIKE ${"%" + input.search + "%"} OR ${users.phone} ILIKE ${"%" + input.search + "%"} OR ${users.email} ILIKE ${"%" + input.search + "%"} OR ${users.unionId} ILIKE ${"%" + input.search + "%"} OR ${users.specialization} ILIKE ${"%" + input.search + "%"}`
        );
      }

      const where = filters.length > 0 ? and(...filters) : undefined;
      const list = await db.query.users.findMany({
        where,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
        orderBy: desc(users.createdAt),
        with: { profile: true },
      });
      return list;
    }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const user = await db.query.users.findFirst({
        where: eq(users.id, input.id),
        with: { profile: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      if (user.role === "teacher") {
        const assignedBatches = await db.query.batches.findMany({
          where: eq(batches.teacherId, user.id),
          with: { module: true },
        });

        const batchIds = assignedBatches.map(b => b.id);
        let studentsFromBatches: any[] = [];
        if (batchIds.length > 0) {
          const enrollments = await db.query.batchEnrollments.findMany({
            where: and(
              inArray(batchEnrollments.batchId, batchIds),
              eq(batchEnrollments.status, "active")
            ),
            with: {
              student: {
                with: { profile: true }
              },
              batch: true
            }
          });
          studentsFromBatches = enrollments.map(e => ({
            id: e.student.id,
            name: e.student.name,
            unionId: e.student.unionId,
            email: e.student.email,
            phone: e.student.phone,
            status: e.student.status,
            enrollmentType: "Batch Group",
            batchName: e.batch.name
          }));
        }

        const activeEnrollments = await db.query.batchEnrollments.findMany({
          where: eq(batchEnrollments.status, "active"),
          with: {
            student: {
              with: { profile: true }
            },
            batch: true
          }
        });
        const allocatedStudents: any[] = [];
        for (const e of activeEnrollments) {
          const teacherIds = Array.isArray(e.assignedTeachers) ? (e.assignedTeachers as number[]) : [];
          if (teacherIds.includes(user.id)) {
            const studentInfo = e.student;
            if (studentInfo) {
              allocatedStudents.push({
                id: studentInfo.id,
                name: studentInfo.name,
                unionId: studentInfo.unionId,
                email: studentInfo.email,
                phone: studentInfo.phone,
                status: studentInfo.status,
                enrollmentType: "1-to-1",
                batchName: e.batch?.name || studentInfo.profile?.batch || "N/A"
              });
            }
          }
        }

        const allStudentsMap = new Map<number, any>();
        for (const s of studentsFromBatches) {
          allStudentsMap.set(s.id, s);
        }
        for (const s of allocatedStudents) {
          if (!allStudentsMap.has(s.id)) {
            allStudentsMap.set(s.id, s);
          } else {
            const existing = allStudentsMap.get(s.id);
            if (existing.enrollmentType !== s.enrollmentType) {
              existing.enrollmentType = `${existing.enrollmentType} & ${s.enrollmentType}`;
            }
          }
        }
        const assignedStudentsList = Array.from(allStudentsMap.values());

        return {
          ...user,
          assignedBatches,
          assignedStudents: assignedStudentsList
        };
      }

      return user;
    }),

  create: adminQuery
    .input(
      z.object({
        name: z.string().min(2),
        countryCode: z.string().optional(),
        countryISO: z.string().optional(),
        phoneNumber: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        username: z.string().min(3),
        password: z.string().min(6),
        role: z.enum(["student", "teacher", "admin", "academic_head", "super_admin"]),
        courseId: z.number().optional(),
        batchId: z.number().optional(),
        feesTotal: z.number().optional(),
        course: z.string().optional(),
        batch: z.string().optional(),
        canViewSalaryReports: z.boolean().optional(),
        allocatedOneToOneSessions: z.number().optional(),
        allocatedGroupSessions: z.number().optional(),
        paymentType: z.enum(["FULL_PAYMENT", "INSTALLMENT"]).optional(),
        installments: z.array(
          z.object({
            installmentNumber: z.number(),
            amount: z.number(),
            dueDate: z.string().optional(),
          })
        ).optional(),
        enrollmentId: z.string().optional(),
        gender: z.string().optional(),
        dateOfBirth: z.string().or(z.date()).optional(),
        educationalQualification: z.string().optional(),
        specialization: z.string().optional(),
        teachingExperience: z.number().optional(),
        address: z.string().optional(),
        status: z.enum(["active", "inactive", "suspended", "on_hold"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators are allowed to create users.",
        });
      }



      const db = getDb();

      let countryCode = input.countryCode;
      let phoneNumber = input.phoneNumber;
      let countryISO = input.countryISO;

      if (!countryCode || !phoneNumber) {
        if (input.phone) {
          const parsed = parseFullPhone(input.phone);
          if (parsed) {
            countryCode = parsed.countryCode;
            phoneNumber = parsed.phoneNumber;
            countryISO = parsed.countryISO;
          } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: PHONE_ERROR_MESSAGE });
          }
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Country code and phone number are required." });
        }
      }

      if (!countryISO) {
        countryISO = getCountryISOFromDialCode(countryCode) || "IN";
      }

      const valError = validatePhoneNumber(countryCode, phoneNumber, countryISO);
      if (valError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: valError });
      }

      const fullIntNum = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
      const existingPhone = await db.query.users.findFirst({
        where: eq(users.fullInternationalNumber, fullIntNum),
      });
      if (existingPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
      }

      if (input.email) {
        const existingEmail = await db.query.users.findFirst({
          where: eq(users.email, input.email),
        });
        if (existingEmail) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
        }
      }

      if (input.role === "teacher") {
        if (!input.email) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Email is required for teachers." });
        }
        if (!input.gender) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Gender is required for teachers." });
        }
        if (!input.dateOfBirth) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Date of birth is required for teachers." });
        }
        const dob = new Date(input.dateOfBirth);
        if (dob > new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Date of birth cannot be in the future." });
        }
        if (!input.educationalQualification || input.educationalQualification.trim().length < 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Educational qualification is required." });
        }
        if (!input.specialization || input.specialization.trim().length < 2) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Specialization is required (min 2 characters)." });
        }
        if (input.teachingExperience === undefined || input.teachingExperience < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Teaching experience is required and cannot be negative." });
        }
        if (!input.address || input.address.trim().length < 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Address is required." });
        }
        if (input.name.trim().length < 3) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Full Name must be at least 3 characters." });
        }
      }

      const formattedPhone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");

      // Validate student course & batch selection
      if (input.role === "student") {
        if (!input.courseId || !input.batchId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Course and batch are required for student registration.",
          });
        }

        const course = await db.query.modules.findFirst({
          where: eq(modules.id, input.courseId),
        });
        if (!course || course.status !== "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected course is invalid or inactive.",
          });
        }

        const batch = await db.query.batches.findFirst({
          where: eq(batches.id, input.batchId),
        });
        if (!batch || batch.status !== "active" || Number(batch.moduleId) !== input.courseId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected batch is invalid, inactive, or does not belong to the selected course.",
          });
        }
      }

      const existingUsername = await db.query.users.findFirst({
        where: eq(users.username, input.username),
      });
      if (existingUsername) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
      }

      let finalEnrollmentId: string | undefined = undefined;
      if (input.role === "student") {
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
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      const uniqueId = await getNextUniqueId(input.role);
      const canViewReports = ctx.user.role === "super_admin" && input.canViewSalaryReports ? true : false;
      const dobDate = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
      const result = await db.insert(users).values({
        unionId: uniqueId,
        name: input.name,
        phone: formattedPhone,
        countryCode,
        countryISO,
        phoneNumber,
        fullInternationalNumber: fullIntNum,
        email: input.email,
        username: input.username,
        password: hashedPassword,
        role: input.role,
        status: input.status || "active",
        canViewSalaryReports: canViewReports,
        mustChangePassword: true,
        gender: input.gender,
        dateOfBirth: dobDate,
        educationalQualification: input.educationalQualification,
        specialization: input.specialization,
        teachingExperience: input.teachingExperience,
        address: input.address,
      }).returning({ id: users.id });

      const userId = result[0]?.id;

      // Handle profile fee population and enrollment
      if (input.role === "student" && input.courseId && input.batchId) {
        const course = await db.query.modules.findFirst({
          where: eq(modules.id, input.courseId),
        });
        const batch = await db.query.batches.findFirst({
          where: eq(batches.id, input.batchId),
        });

        const defaultFee = batch?.courseFee ? parseFloat(batch.courseFee) : 0;
        const feesTotal = input.feesTotal !== undefined ? input.feesTotal : defaultFee;

        const allocatedOneToOne = input.allocatedOneToOneSessions || 0;
        const allocatedGroup = input.allocatedGroupSessions || 0;
        const totalAllocated = allocatedOneToOne + allocatedGroup;

        let paymentDueDate: Date | null = null;
        const paymentType = input.paymentType || "FULL_PAYMENT";

        if (paymentType === "INSTALLMENT" && input.installments && input.installments.length > 0) {
          const firstInst = input.installments.find((i) => i.installmentNumber === 1);
          if (firstInst?.dueDate) {
            paymentDueDate = new Date(firstInst.dueDate);
          }
        }

        await db.insert(profiles).values({
          userId,
          enrollmentId: finalEnrollmentId,
          course: course?.name || "",
          batch: batch?.name || "",
          batchTime: batch?.timeSlot || "",
          feesTotal: String(feesTotal),
          feesBalance: String(feesTotal),
          paymentStatus: "unpaid",
          paymentDueDate: paymentDueDate,
          paymentOption: paymentType === "INSTALLMENT" ? "installment" : "full_payment",
          totalCourseFee: String(feesTotal),
          remainingBalance: String(feesTotal),
          allocatedOneToOneSessions: allocatedOneToOne,
          allocatedGroupSessions: allocatedGroup,
          totalAllocatedSessions: totalAllocated,
          remainingOneToOneSessions: allocatedOneToOne,
          remainingGroupSessions: allocatedGroup,
          totalRemainingSessions: totalAllocated,
          attendedOneToOneSessions: 0,
          attendedGroupSessions: 0,
          totalAttendedSessions: 0,
        });

        const oneOnOne30Allocated = input.allocatedOneToOneSessions !== undefined
          ? input.allocatedOneToOneSessions
          : (batch?.oneOnOne30Allocated || 0);
        const oneOnOne45Allocated = input.allocatedOneToOneSessions !== undefined ? 0 : (batch?.oneOnOne45Allocated || 0);
        const oneOnOne60Allocated = input.allocatedOneToOneSessions !== undefined ? 0 : (batch?.oneOnOne60Allocated || 0);

        const group30Allocated = input.allocatedGroupSessions !== undefined
          ? input.allocatedGroupSessions
          : (batch?.group30Allocated || 0);
        const group45Allocated = input.allocatedGroupSessions !== undefined ? 0 : (batch?.group45Allocated || 0);
        const group60Allocated = input.allocatedGroupSessions !== undefined ? 0 : (batch?.group60Allocated || 0);

        // Auto-enroll student in the selected batch
        await db.insert(batchEnrollments).values({
          batchId: input.batchId,
          studentId: userId,
          status: "active",
          paymentType,
          moduleId: batch?.moduleId,
          oneOnOne30Allocated,
          oneOnOne45Allocated,
          oneOnOne60Allocated,
          group30Allocated,
          group45Allocated,
          group60Allocated,
          oneOnOne30Used: 0,
          oneOnOne45Used: 0,
          oneOnOne60Used: 0,
          group30Used: 0,
          group45Used: 0,
          group60Used: 0,
          assignedTeachers: batch?.teacherId ? [batch.teacherId] : [],
        });

        // Generate payments
        if (paymentType === "INSTALLMENT" && input.installments && input.installments.length > 0) {
          for (const inst of input.installments) {
            await db.insert(payments).values({
              studentId: userId,
              amount: String(inst.amount),
              type: "tuition",
              status: "unpaid",
              dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
              installmentNumber: inst.installmentNumber,
              batchId: input.batchId,
            });
          }
        } else {
          await db.insert(payments).values({
            studentId: userId,
            amount: String(feesTotal),
            type: "tuition",
            status: "unpaid",
            dueDate: null,
            installmentNumber: null,
            batchId: input.batchId,
          });
        }

        // Sync session balances to profile
        await updateStudentSessionBalances(db, userId);

        // Trigger overcrowding warning if capacity exceeded
        if (batch) {
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
        }
      } else if (input.course || input.feesTotal) {
        // Fallback for legacy creation or non-student profiles
        await db.insert(profiles).values({
          userId,
          enrollmentId: input.role === "student" ? finalEnrollmentId : undefined,
          course: input.course,
          batch: input.batch,
          feesTotal: String(input.feesTotal || 0),
          feesBalance: String(input.feesTotal || 0),
        });
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: { profile: true },
      });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

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
          console.error("[Email Registration Notification Error]:", e);
          emailError = e.message || String(e);
        }
      }

      return {
        ...user,
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
        phone: phoneSchema.optional(),
        email: z.string().email().optional(),
        status: z.enum(["active", "inactive", "suspended", "on_hold"]).optional(),
        course: z.string().optional(),
        batch: z.string().optional(),
        feesTotal: z.number().optional(),
        completionDate: z.date().optional(),
        canViewSalaryReports: z.boolean().optional(),
        enrollmentId: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        gender: z.string().optional(),
        dateOfBirth: z.string().or(z.date()).optional(),
        educationalQualification: z.string().optional(),
        specialization: z.string().optional(),
        teachingExperience: z.number().optional(),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators are allowed to modify users.",
        });
      }

      const db = getDb();
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, input.id),
      });
      if (!currentUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }


      const { 
        id, 
        course, 
        batch, 
        feesTotal, 
        completionDate, 
        canViewSalaryReports, 
        enrollmentId,
        username,
        password,
        ...userData 
      } = input;

      const updateData: any = { ...userData };
      if (ctx.user.role === "super_admin" && canViewSalaryReports !== undefined) {
        updateData.canViewSalaryReports = canViewSalaryReports;
      }

      if (currentUser.role === "teacher") {
        if (input.name !== undefined && input.name.trim().length < 3) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Full Name must be at least 3 characters." });
        }
        if (input.email !== undefined && !input.email) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Email is required for teachers." });
        }
        if (input.gender !== undefined && !input.gender) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Gender is required for teachers." });
        }
        if (input.dateOfBirth !== undefined && !input.dateOfBirth) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Date of birth is required for teachers." });
        }
        if (input.educationalQualification !== undefined && input.educationalQualification.trim().length < 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Educational qualification is required." });
        }
        if (input.specialization !== undefined && input.specialization.trim().length < 2) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Specialization is required (min 2 characters)." });
        }
        if (input.teachingExperience !== undefined && input.teachingExperience < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Teaching experience cannot be negative." });
        }
        if (input.address !== undefined && input.address.trim().length < 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Address is required." });
        }
      }

      if (input.email && input.email !== currentUser.email) {
        const existingEmail = await db.query.users.findFirst({
          where: and(
            eq(users.email, input.email),
            ne(users.id, id)
          ),
        });
        if (existingEmail) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
        }
      }

      if (username && username !== currentUser.username) {
        const existingUsername = await db.query.users.findFirst({
          where: and(
            eq(users.username, username),
            ne(users.id, id)
          ),
        });
        if (existingUsername) {
          throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
        }
        updateData.username = username;
      }

      if (password && password.trim() !== "") {
        if (password.length < 6) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Password must be at least 6 characters." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        updateData.password = hashedPassword;
      }

      if (userData.dateOfBirth) {
        const dobDate = new Date(userData.dateOfBirth);
        if (dobDate > new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Date of birth cannot be in the future." });
        }
        updateData.dateOfBirth = dobDate;
      }

      let countryCode = input.countryCode;
      let phoneNumber = input.phoneNumber;
      let countryISO = input.countryISO;

      if (countryCode || phoneNumber || input.phone) {

        if (input.phone && !countryCode && !phoneNumber) {
          const parsed = parseFullPhone(input.phone);
          if (parsed) {
            countryCode = parsed.countryCode;
            phoneNumber = parsed.phoneNumber;
            countryISO = parsed.countryISO;
          } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number." });
          }
        } else {
          countryCode = countryCode ?? currentUser.countryCode ?? "";
          phoneNumber = phoneNumber ?? currentUser.phoneNumber ?? "";
          countryISO = countryISO ?? currentUser.countryISO ?? "";
        }

        if (!countryISO) {
          countryISO = getCountryISOFromDialCode(countryCode) || "IN";
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

        delete updateData.phone;
        updateData.countryCode = countryCode;
        updateData.countryISO = countryISO;
        updateData.phoneNumber = phoneNumber;
        updateData.fullInternationalNumber = fullIntNum;
        updateData.phone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
      }

      await db.update(users).set(updateData).where(eq(users.id, id));

      let profileEnrollmentId: string | undefined = undefined;
      if (enrollmentId !== undefined && currentUser.role === "student") {
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
          profileEnrollmentId = trimmedId;
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Enrollment ID cannot be empty." });
        }
      }

      if (course !== undefined || batch !== undefined || feesTotal !== undefined || completionDate !== undefined || profileEnrollmentId !== undefined) {
        const existingProfile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, id),
        });
        if (existingProfile) {
          let feesBalance: string | undefined;
          if (feesTotal !== undefined) {
            const feesPaid = parseFloat(existingProfile.feesPaid ?? "0");
            feesBalance = String(feesTotal - feesPaid);
          }
          await db.update(profiles)
            .set({
              course,
              batch,
              feesTotal: feesTotal !== undefined ? String(feesTotal) : undefined,
              feesBalance,
              completionDate,
              enrollmentId: profileEnrollmentId,
            })
            .where(eq(profiles.userId, id));
        } else {
          await db.insert(profiles).values({
            userId: id,
            course,
            batch,
            feesTotal: String(feesTotal || 0),
            feesBalance: String(feesTotal || 0),
            completionDate,
            enrollmentId: profileEnrollmentId,
          });
        }

        // Task 15.1 — auto-enroll in community group batch when completionDate is set
        if (completionDate) {
          const communityBatch = await db.query.batches.findFirst({
            where: eq(batches.isCommunityGroup, true),
          });
          if (communityBatch) {
            // Only enroll if not already enrolled
            const existingEnrollment = await db.query.batchEnrollments.findFirst({
              where: and(
                eq(batchEnrollments.batchId, communityBatch.id),
                eq(batchEnrollments.studentId, id),
              ),
            });
            if (!existingEnrollment) {
              await db.insert(batchEnrollments).values({
                batchId: communityBatch.id,
                studentId: id,
                status: "active",
              });
              await sendNotification(
                id,
                "Welcome to the Community Group",
                `Congratulations on completing your course! You have been enrolled in the community group: ${communityBatch.name}.`,
                "community_group_welcome",
              );
            }
          }
        }
      }

      return db.query.users.findFirst({ where: eq(users.id, id), with: { profile: true } });
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators are allowed to delete users.",
        });
      }

      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot delete your own account.",
        });
      }

      const db = getDb();
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, input.id),
      });

      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }



      if (targetUser.role === "super_admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied: Only a Super Admin can delete another Super Admin.",
        });
      }

      try {
        await db.delete(users).where(eq(users.id, input.id));
        return { success: true };
      } catch (error: any) {
        console.error(`[user.delete] Failed to delete user id ${input.id}:`, error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete user. Database constraint error: ${error.message || error}`,
        });
      }
    }),

  myProfile: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      with: {
        profile: true,
        enrollments: true,
      },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    const isRestricted = user.role === "student" ? await isStudentFeeRestricted(user.id) : false;
    return {
      ...user,
      isRestricted,
    };
  }),

  myBatches: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    if (ctx.user.role === "teacher") {
      const teacherBatches = await db.query.batches.findMany({
        where: eq(batches.teacherId, ctx.user.id),
        with: { module: true, teacher: true },
      });
      return teacherBatches.map((b) => ({
        id: b.id,
        batchId: b.id,
        status: "active",
        batch: b,
      }));
    }

    const enrollments = await db.query.batchEnrollments.findMany({
      where: eq(batchEnrollments.studentId, ctx.user.id),
      with: { batch: { with: { module: true, teacher: true } } },
    });
    return enrollments;
  }),

  getTeacherStats: teacherQuery.query(async ({ ctx }) => {
    const db = getDb();
    
    // 1. Find batches assigned to this teacher
    const teacherBatches = await db.select({ id: batches.id }).from(batches).where(eq(batches.teacherId, ctx.user.id));
    const batchIds = teacherBatches.map(b => b.id);
    
    let studentCount = 0;
    if (batchIds.length > 0) {
      const uniqueStudents = await db
        .select({ studentId: batchEnrollments.studentId })
        .from(batchEnrollments)
        .where(and(inArray(batchEnrollments.batchId, batchIds), eq(batchEnrollments.status, "active")))
        .groupBy(batchEnrollments.studentId);
      studentCount = uniqueStudents.length;
    }
    
    // 2. Count classes held/scheduled by this teacher
    const [{ value: classesCount }] = await db
      .select({ value: count() })
      .from(classes)
      .where(eq(classes.teacherId, ctx.user.id));

    // 3. Current month's earnings
    const currentMonth = new Date().toISOString().substring(0, 7);
    const currentSalary = await db.query.teacherSalaries.findFirst({
      where: and(
        eq(teacherSalaries.teacherId, ctx.user.id),
        eq(teacherSalaries.month, currentMonth)
      )
    });
    const currentMonthEarnings = currentSalary ? parseFloat(currentSalary.totalAmount || "0") : 0;

    return {
      classesCount,
      studentCount,
      currentMonthEarnings,
    };
  }),

  mySalaries: teacherQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.teacherSalaries.findMany({
      where: eq(teacherSalaries.teacherId, ctx.user.id),
      orderBy: desc(teacherSalaries.month),
    });
  }),

  myExportSalaryReport: teacherQuery
    .input(z.object({
      month: z.string(),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const teacher = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
      const salary = await db.query.teacherSalaries.findFirst({
        where: and(
          eq(teacherSalaries.teacherId, ctx.user.id),
          eq(teacherSalaries.month, input.month),
        ),
        with: { teacher: true },
      });

      return {
        format: input.format,
        message: "Use this structured data for client-side report generation.",
        data: {
          teacher: teacher ? { id: teacher.id, name: teacher.name, email: teacher.email } : null,
          month: input.month,
          salary: salary ?? null,
        },
      };
    }),

  importStudents: adminQuery
    .input(z.array(z.object({
      name: z.string(),
      phone: phoneSchema,
      email: z.string().optional(),
      course: z.string().optional(),
      batch: z.string().optional(),
      feesTotal: z.number().optional(),
      userId: z.string().optional(),
      enrollmentId: z.string().optional(),
    })))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators are allowed to import students.",
        });
      }

      const db = getDb();
      const results = [];
      for (const s of input) {
        const parsed = parseFullPhone(s.phone);
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid phone number format for student ${s.name}: ${s.phone}`,
          });
        }
        const { countryCode, phoneNumber, countryISO } = parsed;
        const valError = validatePhoneNumber(countryCode, phoneNumber, countryISO);
        if (valError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Validation failed for student ${s.name} (${s.phone}): ${valError}`,
          });
        }

        const fullIntNum = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
        const existingPhone = await db.query.users.findFirst({
          where: eq(users.fullInternationalNumber, fullIntNum),
        });
        if (existingPhone) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Phone number ${s.phone} is already registered.`,
          });
        }

        const hashedPassword = await bcrypt.hash(phoneNumber.slice(-6), 10);
        
        let finalEnrollmentId = s.enrollmentId || s.userId;
        let uniqueId: string;

        if (s.userId) {
          const prefix = env.studentIdPrefix || "STU";
          const regex = new RegExp(`^${prefix}\\d{3,8}$`);
          if (!regex.test(s.userId)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid User ID "${s.userId}". User ID must match the sequence format (e.g. ${prefix}0001). Custom User IDs are not allowed.`,
            });
          }
          const existingProfile = await db.query.profiles.findFirst({
            where: eq(profiles.enrollmentId, s.userId),
          });
          if (existingProfile) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Enrollment ID "${s.userId}" is already taken.`,
            });
          }
          const existingUserWithId = await db.query.users.findFirst({
            where: and(eq(users.unionId, s.userId), eq(users.role, "student")),
          });
          if (existingUserWithId) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Enrollment ID "${s.userId}" conflicts with an existing Student ID.`,
            });
          }
          finalEnrollmentId = s.userId;
          uniqueId = s.userId;
        } else if (s.enrollmentId) {
          const existingProfile = await db.query.profiles.findFirst({
            where: eq(profiles.enrollmentId, s.enrollmentId),
          });
          if (existingProfile) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Enrollment ID "${s.enrollmentId}" is already taken.`,
            });
          }
          const existingUserWithId = await db.query.users.findFirst({
            where: and(eq(users.unionId, s.enrollmentId), eq(users.role, "student")),
          });
          if (existingUserWithId) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Enrollment ID "${s.enrollmentId}" conflicts with an existing Student ID.`,
            });
          }
          finalEnrollmentId = s.enrollmentId;
          uniqueId = await getNextUniqueId("student");
        } else {
          finalEnrollmentId = await generateNextEnrollmentId();
          uniqueId = await getNextUniqueId("student");
        }
        
        const formattedPhone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
        const tempPassword = phoneNumber.slice(-6);
        const result = await db.insert(users).values({
          unionId: uniqueId,
          name: s.name,
          phone: formattedPhone,
          countryCode,
          countryISO,
          phoneNumber,
          fullInternationalNumber: fullIntNum,
          email: s.email,
          username: formattedPhone,
          password: hashedPassword,
          role: "student",
          mustChangePassword: true,
        }).returning({ id: users.id });
        const userId = result[0]?.id;

        if (s.email) {
          try {
            const origin = ctx.req.headers.get("origin") || "https://your-lms-domain.com";
            const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : `${origin}/login`;
            await sendUserCredentialsEmail({
              email: s.email,
              name: s.name,
              username: formattedPhone,
              password: tempPassword,
              loginUrl,
            });
          } catch (e: any) {
            console.error(`[importStudents] Failed to send email to ${s.email}:`, e);
          }
        }

        await db.insert(profiles).values({
          userId,
          enrollmentId: finalEnrollmentId,
          course: s.course || "",
          batch: s.batch || "",
          feesTotal: String(s.feesTotal || 0),
          feesBalance: String(s.feesTotal || 0),
        });
        results.push(userId);
      }
      return { imported: results.length };
    }),

  updateMyProfile: authedQuery
    .input(
      z.object({
        name: z.string().min(2),
        username: z.string().min(3),
        countryCode: z.string().optional(),
        countryISO: z.string().optional(),
        phoneNumber: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!currentUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (currentUser.role === "student" && input.username !== currentUser.username) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Students are not allowed to modify their username.",
        });
      }

      // 1. Verify username uniqueness
      const existingUsername = await db.query.users.findFirst({
        where: and(eq(users.username, input.username), ne(users.id, userId)),
      });
      if (existingUsername) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Username already taken",
        });
      }

      let countryCode = input.countryCode;
      let phoneNumber = input.phoneNumber;
      let countryISO = input.countryISO;

      if (!countryCode || !phoneNumber) {
        if (input.phone) {
          const parsed = parseFullPhone(input.phone);
          if (parsed) {
            countryCode = parsed.countryCode;
            phoneNumber = parsed.phoneNumber;
            countryISO = parsed.countryISO;
          } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: PHONE_ERROR_MESSAGE });
          }
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Country code and phone number are required." });
        }
      }

      if (!countryISO) {
        countryISO = getCountryISOFromDialCode(countryCode) || "IN";
      }

      const valError = validatePhoneNumber(countryCode, phoneNumber, countryISO);
      if (valError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: valError });
      }

      const fullIntNum = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
      const existingPhone = await db.query.users.findFirst({
        where: and(
          eq(users.fullInternationalNumber, fullIntNum),
          ne(users.id, userId)
        ),
      });
      if (existingPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
      }

      const formattedPhone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");

      // 2. Update the user
      await db.update(users)
        .set({
          name: input.name,
          username: input.username,
          phone: formattedPhone,
          countryCode,
          countryISO,
          phoneNumber,
          fullInternationalNumber: fullIntNum,
        })
        .where(eq(users.id, userId));

      return { success: true };
    }),

  changeMyPassword: authedQuery
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6),
        confirmPassword: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.newPassword !== input.confirmPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "New passwords do not match",
        });
      }

      const db = getDb();
      const userId = ctx.user.id;

      // Fetch user to verify current password
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user || !user.password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const matches = await bcrypt.compare(input.currentPassword, user.password);
      if (!matches) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Incorrect current password",
        });
      }

      const hashed = await bcrypt.hash(input.newPassword, 10);
      await db.update(users).set({ password: hashed, mustChangePassword: false }).where(eq(users.id, userId));

      // Send critical security notification: "User is notified when the password is successfully changed."
      await sendNotification(
        userId,
        "Password Changed",
        "Your account password has been successfully updated.",
        "security" // critical type that cannot be paused
      );

      return { success: true };
    }),

  updateNotificationPause: authedQuery
    .input(
      z.object({
        pauseOption: z.enum(["1_hour", "8_hours", "24_hours", "indefinite", "resume"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      let pausedUntil: Date | null = null;
      if (input.pauseOption === "1_hour") {
        pausedUntil = new Date(Date.now() + 1 * 60 * 60 * 1000);
      } else if (input.pauseOption === "8_hours") {
        pausedUntil = new Date(Date.now() + 8 * 60 * 60 * 1000);
      } else if (input.pauseOption === "24_hours") {
        pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      } else if (input.pauseOption === "indefinite") {
        // Special far-future timestamp: 9999-12-31T23:59:59.000Z
        pausedUntil = new Date("9999-12-31T23:59:59.000Z");
      } else if (input.pauseOption === "resume") {
        pausedUntil = null;
      }

      await db.update(users)
        .set({ notificationsPausedUntil: pausedUntil })
        .where(eq(users.id, userId));

      return { success: true, pausedUntil: pausedUntil ? pausedUntil.toISOString() : null };
    }),
});
