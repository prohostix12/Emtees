import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql, count, gte, lte, ne } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  users,
  profiles,
  salesExecutives,
  batches,
  modules,
  batchEnrollments,
  payments
} from "@db/schema";
import { getNextUniqueId } from "../lib/idGenerator";
import { phoneSchema, parseFullPhone, validatePhoneNumber, PHONE_ERROR_MESSAGE, getCountryISOFromDialCode } from "@contracts/validation";
import bcrypt from "bcryptjs";
import { generateNextEnrollmentId } from "../lib/studentIdGenerator";

// Sales Executive middleware: checks if user is super_admin, admin, or sales_executive
const salesExecQuery = authedQuery.use(async ({ ctx, next }) => {
  const allowedRoles = ["super_admin", "admin", "sales_executive"];
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sales Executive or Admin access required" });
  }
  return next({ ctx });
});

export const salesExecutiveRouter = createRouter({
  // 1. List Sales Executives (Admin only)
  listExecutives: adminQuery
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "active", "inactive"]).default("all"),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];

      if (input?.status && input.status !== "all") {
        filters.push(eq(salesExecutives.status, input.status));
      }

      if (input?.search) {
        filters.push(
          sql`${salesExecutives.name} ILIKE ${"%" + input.search + "%"} OR ${salesExecutives.employeeId} ILIKE ${"%" + input.search + "%"} OR ${salesExecutives.email} ILIKE ${"%" + input.search + "%"}`
        );
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      const list = await db.query.salesExecutives.findMany({
        where: whereClause,
        orderBy: desc(salesExecutives.createdAt),
      });

      // Augment with student count
      const result = [];
      for (const exec of list) {
        const [{ value: studentCount }] = await db
          .select({ value: count() })
          .from(users)
          .where(eq(users.salesExecutiveId, exec.id));

        result.push({
          ...exec,
          studentCount,
        });
      }
      return result;
    }),

  // 2. Add Sales Executive (Admin only)
  createExecutive: adminQuery
    .input(
      z.object({
        name: z.string().min(2),
        email: z.string().email(),
        phone: z.string().min(6),
        username: z.string().min(3),
        password: z.string().min(6),
        status: z.enum(["active", "inactive"]).default("active"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      // Check if username already exists in users table
      const existingUser = await db.query.users.findFirst({
        where: eq(users.username, input.username),
      });
      if (existingUser) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
      }

      // Check if username already exists in sales_executives table (redundancy check)
      const existingExecUser = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.username, input.username),
      });
      if (existingExecUser) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists in sales executives" });
      }

      // Check email uniqueness in salesExecutives
      const existingEmail = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.email, input.email),
      });
      if (existingEmail) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered for another sales executive" });
      }

      // Check email uniqueness in users
      const existingUserEmail = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });
      if (existingUserEmail) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered for another user" });
      }

      // Parse and validate phone number
      const parsedPhone = parseFullPhone(input.phone);
      if (!parsedPhone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number." });
      }
      const formattedPhone = `${parsedPhone.countryCode}${parsedPhone.phoneNumber}`.replace(/\s+/g, "");
      const fullIntNum = `${parsedPhone.countryCode}${parsedPhone.phoneNumber}`.replace(/\s+/g, "");
      
      const valError = validatePhoneNumber(parsedPhone.countryCode, parsedPhone.phoneNumber, parsedPhone.countryISO);
      if (valError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: valError });
      }

      // Check if phone number already exists in users table
      const existingUserPhone = await db.query.users.findFirst({
        where: eq(users.fullInternationalNumber, fullIntNum),
      });
      if (existingUserPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone number already registered" });
      }

      // Check if phone number already exists in salesExecutives table
      const existingExecPhone = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.fullInternationalNumber, fullIntNum),
      });
      if (existingExecPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone number already registered for another sales executive" });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);
      const employeeId = await getNextUniqueId("sales_executive");
      const referralCode = employeeId; // initially same as employeeId

      // Create record in users table to enable login
      const userResult = await db.insert(users).values({
        unionId: employeeId,
        name: input.name,
        username: input.username,
        password: hashedPassword,
        email: input.email,
        phone: formattedPhone,
        countryCode: parsedPhone.countryCode,
        countryISO: parsedPhone.countryISO,
        phoneNumber: parsedPhone.phoneNumber,
        fullInternationalNumber: fullIntNum,
        role: "sales_executive",
        status: input.status === "active" ? "active" : "inactive",
        mustChangePassword: false,
      }).returning({ id: users.id });

      const userId = userResult[0].id;

      // Create record in sales_executives table
      const execResult = await db.insert(salesExecutives).values({
        userId,
        employeeId,
        name: input.name,
        email: input.email,
        phone: formattedPhone,
        countryCode: parsedPhone.countryCode,
        countryISO: parsedPhone.countryISO,
        phoneNumber: parsedPhone.phoneNumber,
        fullInternationalNumber: fullIntNum,
        username: input.username,
        password: hashedPassword,
        referralCode,
        status: input.status,
      }).returning();

      return execResult[0];
    }),

  // 3. Edit Sales Executive (Admin only)
  editExecutive: adminQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(2),
        email: z.string().email(),
        phone: z.string().min(6),
        status: z.enum(["active", "inactive"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.id, input.id),
      });
      if (!exec) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sales Executive not found" });
      }

      // Check email uniqueness
      const existingEmail = await db.query.salesExecutives.findFirst({
        where: and(eq(salesExecutives.email, input.email), ne(salesExecutives.id, input.id)),
      });
      if (existingEmail) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered for another executive" });
      }

      const existingUserEmail = await db.query.users.findFirst({
        where: and(eq(users.email, input.email), ne(users.id, exec.userId)),
      });
      if (existingUserEmail) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered for another user" });
      }

      // Check phone uniqueness
      const parsedPhone = parseFullPhone(input.phone);
      if (!parsedPhone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number." });
      }
      const formattedPhone = `${parsedPhone.countryCode}${parsedPhone.phoneNumber}`.replace(/\s+/g, "");
      const fullIntNum = `${parsedPhone.countryCode}${parsedPhone.phoneNumber}`.replace(/\s+/g, "");
      
      const valError = validatePhoneNumber(parsedPhone.countryCode, parsedPhone.phoneNumber, parsedPhone.countryISO);
      if (valError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: valError });
      }

      const existingUserPhone = await db.query.users.findFirst({
        where: and(
          eq(users.fullInternationalNumber, fullIntNum),
          ne(users.id, exec.userId)
        ),
      });
      if (existingUserPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone number already registered" });
      }

      const existingExecPhone = await db.query.salesExecutives.findFirst({
        where: and(eq(salesExecutives.fullInternationalNumber, fullIntNum), ne(salesExecutives.id, input.id)),
      });
      if (existingExecPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone number already registered for another sales executive" });
      }

      // Update users table
      await db.update(users)
        .set({
          name: input.name,
          email: input.email,
          phone: formattedPhone,
          countryCode: parsedPhone.countryCode,
          countryISO: parsedPhone.countryISO,
          phoneNumber: parsedPhone.phoneNumber,
          fullInternationalNumber: fullIntNum,
          status: input.status === "active" ? "active" : "inactive",
        })
        .where(eq(users.id, exec.userId));

      // Update sales_executives table
      const updated = await db.update(salesExecutives)
        .set({
          name: input.name,
          email: input.email,
          phone: formattedPhone,
          countryCode: parsedPhone.countryCode,
          countryISO: parsedPhone.countryISO,
          phoneNumber: parsedPhone.phoneNumber,
          fullInternationalNumber: fullIntNum,
          status: input.status,
        })
        .where(eq(salesExecutives.id, input.id))
        .returning();

      return updated[0];
    }),

  // 4. Toggle Status (Admin only)
  toggleStatus: adminQuery
    .input(z.object({ id: z.number(), status: z.enum(["active", "inactive"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.id, input.id),
      });
      if (!exec) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(users)
        .set({ status: input.status === "active" ? "active" : "inactive" })
        .where(eq(users.id, exec.userId));

      const updated = await db.update(salesExecutives)
        .set({ status: input.status })
        .where(eq(salesExecutives.id, input.id))
        .returning();

      return updated[0];
    }),

  // 5. Reset Password (Admin only)
  resetPassword: adminQuery
    .input(z.object({ id: z.number(), newPassword: z.string().min(6) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.id, input.id),
      });
      if (!exec) throw new TRPCError({ code: "NOT_FOUND" });

      const hashedPassword = await bcrypt.hash(input.newPassword, 10);

      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, exec.userId));

      await db.update(salesExecutives)
        .set({ password: hashedPassword })
        .where(eq(salesExecutives.id, input.id));

      return { success: true, message: "Password updated successfully" };
    }),

  // 6. Regenerate Referral Code (Admin only)
  regenerateReferralCode: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.id, input.id),
      });
      if (!exec) throw new TRPCError({ code: "NOT_FOUND" });

      const randomSuffix = Math.floor(100 + Math.random() * 900).toString();
      const newReferralCode = `${exec.employeeId}-${randomSuffix}`;

      const updated = await db.update(salesExecutives)
        .set({ referralCode: newReferralCode })
        .where(eq(salesExecutives.id, input.id))
        .returning();

      return updated[0];
    }),

  // 7. Get Performance Dashboard (Admin only)
  getPerformanceDashboard: adminQuery
    .input(
      z.object({
        salesExecutiveId: z.number().optional(),
        period: z.enum(["daily", "weekly", "monthly", "all"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      let dateFilter = sql`1=1`;

      if (input.period === "daily") {
        dateFilter = sql`created_at >= NOW() - INTERVAL '1 day'`;
      } else if (input.period === "weekly") {
        dateFilter = sql`created_at >= NOW() - INTERVAL '7 days'`;
      } else if (input.period === "monthly") {
        dateFilter = sql`created_at >= NOW() - INTERVAL '30 days'`;
      }

      let execs = [];
      if (input.salesExecutiveId) {
        execs = await db.query.salesExecutives.findMany({
          where: eq(salesExecutives.id, input.salesExecutiveId),
        });
      } else {
        execs = await db.query.salesExecutives.findMany();
      }

      const results = [];
      for (const exec of execs) {
        // Registrations through Referral Code (Users created)
        const [{ value: totalRegistrations }] = await db
          .select({ value: count() })
          .from(users)
          .where(and(eq(users.salesExecutiveId, exec.id), dateFilter));

        // Active Students (Students with status = 'active')
        const [{ value: activeStudents }] = await db
          .select({ value: count() })
          .from(users)
          .where(and(eq(users.salesExecutiveId, exec.id), eq(users.role, "student"), eq(users.status, "active"), dateFilter));

        // Enrollments count (students who are active/enrolled in a batch)
        const [{ value: totalEnrollments }] = await db
          .select({ value: count() })
          .from(batchEnrollments)
          .innerJoin(users, eq(batchEnrollments.studentId, users.id))
          .where(and(eq(users.salesExecutiveId, exec.id), dateFilter));

        // Revenue Generated (Sum of payments paid by referred students)
        const revenueResult = await db
          .select({ value: sql<string>`SUM(CAST(amount as DECIMAL(10,2)))` })
          .from(payments)
          .innerJoin(users, eq(payments.studentId, users.id))
          .where(and(eq(users.salesExecutiveId, exec.id), eq(payments.status, "paid"), dateFilter));

        const revenue = parseFloat(revenueResult[0]?.value || "0");

        results.push({
          id: exec.id,
          employeeId: exec.employeeId,
          name: exec.name,
          totalRegistrations,
          totalEnrollments,
          revenueGenerated: revenue,
          activeStudents,
        });
      }

      return results;
    }),



  // 10. Get Referral Link details (Sales Executive only)
  getReferralLink: salesExecQuery
    .query(async ({ ctx }) => {
      const db = getDb();
      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.userId, ctx.user.id),
      });
      if (!exec) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        referralCode: exec.referralCode,
        employeeId: exec.employeeId,
        link: `/admission/${exec.referralCode}`,
      };
    }),

  // 11. My Students (Sales Executive only: view their own referred students)
  getMyStudents: salesExecQuery
    .input(
      z.object({
        search: z.string().optional(),
        course: z.string().optional(),
        status: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();

      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.userId, ctx.user.id),
      });
      if (!exec) throw new TRPCError({ code: "NOT_FOUND" });

      const filters = [eq(users.salesExecutiveId, exec.id), eq(users.role, "student")];

      if (input?.status && input.status !== "all") {
        filters.push(eq(users.status, input.status as any));
      }

      if (input?.search) {
        filters.push(
          sql`(${users.name} ILIKE ${"%" + input.search + "%"} OR ${users.phone} ILIKE ${"%" + input.search + "%"} OR ${users.unionId} ILIKE ${"%" + input.search + "%"} OR EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = ${users.id} AND profiles.enrollment_id ILIKE ${"%" + input.search + "%"}))`
        );
      }

      const whereClause = and(...filters);
      const list = await db.query.users.findMany({
        where: whereClause,
        orderBy: desc(users.createdAt),
        with: {
          profile: true,
        },
      });

      let filteredList = list;
      if (input?.course && input.course !== "all") {
        filteredList = list.filter((u) => u.profile?.course === input.course);
      }

      return filteredList;
    }),



  // 14. Local Dashboard Stats (Sales Executive only)
  getDashboardStats: salesExecQuery
    .query(async ({ ctx }) => {
      const db = getDb();
      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.userId, ctx.user.id),
      });
      if (!exec) throw new TRPCError({ code: "NOT_FOUND" });

      const [{ value: totalRegistrations }] = await db
        .select({ value: count() })
        .from(users)
        .where(eq(users.salesExecutiveId, exec.id));

      const [{ value: totalEnrollments }] = await db
        .select({ value: count() })
        .from(batchEnrollments)
        .innerJoin(users, eq(batchEnrollments.studentId, users.id))
        .where(eq(users.salesExecutiveId, exec.id));

      const recentRegistrations = await db.query.users.findMany({
        where: eq(users.salesExecutiveId, exec.id),
        orderBy: desc(users.createdAt),
        limit: 5,
        with: {
          profile: true,
        },
      });

      return {
        totalRegistrations,
        totalEnrollments,
        recentRegistrations,
      };
    }),

  // 15. Get Referral Info (Public: details of the referral code)
  getReferralInfo: publicQuery
    .input(z.object({ referralCode: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.referralCode, input.referralCode),
      });
      if (!exec || exec.status !== "active") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or inactive referral link." });
      }

      const activeCourses = await db.query.modules.findMany({
        where: eq(modules.status, "active"),
      });

      const activeBatches = await db.query.batches.findMany({
        where: eq(batches.status, "active"),
      });

      return {
        salesExecutive: {
          id: exec.id,
          name: exec.name,
          referralCode: exec.referralCode,
        },
        courses: activeCourses,
        batches: activeBatches,
      };
    }),

  // 16. Public student registration with referral (Public)
  registerStudentWithReferral: publicQuery
    .input(
      z.object({
        name: z.string().min(2),
        phone: z.string().min(6),
        email: z.string().email().optional(),
        username: z.string().min(3),
        password: z.string().min(6),
        courseId: z.number(),
        batchId: z.number(),
        referralCode: z.string(),
        gender: z.string().optional(),
        dob: z.string().optional(),
        educationalQualification: z.string().optional(),
        parentName: z.string().optional(),
        parentPhone: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      const exec = await db.query.salesExecutives.findFirst({
        where: eq(salesExecutives.referralCode, input.referralCode),
      });
      if (!exec || exec.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Referral code is invalid or inactive." });
      }

      const existingUser = await db.query.users.findFirst({
        where: eq(users.username, input.username),
      });
      if (existingUser) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already taken." });
      }

      const parsedPhone = parseFullPhone(input.phone);
      if (!parsedPhone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number." });
      }
      const formattedPhone = `${parsedPhone.countryCode}${parsedPhone.phoneNumber}`.replace(/\s+/g, "");
      const fullIntNum = `${parsedPhone.countryCode}${parsedPhone.phoneNumber}`.replace(/\s+/g, "");

      const valError = validatePhoneNumber(parsedPhone.countryCode, parsedPhone.phoneNumber, parsedPhone.countryISO);
      if (valError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: valError });
      }

      const existingPhone = await db.query.users.findFirst({
        where: eq(users.fullInternationalNumber, fullIntNum),
      });
      if (existingPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone number already registered." });
      }

      const course = await db.query.modules.findFirst({
        where: and(eq(modules.id, input.courseId), eq(modules.status, "active")),
      });
      if (!course) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid course selection." });

      const batch = await db.query.batches.findFirst({
        where: and(eq(batches.id, input.batchId), eq(batches.status, "active"), eq(batches.moduleId, input.courseId)),
      });
      if (!batch) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid batch selection." });

      const uniqueStudentId = await getNextUniqueId("student");
      const hashedPassword = await bcrypt.hash(input.password, 10);

      const userResult = await db.insert(users).values({
        unionId: uniqueStudentId,
        name: input.name,
        username: input.username,
        password: hashedPassword,
        email: input.email || null,
        phone: formattedPhone,
        countryCode: parsedPhone.countryCode,
        countryISO: parsedPhone.countryISO,
        phoneNumber: parsedPhone.phoneNumber,
        fullInternationalNumber: fullIntNum,
        role: "student",
        status: "active",
        mustChangePassword: true,
        salesExecutiveId: exec.id,
        referralCode: input.referralCode,
        registrationSource: "referral",
      }).returning({ id: users.id });

      const studentId = userResult[0].id;

      const nextEnrollmentId = await generateNextEnrollmentId();
      const defaultFee = batch.courseFee ? parseFloat(batch.courseFee) : 0;

      // Validate and parse parent phone
      let parentCountryCode = "";
      let parentCountryISO = "";
      let parentPhoneNumber = "";
      let parentFullInt = "";

      if (input.parentPhone) {
        const parsedParent = parseFullPhone(input.parentPhone);
        if (parsedParent) {
          parentCountryCode = parsedParent.countryCode;
          parentCountryISO = parsedParent.countryISO;
          parentPhoneNumber = parsedParent.phoneNumber;
          parentFullInt = `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "");
        }
      }

      await db.insert(profiles).values({
        userId: studentId,
        enrollmentId: nextEnrollmentId,
        course: course.name,
        batch: batch.name,
        batchTime: batch.timeSlot || "",
        feesTotal: String(defaultFee),
        feesBalance: String(defaultFee),
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
        gender: input.gender || null,
        dob: input.dob ? new Date(input.dob) : null,
        educationalQualification: input.educationalQualification || null,
        parentName: input.parentName || null,
        parentPhone: parentCountryCode && parentPhoneNumber ? `${parentCountryCode} ${parentPhoneNumber}` : (input.parentPhone || null),
        parentCountryCode: parentCountryCode || null,
        parentCountryISO: parentCountryISO || null,
        parentPhoneNumber: parentPhoneNumber || null,
        parentFullInternationalNumber: parentFullInt || null,
      });

      await db.insert(batchEnrollments).values({
        batchId: input.batchId,
        studentId: studentId,
        status: "active",
        paymentType: "FULL_PAYMENT",
      });

      await db.insert(payments).values({
        studentId: studentId,
        amount: String(defaultFee),
        type: "tuition",
        status: "unpaid",
        batchId: input.batchId,
      });



      return {
        success: true,
        studentId: uniqueStudentId,
        message: "Registration successful. You can now login with your credentials.",
      };
    }),

  getAllRegistrations: salesExecQuery
    .query(async ({ ctx }) => {
      const db = getDb();

      if (ctx.user.role === "sales_executive") {
        const exec = await db.query.salesExecutives.findFirst({
          where: eq(salesExecutives.userId, ctx.user.id),
        });
        if (!exec) throw new TRPCError({ code: "NOT_FOUND", message: "Sales executive profile not found." });
        return db.query.users.findMany({
          where: and(eq(users.role, "student"), eq(users.salesExecutiveId, exec.id)),
          orderBy: desc(users.createdAt),
          with: {
            profile: true,
            assignedSalesExecutive: true,
          },
        });
      }

      return db.query.users.findMany({
        where: and(eq(users.role, "student"), sql`${users.salesExecutiveId} IS NOT NULL`),
        orderBy: desc(users.createdAt),
        with: {
          profile: true,
          assignedSalesExecutive: true,
        },
      });
    }),
});
