import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, sql, or, lte, gte, lt, gt, ilike, inArray, isNotNull, asc } from "drizzle-orm";
import { createRouter, adminQuery, teacherQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  payments,
  teacherSalaries,
  profiles,
  users,
  flexibilityRequests,
  feedback,
  notifications,
  violations,
  classes,
  oneToOneSessions,
  batches,
  attendance,
  messages,
  batchEnrollments,
  teacherSalaryConfigs,
  teacherSalaryConfigAuditLogs,
  modules,
  systemSettings,
  sessionAllocationLogs,
  studentIdSequence,
  studentClassAllocations,
  studentFeeConfigurations,
} from "@db/schema";
import { sendNotification } from "../lib/notificationEngine";
import { updateStudentSessionBalances } from "../lib/sessionHelper";
import { recalculateStudentFees } from "../lib/feeHelper";

export function getDurationCategory(duration: number): 30 | 45 | 60 | null {
  if (duration >= 50 && duration <= 70) return 60;
  if (duration >= 35 && duration <= 55) return 45;
  if (duration >= 20 && duration <= 40) return 30;
  return null;
}

export async function fetchFullStudentReportData(db: ReturnType<typeof getDb>, userId: number) {
  const studentUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!studentUser) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Student user record not found" });
  }

  const studentProfile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  // Fetch all enrollments
  const enrollments = await db
    .select({
      id: batchEnrollments.id,
      batchId: batchEnrollments.batchId,
      joinedAt: batchEnrollments.joinedAt,
      leftAt: batchEnrollments.leftAt,
      status: batchEnrollments.status,
      paymentType: batchEnrollments.paymentType,
      assignedTeachers: batchEnrollments.assignedTeachers,
      batchName: batches.name,
      batchStartDate: batches.startDate,
      batchDuration: batches.duration,
      batchCourseFee: batches.courseFee,
      moduleName: modules.name,
      teacherId: batches.teacherId,
    })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batchEnrollments.batchId, batches.id))
    .innerJoin(modules, eq(batches.moduleId, modules.id))
    .where(eq(batchEnrollments.studentId, userId));

  // Get all unique teacher IDs from enrollments
  const teacherIds = new Set<number>();
  enrollments.forEach((e) => {
    if (e.teacherId) teacherIds.add(e.teacherId);
    if (e.assignedTeachers && Array.isArray(e.assignedTeachers)) {
      e.assignedTeachers.forEach((tId: any) => {
        const parsedId = Number(tId);
        if (!isNaN(parsedId)) teacherIds.add(parsedId);
      });
    }
  });

  let teachersList: { id: number; name: string }[] = [];
  if (teacherIds.size > 0) {
    teachersList = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, Array.from(teacherIds)));
  }
  const teachersMap = new Map(teachersList.map((t) => [t.id, t.name]));

  const enrollmentsWithTeachers = enrollments.map((e) => {
    const primaryTeacherName = e.teacherId ? teachersMap.get(e.teacherId) || "Unknown" : "None";
    const assignedTeachersNames = Array.isArray(e.assignedTeachers)
      ? e.assignedTeachers.map((tId: any) => ({
          id: Number(tId),
          name: teachersMap.get(Number(tId)) || "Unknown",
        }))
      : [];

    return {
      ...e,
      primaryTeacherName,
      assignedTeachersNames,
    };
  });

  // Teacher & Class Summary
  const groupClasses = await db
    .select({
      teacherId: classes.teacherId,
      teacherName: users.name,
      count: sql<number>`count(*)`
    })
    .from(attendance)
    .innerJoin(classes, eq(attendance.classId, classes.id))
    .innerJoin(users, eq(classes.teacherId, users.id))
    .where(and(
      eq(attendance.studentId, userId),
      eq(classes.status, "completed")
    ))
    .groupBy(classes.teacherId, users.name);

  const oneToOnes = await db
    .select({
      teacherId: oneToOneSessions.teacherId,
      teacherName: users.name,
      count: sql<number>`count(*)`
    })
    .from(oneToOneSessions)
    .innerJoin(users, eq(oneToOneSessions.teacherId, users.id))
    .where(and(
      eq(oneToOneSessions.studentId, userId),
      eq(oneToOneSessions.status, "completed")
    ))
    .groupBy(oneToOneSessions.teacherId, users.name);

  const teachersSummaryMap = new Map<number, { teacherId: number; teacherName: string; groupCount: number; oneToOneCount: number }>();
  
  groupClasses.forEach((gc) => {
    teachersSummaryMap.set(gc.teacherId, {
      teacherId: gc.teacherId,
      teacherName: gc.teacherName,
      groupCount: Number(gc.count),
      oneToOneCount: 0,
    });
  });

  oneToOnes.forEach((oto) => {
    const existing = teachersSummaryMap.get(oto.teacherId);
    if (existing) {
      existing.oneToOneCount = Number(oto.count);
    } else {
      teachersSummaryMap.set(oto.teacherId, {
        teacherId: oto.teacherId,
        teacherName: oto.teacherName,
        groupCount: 0,
        oneToOneCount: Number(oto.count),
      });
    }
  });

  const teachersSummary = Array.from(teachersSummaryMap.values()).map((t) => ({
    ...t,
    totalCount: t.groupCount + t.oneToOneCount,
  }));

  // Payments & Financials
  const paymentsList = await db.query.payments.findMany({
    where: eq(payments.studentId, userId),
    orderBy: desc(payments.createdAt),
  });

  const lastPayment = paymentsList.find((p) => p.status === "paid");
  const lastPaymentDate = lastPayment?.paidDate || lastPayment?.paidAt || null;

  // Attendance
  const attendanceRecords = await db.query.attendance.findMany({
    where: eq(attendance.studentId, userId),
  });

  const totalClassesConducted = attendanceRecords.length;
  const classesAttended = attendanceRecords.filter((a) => a.status === "present" || a.status === "late").length;
  const classesMissed = attendanceRecords.filter((a) => a.status === "absent").length;
  const attendancePercentage = totalClassesConducted > 0 ? Math.round((classesAttended / totalClassesConducted) * 100) : 0;

  // Session Tracking (30, 45, 60 minutes)
  const pkg = (studentProfile?.packageConfig as any) || {
    oneToOne: { total: 0, min30: 0, min45: 0, min60: 0 },
    group: { total: 0, min30: 0, min45: 0, min60: 0 },
  };

  const oneToOneAllocated30 = Number(pkg.oneToOne?.min30 || 0);
  const oneToOneAllocated45 = Number(pkg.oneToOne?.min45 || 0);
  const oneToOneAllocated60 = Number(pkg.oneToOne?.min60 || 0);

  const completedOneToOnes = await db.query.oneToOneSessions.findMany({
    where: and(
      eq(oneToOneSessions.studentId, userId),
      eq(oneToOneSessions.status, "completed")
    ),
  });

  const oToOneAttended30 = completedOneToOnes.filter((s) => s.sessionLength === 30).length;
  const oToOneAttended45 = completedOneToOnes.filter((s) => s.sessionLength === 45).length;
  const oToOneAttended60 = completedOneToOnes.filter((s) => s.sessionLength === 60).length;

  const oneToOneTracking = {
    min30: {
      allocated: oneToOneAllocated30,
      attended: oToOneAttended30,
      remaining: Math.max(0, oneToOneAllocated30 - oToOneAttended30),
    },
    min45: {
      allocated: oneToOneAllocated45,
      attended: oToOneAttended45,
      remaining: Math.max(0, oneToOneAllocated45 - oToOneAttended45),
    },
    min60: {
      allocated: oneToOneAllocated60,
      attended: oToOneAttended60,
      remaining: Math.max(0, oneToOneAllocated60 - oToOneAttended60),
    },
  };

  const groupAllocated30 = Number(pkg.group?.min30 || 0);
  const groupAllocated45 = Number(pkg.group?.min45 || 0);
  const groupAllocated60 = Number(pkg.group?.min60 || 0);

  const completedGroupClassesAttended = await db
    .select({
      duration: classes.duration,
    })
    .from(attendance)
    .innerJoin(classes, eq(attendance.classId, classes.id))
    .where(and(
      eq(attendance.studentId, userId),
      or(eq(attendance.status, "present"), eq(attendance.status, "late")),
      eq(classes.classType, "group"),
      eq(classes.status, "completed")
    ));

  const groupAttended30 = completedGroupClassesAttended.filter((c) => c.duration === 30).length;
  const groupAttended45 = completedGroupClassesAttended.filter((c) => c.duration === 45).length;
  const groupAttended60 = completedGroupClassesAttended.filter((c) => c.duration === 60).length;

  const groupTracking = {
    min30: {
      allocated: groupAllocated30,
      attended: groupAttended30,
      remaining: Math.max(0, groupAllocated30 - groupAttended30),
    },
    min45: {
      allocated: groupAllocated45,
      attended: groupAttended45,
      remaining: Math.max(0, groupAllocated45 - groupAttended45),
    },
    min60: {
      allocated: groupAllocated60,
      attended: groupAttended60,
      remaining: Math.max(0, groupAllocated60 - groupAttended60),
    },
  };

  // Session Utilization Dashboard
  const totalOneToOneAllocated = oneToOneAllocated30 + oneToOneAllocated45 + oneToOneAllocated60;
  const totalOneToOneAttended = oToOneAttended30 + oToOneAttended45 + oToOneAttended60;
  const totalOneToOneRemaining = Math.max(0, totalOneToOneAllocated - totalOneToOneAttended);

  const totalGroupAllocated = groupAllocated30 + groupAllocated45 + groupAllocated60;
  const totalGroupAttended = groupAttended30 + groupAttended45 + groupAttended60;
  const totalGroupRemaining = Math.max(0, totalGroupAllocated - totalGroupAttended);

  const sessionUtilization = {
    oneToOne: {
      allocated: totalOneToOneAllocated,
      attended: totalOneToOneAttended,
      remaining: totalOneToOneRemaining,
      percentageUsed: totalOneToOneAllocated > 0 ? Math.round((totalOneToOneAttended / totalOneToOneAllocated) * 100) : 0,
    },
    group: {
      allocated: totalGroupAllocated,
      attended: totalGroupAttended,
      remaining: totalGroupRemaining,
      percentageUsed: totalGroupAllocated > 0 ? Math.round((totalGroupAttended / totalGroupAllocated) * 100) : 0,
    },
  };

  // Recent Attendance History
  const recentAttendance = await db
    .select({
      id: attendance.id,
      recordedAt: attendance.recordedAt,
      status: attendance.status,
      classTitle: classes.title,
      classType: classes.classType,
      duration: classes.duration,
      teacherName: users.name,
      scheduledAt: classes.scheduledAt,
    })
    .from(attendance)
    .innerJoin(classes, eq(attendance.classId, classes.id))
    .innerJoin(users, eq(classes.teacherId, users.id))
    .where(eq(attendance.studentId, userId))
    .orderBy(desc(classes.scheduledAt))
    .limit(20);

  return {
    student: {
      id: studentUser.id,
      name: studentUser.name,
      unionId: studentUser.unionId,
      email: studentUser.email,
      phone: studentUser.phone,
      status: studentUser.status,
      createdAt: studentUser.createdAt,
    },
    profile: studentProfile,
    enrollments: enrollmentsWithTeachers,
    teachersSummary,
    payments: paymentsList,
    lastPaymentDate,
    attendance: {
      total: totalClassesConducted,
      present: classesAttended,
      missed: classesMissed,
      percentage: attendancePercentage,
    },
    oneToOneTracking,
    groupTracking,
    sessionUtilization,
recentAttendance,
    paymentType: enrollments[0]?.paymentType || "FULL_PAYMENT",
  };
}

export async function calculateIncentiveForTeacherMonth(
  db: ReturnType<typeof getDb>,
  teacherId: number,
  month: string
): Promise<number> {
  // 1. Fetch completed classes and sessions in this month
  const groupClassesList = await db.query.classes.findMany({
    where: and(
      eq(classes.teacherId, teacherId),
      eq(classes.status, "completed"),
      eq(classes.classType, "group"),
      sql`TO_CHAR(${classes.scheduledAt}, 'YYYY-MM') = ${month}`
    ),
  });

  const oneToOneSessionsList = await db.query.oneToOneSessions.findMany({
    where: and(
      eq(oneToOneSessions.teacherId, teacherId),
      eq(oneToOneSessions.status, "completed"),
      sql`TO_CHAR(${oneToOneSessions.scheduledAt}, 'YYYY-MM') = ${month}`
    ),
  });

  const totalClassesConducted = groupClassesList.length + oneToOneSessionsList.length;
  if (totalClassesConducted === 0) return 0;

  // 2. Teacher attendance
  // Working days (unique days with completed or scheduled classes in this month)
  const scheduledGroupDays = await db.select({
    day: sql`TO_CHAR(${classes.scheduledAt}, 'YYYY-MM-DD')`
  })
  .from(classes)
  .where(and(
    eq(classes.teacherId, teacherId),
    eq(classes.status, "completed"),
    sql`TO_CHAR(${classes.scheduledAt}, 'YYYY-MM') = ${month}`
  ));

  const scheduledOtoDays = await db.select({
    day: sql`TO_CHAR(${oneToOneSessions.scheduledAt}, 'YYYY-MM-DD')`
  })
  .from(oneToOneSessions)
  .where(and(
    eq(oneToOneSessions.teacherId, teacherId),
    eq(oneToOneSessions.status, "completed"),
    sql`TO_CHAR(${oneToOneSessions.scheduledAt}, 'YYYY-MM') = ${month}`
  ));

  const uniqueDays = new Set<string>();
  scheduledGroupDays.forEach(d => { if (d.day) uniqueDays.add(d.day as string); });
  scheduledOtoDays.forEach(d => { if (d.day) uniqueDays.add(d.day as string); });
  const workingDays = uniqueDays.size;

  const absentOtoDays = await db.select({
    day: sql`TO_CHAR(${oneToOneSessions.scheduledAt}, 'YYYY-MM-DD')`
  })
  .from(oneToOneSessions)
  .where(and(
    eq(oneToOneSessions.teacherId, teacherId),
    eq(oneToOneSessions.teacherAttendance, "absent"),
    sql`TO_CHAR(${oneToOneSessions.scheduledAt}, 'YYYY-MM') = ${month}`
  ));
  const absentDays = new Set(absentOtoDays.map(d => d.day as string)).size;
  const presentDays = Math.max(0, workingDays - absentDays);

  const teacherAttendancePct = workingDays > 0 ? (presentDays / workingDays) * 100 : 100;

  // 3. Average Student Attendance
  let totalStudentCount = 0;
  let presentStudentCount = 0;
  for (const cls of groupClassesList) {
    const attendanceRecords = await db.query.attendance.findMany({
      where: eq(attendance.classId, cls.id),
    });
    totalStudentCount += attendanceRecords.length;
    presentStudentCount += attendanceRecords.filter((r) => r.status === "present" || r.status === "late").length;
  }
  const studentAttendancePct = totalStudentCount > 0 ? (presentStudentCount / totalStudentCount) * 100 : 100;

  // 4. Student Feedback Rating
  const feedbackRecords = await db.query.feedback.findMany({
    where: and(
      eq(feedback.teacherId, teacherId),
      sql`TO_CHAR(${feedback.createdAt}, 'YYYY-MM') = ${month}`
    ),
  });
  const avgFeedbackRating = feedbackRecords.length > 0
    ? feedbackRecords.reduce((sum, f) => sum + f.rating, 0) / feedbackRecords.length
    : 5.0; // Default to 5 if no feedback

  // 5. Composite Score
  const score = (teacherAttendancePct * 0.4) + (studentAttendancePct * 0.3) + ((avgFeedbackRating / 5) * 100 * 0.3);

  // 6. Incentives
  return score >= 90 ? 2000 : score >= 80 ? 1000 : 0;
}

export async function recalculateSalaryInternal(
  db: ReturnType<typeof getDb>,
  teacherId: number,
  month: string,
  forceInsert: boolean = false
) {
  // 1. Fetch completed group classes for this teacher in the month
  const groupClassesList = await db.select({
    duration: classes.duration
  })
  .from(classes)
  .where(and(
    eq(classes.teacherId, teacherId),
    eq(classes.status, "completed"),
    eq(classes.classType, "group"),
    sql`TO_CHAR(${classes.scheduledAt}, 'YYYY-MM') = ${month}`
  ));

  // 2. Fetch completed 1-to-1 sessions for this teacher in the month
  const oneToOneSessionsList = await db.select({
    sessionLength: oneToOneSessions.sessionLength
  })
  .from(oneToOneSessions)
  .where(and(
    eq(oneToOneSessions.teacherId, teacherId),
    eq(oneToOneSessions.status, "completed"),
    sql`TO_CHAR(${oneToOneSessions.scheduledAt}, 'YYYY-MM') = ${month}`
  ));

  // 2b. Fetch completed new flow class sessions for this teacher in the month (deprecated)
  const newClassSessionsList: any[] = [];

  // 3. Count categories
  let group30Count = 0;
  let group45Count = 0;
  let group60Count = 0;
  for (const cls of groupClassesList) {
    const cat = getDurationCategory(cls.duration || 0);
    if (cat === 30) group30Count++;
    else if (cat === 45) group45Count++;
    else if (cat === 60) group60Count++;
  }

  let oneToOne30Count = 0;
  let oneToOne45Count = 0;
  let oneToOne60Count = 0;
  for (const sess of oneToOneSessionsList) {
    const cat = getDurationCategory(sess.sessionLength || 0);
    if (cat === 30) oneToOne30Count++;
    else if (cat === 45) oneToOne45Count++;
    else if (cat === 60) oneToOne60Count++;
  }

  for (const sess of newClassSessionsList) {
    const cat = getDurationCategory(sess.duration || 0);
    if (sess.sessionType === "group") {
      if (cat === 30) group30Count++;
      else if (cat === 45) group45Count++;
      else if (cat === 60) group60Count++;
    } else {
      if (cat === 30) oneToOne30Count++;
      else if (cat === 45) oneToOne45Count++;
      else if (cat === 60) oneToOne60Count++;
    }
  }

  // 4. Fetch salary configuration
  const config = await db.query.teacherSalaryConfigs.findFirst({
    where: eq(teacherSalaryConfigs.teacherId, teacherId),
  });

  const basicSalary = config ? parseFloat(config.basicSalary) : 0;
  const group30MinRate = config ? parseFloat(config.group30MinRate) : 0;
  const group45MinRate = config ? parseFloat(config.group45MinRate) : 0;
  const group60MinRate = config ? parseFloat(config.group60MinRate) : 0;
  const oneToOne30MinRate = config ? parseFloat(config.oneToOne30MinRate) : 0;
  const oneToOne45MinRate = config ? parseFloat(config.oneToOne45MinRate) : 0;
  const oneToOne60MinRate = config ? parseFloat(config.oneToOne60MinRate) : 0;
  const bonusAmount = config ? parseFloat(config.bonusAmount) : 0;
  const deductionAmount = config ? parseFloat(config.deductionAmount) : 0;

  // 5. Calculate Total Earnings & Net Salary
  const sessionEarnings =
    (group30Count * group30MinRate) +
    (group45Count * group45MinRate) +
    (group60Count * group60MinRate) +
    (oneToOne30Count * oneToOne30MinRate) +
    (oneToOne45Count * oneToOne45MinRate) +
    (oneToOne60Count * oneToOne60MinRate);

  const dynamicIncentive = await calculateIncentiveForTeacherMonth(db, teacherId, month);
  const netSalary = basicSalary + sessionEarnings + dynamicIncentive + bonusAmount - deductionAmount;

  // 6. Find if there is an existing record
  const existing = await db.query.teacherSalaries.findFirst({
    where: and(
      eq(teacherSalaries.teacherId, teacherId),
      eq(teacherSalaries.month, month)
    )
  });

  const salaryValues = {
    teacherId,
    month,
    basicSalary: String(basicSalary),
    groupClassesCount: group30Count + group45Count + group60Count,
    oneToOneCount: oneToOne30Count + oneToOne45Count + oneToOne60Count,
    group30MinCount: group30Count,
    group45MinCount: group45Count,
    group60MinCount: group60Count,
    oneToOne30MinCount: oneToOne30Count,
    oneToOne45MinCount: oneToOne45Count,
    oneToOne60MinCount: oneToOne60Count,
    group30MinRate: String(group30MinRate),
    group45MinRate: String(group45MinRate),
    group60MinRate: String(group60MinRate),
    oneToOne30MinRate: String(oneToOne30MinRate),
    oneToOne45MinRate: String(oneToOne45MinRate),
    oneToOne60MinRate: String(oneToOne60MinRate),
    bonusAmount: String(bonusAmount),
    deductionAmount: String(deductionAmount),
    incentiveAmount: String(dynamicIncentive),
    netSalary: String(netSalary),
    totalAmount: String(netSalary), // totalAmount matches netSalary for UI compatibility
  };

  if (existing) {
    await db.update(teacherSalaries)
      .set(salaryValues)
      .where(eq(teacherSalaries.id, existing.id));
    return db.query.teacherSalaries.findFirst({ where: eq(teacherSalaries.id, existing.id) });
  } else if (forceInsert) {
    const inserted = await db.insert(teacherSalaries).values(salaryValues).returning({ id: teacherSalaries.id });
    return db.query.teacherSalaries.findFirst({ where: eq(teacherSalaries.id, inserted[0].id) });
  }
  return null;
}

export async function fetchFullTeacherReportData(db: ReturnType<typeof getDb>, userId: number) {
  const teacherUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!teacherUser) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Teacher not found" });
  }

  const teacherProfile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  // 1. Batches & Modules
  const teacherBatches = await db.query.batches.findMany({
    where: eq(batches.teacherId, userId),
    with: { module: true },
  });

  const batchesDetails = [];
  const modulesMap = new Map<number, any>();

  for (const batch of teacherBatches) {
    const enrollments = await db.query.batchEnrollments.findMany({
      where: and(
        eq(batchEnrollments.batchId, batch.id),
        eq(batchEnrollments.status, "active")
      ),
    });

    batchesDetails.push({
      id: batch.id,
      name: batch.name,
      code: `B${String(batch.id).padStart(3, "0")}`,
      courseName: batch.module?.name || "N/A",
      moduleName: batch.module?.name || "N/A",
      studentsCount: enrollments.length,
      startDate: batch.startDate,
      duration: batch.duration || "N/A",
      status: batch.status || "active",
    });

    if (batch.module) {
      if (!modulesMap.has(batch.module.id)) {
        modulesMap.set(batch.module.id, {
          id: batch.module.id,
          name: batch.module.name,
          duration: batch.module.duration || "N/A",
          totalClassesPlanned: 0,
          completedClasses: 0,
          remainingClasses: 0,
          batchIds: [],
        });
      }
      modulesMap.get(batch.module.id).batchIds.push(batch.id);
    }
  }

  const modulesDetails = Array.from(modulesMap.values());
  for (const mod of modulesDetails) {
    if (mod.batchIds.length > 0) {
      const compClasses = await db.select({ count: sql`count(*)` }).from(classes).where(and(
        inArray(classes.batchId, mod.batchIds),
        eq(classes.status, "completed")
      ));
      const remClasses = await db.select({ count: sql`count(*)` }).from(classes).where(and(
        inArray(classes.batchId, mod.batchIds),
        or(eq(classes.status, "scheduled"), eq(classes.status, "ongoing"))
      ));

      const completed = Number(compClasses[0]?.count || 0);
      const remaining = Number(remClasses[0]?.count || 0);

      mod.completedClasses = completed;
      mod.remainingClasses = remaining;
      mod.totalClassesPlanned = completed + remaining;
    }
  }

  // 2. Classes Conducted breakdown (30/45/60 min sessions for One-to-One and Group)
  const otoClasses = await db.query.oneToOneSessions.findMany({
    where: eq(oneToOneSessions.teacherId, userId),
  });

  const groupClasses = await db.query.classes.findMany({
    where: and(
      eq(classes.teacherId, userId),
      eq(classes.classType, "group")
    ),
  });

  const otoStats = {
    min30: { total: 0, completed: 0, remaining: 0 },
    min45: { total: 0, completed: 0, remaining: 0 },
    min60: { total: 0, completed: 0, remaining: 0 },
  };

  for (const session of otoClasses) {
    const len = session.sessionLength || 30;
    const cat = getDurationCategory(len);
    const completed = session.status === "completed";
    const cancelled = session.status === "cancelled";
    const remaining = !completed && !cancelled;

    if (!cancelled) {
      if (cat === 30) {
        otoStats.min30.total++;
        if (completed) otoStats.min30.completed++;
        if (remaining) otoStats.min30.remaining++;
      } else if (cat === 45) {
        otoStats.min45.total++;
        if (completed) otoStats.min45.completed++;
        if (remaining) otoStats.min45.remaining++;
      } else if (cat === 60) {
        otoStats.min60.total++;
        if (completed) otoStats.min60.completed++;
        if (remaining) otoStats.min60.remaining++;
      }
    }
  }

  const groupStats = {
    min30: { total: 0, completed: 0, remaining: 0 },
    min45: { total: 0, completed: 0, remaining: 0 },
    min60: { total: 0, completed: 0, remaining: 0 },
  };

  for (const cls of groupClasses) {
    const len = cls.duration || 30;
    const cat = getDurationCategory(len);
    const completed = cls.status === "completed";
    const cancelled = cls.status === "cancelled";
    const remaining = !completed && !cancelled;

    if (!cancelled) {
      if (cat === 30) {
        groupStats.min30.total++;
        if (completed) groupStats.min30.completed++;
        if (remaining) groupStats.min30.remaining++;
      } else if (cat === 45) {
        groupStats.min45.total++;
        if (completed) groupStats.min45.completed++;
        if (remaining) groupStats.min45.remaining++;
      } else if (cat === 60) {
        groupStats.min60.total++;
        if (completed) groupStats.min60.completed++;
        if (remaining) groupStats.min60.remaining++;
      }
    }
  }

  const otoTotalAssigned = otoStats.min30.total + otoStats.min45.total + otoStats.min60.total;
  const otoTotalCompleted = otoStats.min30.completed + otoStats.min45.completed + otoStats.min60.completed;
  const otoTotalRemaining = otoStats.min30.remaining + otoStats.min45.remaining + otoStats.min60.remaining;

  const groupTotalAssigned = groupStats.min30.total + groupStats.min45.total + groupStats.min60.total;
  const groupTotalCompleted = groupStats.min30.completed + groupStats.min45.completed + groupStats.min60.completed;
  const groupTotalRemaining = groupStats.min30.remaining + groupStats.min45.remaining + groupStats.min60.remaining;

  const totalClassesAssigned = otoTotalAssigned + groupTotalAssigned;
  const totalClassesConducted = otoTotalCompleted + groupTotalCompleted;
  const totalClassesRemaining = otoTotalRemaining + groupTotalRemaining;

  let totalMinutes = 0;
  for (const session of otoClasses) {
    if (session.status === "completed") totalMinutes += session.sessionLength || 30;
  }
  for (const cls of groupClasses) {
    if (cls.status === "completed") totalMinutes += cls.duration || 30;
  }
  const totalTeachingHours = Math.round((totalMinutes / 60) * 10) / 10;

  // 3. Attendance Report
  const activeDays = new Set<string>();
  for (const session of otoClasses) {
    if (session.status !== "cancelled") {
      activeDays.add(new Date(session.scheduledAt).toISOString().split("T")[0]);
    }
  }
  for (const cls of groupClasses) {
    if (cls.status !== "cancelled") {
      activeDays.add(new Date(cls.scheduledAt).toISOString().split("T")[0]);
    }
  }
  const workingDays = activeDays.size;

  const absentDaysSet = new Set<string>();
  for (const session of otoClasses) {
    if (session.teacherAttendance === "absent") {
      absentDaysSet.add(new Date(session.scheduledAt).toISOString().split("T")[0]);
    }
  }
  const absentDays = absentDaysSet.size;
  const presentDays = Math.max(0, workingDays - absentDays);
  const leaveDays = teacherUser.status === "on_hold" ? 5 : 0;
  const teacherAttendancePercentage = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 100;

  // 4. Salary Configurations & Reports
  const salaryConfig = await db.query.teacherSalaryConfigs.findFirst({
    where: eq(teacherSalaryConfigs.teacherId, userId),
  });

  const salaryHistoryList = await db.query.teacherSalaries.findMany({
    where: eq(teacherSalaries.teacherId, userId),
    orderBy: desc(teacherSalaries.month),
  });

  const basicSalary = salaryConfig ? parseFloat(salaryConfig.basicSalary) : 0;
  const configGroup30Rate = salaryConfig ? parseFloat(salaryConfig.group30MinRate) : 0;
  const configGroup45Rate = salaryConfig ? parseFloat(salaryConfig.group45MinRate) : 0;
  const configGroup60Rate = salaryConfig ? parseFloat(salaryConfig.group60MinRate) : 0;
  const configOto30Rate = salaryConfig ? parseFloat(salaryConfig.oneToOne30MinRate) : 0;
  const configOto45Rate = salaryConfig ? parseFloat(salaryConfig.oneToOne45MinRate) : 0;
  const configOto60Rate = salaryConfig ? parseFloat(salaryConfig.oneToOne60MinRate) : 0;
  const configBonus = salaryConfig ? parseFloat(salaryConfig.bonusAmount) : 0;
  const configDeduction = salaryConfig ? parseFloat(salaryConfig.deductionAmount) : 0;

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  
  let group30CurrentMonth = 0;
  let group45CurrentMonth = 0;
  let group60CurrentMonth = 0;
  for (const cls of groupClasses) {
    if (cls.status === "completed" && new Date(cls.scheduledAt).toISOString().slice(0, 7) === currentMonthStr) {
      const cat = getDurationCategory(cls.duration || 0);
      if (cat === 30) group30CurrentMonth++;
      else if (cat === 45) group45CurrentMonth++;
      else if (cat === 60) group60CurrentMonth++;
    }
  }

  let oto30CurrentMonth = 0;
  let oto45CurrentMonth = 0;
  let oto60CurrentMonth = 0;
  for (const session of otoClasses) {
    if (session.status === "completed" && new Date(session.scheduledAt).toISOString().slice(0, 7) === currentMonthStr) {
      const cat = getDurationCategory(session.sessionLength || 0);
      if (cat === 30) oto30CurrentMonth++;
      else if (cat === 45) oto45CurrentMonth++;
      else if (cat === 60) oto60CurrentMonth++;
    }
  }

  const otoEarnings = (oto30CurrentMonth * configOto30Rate) + (oto45CurrentMonth * configOto45Rate) + (oto60CurrentMonth * configOto60Rate);
  const groupEarnings = (group30CurrentMonth * configGroup30Rate) + (group45CurrentMonth * configGroup45Rate) + (group60CurrentMonth * configGroup60Rate);

  const currentMonthIncentives = await calculateIncentiveForTeacherMonth(db, userId, currentMonthStr);
  const currentNetSalary = basicSalary + otoEarnings + groupEarnings + currentMonthIncentives + configBonus - configDeduction;

  // 5. Performance Summary
  const teacherCompletedClassesIds = groupClasses
    .filter((cls) => cls.status === "completed")
    .map((cls) => cls.id);

  let avgStudentAttendancePct = 100;
  if (teacherCompletedClassesIds.length > 0) {
    const studentAttendanceRecords = await db
      .select({
        status: attendance.status,
      })
      .from(attendance)
      .where(inArray(attendance.classId, teacherCompletedClassesIds));

    if (studentAttendanceRecords.length > 0) {
      const totalStudentAtt = studentAttendanceRecords.length;
      const presentStudentAtt = studentAttendanceRecords.filter(
        (r) => r.status === "present" || r.status === "late"
      ).length;
      avgStudentAttendancePct = Math.round((presentStudentAtt / totalStudentAtt) * 100);
    }
  }

  const feedbackList = await db.query.feedback.findMany({
    where: eq(feedback.teacherId, userId),
  });
  const avgFeedbackRating = feedbackList.length > 0
    ? Math.round((feedbackList.reduce((sum, f) => sum + f.rating, 0) / feedbackList.length) * 10) / 10
    : 5.0;

  const performanceScore = Math.round(
    (teacherAttendancePercentage * 0.4) +
    (avgStudentAttendancePct * 0.3) +
    ((avgFeedbackRating / 5) * 100 * 0.3)
  );

  const enrolledStudentIds = new Set<number>();
  for (const batch of teacherBatches) {
    const enrollments = await db.query.batchEnrollments.findMany({
      where: eq(batchEnrollments.batchId, batch.id),
    });
    enrollments.forEach((e) => enrolledStudentIds.add(e.studentId));
  }

  return {
    teacher: {
      id: teacherUser.id,
      unionId: teacherUser.unionId,
      name: teacherUser.name,
      email: teacherUser.email,
      phone: teacherUser.phone,
      status: teacherUser.status,
      avatar: teacherUser.avatar,
      createdAt: teacherUser.createdAt,
    },
    profile: teacherProfile ? {
      gender: teacherProfile.gender,
      dob: teacherProfile.dob,
      educationalQualification: teacherProfile.educationalQualification,
      specialization: (teacherProfile as any).specialization || "",
      experience: (teacherProfile as any).experience || "",
      address: (teacherProfile as any).address || "",
      photo: teacherProfile.photo,
    } : null,
    batches: batchesDetails,
    modules: modulesDetails,
    teachingSummary: {
      totalClassesAssigned,
      totalClassesConducted,
      totalClassesRemaining,
      totalTeachingHours,
      teacherAttendancePercentage,
    },
    oneToOneStats: {
      min30: otoStats.min30,
      min45: otoStats.min45,
      min60: otoStats.min60,
      total: {
        assigned: otoTotalAssigned,
        completed: otoTotalCompleted,
        remaining: otoTotalRemaining,
        earnings: otoEarnings,
      }
    },
    groupStats: {
      min30: groupStats.min30,
      min45: groupStats.min45,
      min60: groupStats.min60,
      total: {
        assigned: groupTotalAssigned,
        completed: groupTotalCompleted,
        remaining: groupTotalRemaining,
        earnings: groupEarnings,
      }
    },
    attendanceReport: {
      workingDays,
      presentDays,
      absentDays,
      leaveDays,
      attendancePercentage: teacherAttendancePercentage,
    },
    salaryReport: {
      config: {
        basicSalary,
        group30MinRate: configGroup30Rate,
        group45MinRate: configGroup45Rate,
        group60MinRate: configGroup60Rate,
        oneToOne30MinRate: configOto30Rate,
        oneToOne45MinRate: configOto45Rate,
        oneToOne60MinRate: configOto60Rate,
        bonusAmount: configBonus,
        deductionAmount: configDeduction,
      },
      currentMonthBreakdown: {
        month: currentMonthStr,
        oneToOne: {
          min30: { count: oto30CurrentMonth, earnings: oto30CurrentMonth * configOto30Rate },
          min45: { count: oto45CurrentMonth, earnings: oto45CurrentMonth * configOto45Rate },
          min60: { count: oto60CurrentMonth, earnings: oto60CurrentMonth * configOto60Rate },
          totalEarnings: otoEarnings,
        },
        group: {
          min30: { count: group30CurrentMonth, earnings: group30CurrentMonth * configGroup30Rate },
          min45: { count: group45CurrentMonth, earnings: group45CurrentMonth * configGroup45Rate },
          min60: { count: group60CurrentMonth, earnings: group60CurrentMonth * configGroup60Rate },
          totalEarnings: groupEarnings,
        },
        summary: {
          basicSalary,
          oneToOneEarnings: otoEarnings,
          groupEarnings,
          incentives: currentMonthIncentives,
          bonus: configBonus,
          deductions: configDeduction,
          netSalary: currentNetSalary,
        }
      },
      history: salaryHistoryList.map(s => ({
        id: s.id,
        month: s.month,
        classesConducted: (s.groupClassesCount || 0) + (s.oneToOneCount || 0),
        salaryEarned: parseFloat(s.totalAmount || "0"),
        paymentStatus: s.status || "pending",
        paymentDate: s.paymentDate,
      })),
    },
    salaries: salaryHistoryList.map(s => ({
      id: s.id,
      month: s.month,
      classesConducted: (s.groupClassesCount || 0) + (s.oneToOneCount || 0),
      salaryEarned: parseFloat(s.totalAmount || "0"),
      paymentStatus: s.status || "pending",
      paymentDate: s.paymentDate,
    })),
    performanceSummary: {
      totalStudentsTaught: enrolledStudentIds.size,
      totalBatchesManaged: teacherBatches.length,
      totalClassesConducted: totalClassesConducted,
      averageStudentAttendance: avgStudentAttendancePct,
      studentFeedbackRating: avgFeedbackRating,
      teacherPerformanceScore: performanceScore,
    }
  };
}

export const adminRouter = createRouter({
  // ─── Payments / Fees ────────────────────────────────────────────────────────

  listPayments: adminQuery
    .input(z.object({
      studentId: z.number().optional(),
      status: z.string().optional(),
      batchId: z.number().optional(),
      dueDate: z.date().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const filters = [];
      if (input?.studentId) filters.push(eq(payments.studentId, input.studentId));
      if (input?.status) filters.push(eq(payments.status, input.status as any));
      if (input?.batchId) filters.push(eq(payments.batchId, input.batchId));
      if (input?.dueDate) {
        const startOfDay = new Date(input.dueDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(input.dueDate);
        endOfDay.setHours(23, 59, 59, 999);
        filters.push(and(gte(payments.dueDate, startOfDay), lte(payments.dueDate, endOfDay)));
      }
      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.query.payments.findMany({
        where,
        orderBy: desc(payments.createdAt),
        with: {
          student: {
            with: {
              profile: true,
              enrollments: true,
              feeConfig: true,
            },
          },
          batch: true,
        },
      });
    }),

  createPayment: adminQuery
    .input(z.object({
      studentId: z.number(),
      amount: z.number(),
      type: z.string().default("tuition"),
      dueDate: z.date().optional(),
      notes: z.string().optional(),
      batchId: z.number().optional(),
      installmentNumber: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const result = await db.insert(payments).values({
        studentId: input.studentId,
        amount: String(input.amount),
        type: input.type,
        dueDate: input.dueDate,
        notes: input.notes,
        batchId: input.batchId,
        installmentNumber: input.installmentNumber,
        status: "unpaid",
      }).returning({ id: payments.id });
      return db.query.payments.findFirst({ where: eq(payments.id, result[0]?.id) });
    }),

  // Task 9.4 — reactivate enrollments and update profile fees on payment
  recordPayment: adminQuery
    .input(z.object({
      paymentId: z.number(),
      amount: z.number(),
      transactionId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();

      const payment = await db.query.payments.findFirst({
        where: eq(payments.id, input.paymentId),
      });
      if (!payment) throw new Error("Payment not found");

      await db.update(payments)
        .set({
          status: "paid",
          paidAt: new Date(),
          paidDate: new Date(),
          transactionId: input.transactionId,
        })
        .where(eq(payments.id, input.paymentId));

      // Reactivate all inactive or restricted enrollments for the student
      const inactiveOrRestrictedEnrollments = await db.query.batchEnrollments.findMany({
        where: and(
          eq(batchEnrollments.studentId, payment.studentId),
          or(
            eq(batchEnrollments.status, "inactive"),
            eq(batchEnrollments.status, "restricted")
          )
        ),
      });
      for (const enrollment of inactiveOrRestrictedEnrollments) {
        await db.update(batchEnrollments)
          .set({ status: "active" })
          .where(eq(batchEnrollments.id, enrollment.id));
      }

      // Reactivate user status
      await db.update(users)
        .set({ status: "active" })
        .where(eq(users.id, payment.studentId));

      // Update profile feesPaid and recalculate feesBalance
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, payment.studentId),
      });
      if (profile) {
        const feesPaid = parseFloat(profile.feesPaid ?? "0") + input.amount;
        const feesTotal = parseFloat(profile.feesTotal ?? "0");
        const feesBalance = Math.max(0, feesTotal - feesPaid);
        const nextPaymentStatus = feesBalance <= 0 ? "paid" : "partial";

        let paymentDueDate: Date | null = null;
        const activeEnrollment = await db.query.batchEnrollments.findFirst({
          where: and(
            eq(batchEnrollments.studentId, payment.studentId),
            eq(batchEnrollments.status, "active")
          ),
        });

        if (activeEnrollment?.paymentType === "INSTALLMENT" && feesBalance > 0) {
          const nextUnpaid = await db.query.payments.findFirst({
            where: and(
              eq(payments.studentId, payment.studentId),
              eq(payments.status, "unpaid"),
              isNotNull(payments.installmentNumber)
            ),
            orderBy: asc(payments.installmentNumber),
          });
          if (nextUnpaid?.dueDate) {
            paymentDueDate = nextUnpaid.dueDate;
          }
        }
        
        // Log to activity timeline
        const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
        timeline.push({
          type: "payment_recorded",
          amount: input.amount,
          feesPaid,
          feesBalance,
          timestamp: new Date().toISOString(),
        });

        await db.update(profiles)
          .set({
            feesPaid: String(feesPaid),
            feesBalance: String(feesBalance),
            paymentStatus: nextPaymentStatus,
            paymentDueDate,
            activityTimeline: timeline,
          })
          .where(eq(profiles.userId, payment.studentId));

        await recalculateStudentFees(payment.studentId);
      }

      return { success: true };
    }),

  listOverdueStudents: adminQuery.query(async ({ ctx }) => {
    if (ctx.user.role === "academic_head") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
    }
    const db = getDb();
    const overdue = await db.query.profiles.findMany({
      where: and(
        gt(profiles.feesBalance, "0"),
        lt(profiles.paymentDueDate, new Date())
      ),
      with: {
        user: true,
      },
    });
    return overdue.map((o) => ({
      id: o.id,
      userId: o.userId,
      user: o.user,
      course: o.course,
      batch: o.batch,
      feesTotal: o.feesTotal,
      feesPaid: o.feesPaid,
      feesBalance: o.feesBalance,
      paymentStatus: o.paymentStatus,
      paymentDueDate: o.paymentDueDate,
      gracePeriodDays: o.gracePeriodDays,
      enrollmentId: o.enrollmentId,
    }));
  }),

  adjustStudentFees: adminQuery
    .input(z.object({
      studentId: z.number(),
      feesTotal: z.number().optional(),
      discount: z.number().optional(),
      discountType: z.enum(["flat", "percentage"]).optional(),
      paymentMode: z.enum(["FULL_PAYMENT", "INSTALLMENT"]).optional(),
      feesPaid: z.number().optional(),
      minInitialPayment: z.number().optional(),
      paymentDueDate: z.date().optional(),
      gracePeriodDays: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });

      let feeConfig = await db.query.studentFeeConfigurations.findFirst({
        where: eq(studentFeeConfigurations.studentId, input.studentId),
      });

      const currentGross = input.feesTotal !== undefined ? input.feesTotal : parseFloat(feeConfig?.totalCourseFee || profile.totalCourseFee || "0");
      const currentDiscount = input.discount !== undefined ? input.discount : parseFloat(feeConfig?.discount || "0");
      const currentDiscountType = input.discountType || feeConfig?.discountType || "flat";
      
      let calculatedFinal = currentGross;
      if (currentDiscountType === "percentage") {
        calculatedFinal = currentGross - (currentGross * currentDiscount / 100);
      } else {
        calculatedFinal = Math.max(0, currentGross - currentDiscount);
      }

      const paymentMode = input.paymentMode || feeConfig?.paymentMode || "FULL_PAYMENT";

      if (feeConfig) {
        await db.update(studentFeeConfigurations)
          .set({
            totalCourseFee: String(currentGross),
            discount: String(currentDiscount),
            discountType: currentDiscountType,
            finalFee: String(calculatedFinal),
            paymentMode: paymentMode,
            updatedAt: new Date(),
          })
          .where(eq(studentFeeConfigurations.id, feeConfig.id));
      } else {
        await db.insert(studentFeeConfigurations).values({
          studentId: input.studentId,
          totalCourseFee: String(currentGross),
          discount: String(currentDiscount),
          discountType: currentDiscountType,
          finalFee: String(calculatedFinal),
          paymentMode: paymentMode,
        });
      }

      const minInitialPayment = input.minInitialPayment !== undefined ? String(input.minInitialPayment) : profile.minInitialPayment;
      const paymentDueDate = input.paymentDueDate !== undefined ? input.paymentDueDate : profile.paymentDueDate;
      const gracePeriodDays = input.gracePeriodDays !== undefined ? input.gracePeriodDays : profile.gracePeriodDays;

      // Log to activity timeline
      const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
      timeline.push({
        type: "fee_adjustment",
        feesTotal: String(calculatedFinal),
        minInitialPayment,
        paymentDueDate: paymentDueDate ? new Date(paymentDueDate).toISOString() : null,
        gracePeriodDays,
        timestamp: new Date().toISOString(),
      });

      await db.update(profiles)
        .set({
          minInitialPayment,
          paymentDueDate,
          gracePeriodDays,
          activityTimeline: timeline,
        })
        .where(eq(profiles.userId, input.studentId));

      await recalculateStudentFees(input.studentId);

      const updatedProfile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });

      // Reactivate student if fees are fully cleared
      if (parseFloat(updatedProfile?.feesBalance || "0") <= 0) {
        await db.update(batchEnrollments)
          .set({ status: "active" })
          .where(and(
            eq(batchEnrollments.studentId, input.studentId),
            eq(batchEnrollments.status, "restricted")
          ));
        
        await db.update(users)
          .set({ status: "active" })
          .where(eq(users.id, input.studentId));
      }

      return { success: true };
    }),

  updateStudentFeeRules: adminQuery
    .input(z.object({
      studentId: z.number(),
      paymentType: z.enum(["FULL_PAYMENT", "INSTALLMENT"]),
      totalCourseFee: z.number(),
      initialPayment: z.number().optional().nullable(),
      installments: z.array(z.object({
        installmentNumber: z.number(),
        amount: z.number(),
        dueDate: z.date().optional().nullable(),
        status: z.enum(["paid", "unpaid"]),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const studentId = input.studentId;

      // 1. Fetch student profile and active enrollment
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });

      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, studentId),
          eq(batchEnrollments.status, "active")
        ),
      });

      // 2. Fetch existing paid tuition payments
      const existingPaidPayments = await db.query.payments.findMany({
        where: and(
          eq(payments.studentId, studentId),
          eq(payments.status, "paid"),
          eq(payments.type, "tuition")
        ),
      });

      const sumPaid = existingPaidPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

      // Validate: Total fee cannot be less than already paid amount
      if (input.totalCourseFee < sumPaid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Total Course Fee (₹${input.totalCourseFee}) cannot be less than the amount already paid (₹${sumPaid}).`,
        });
      }

      const inputPaid = input.installments.filter((inst) => inst.status === "paid");
      const inputUnpaid = input.installments.filter((inst) => inst.status === "unpaid");

      // Validate: Paid installments count cannot differ from database
      if (existingPaidPayments.length !== inputPaid.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Paid installments count mismatch. Expected ${existingPaidPayments.length} paid installments, but input has ${inputPaid.length}.`,
        });
      }

      // Check if amounts match (sort DB paid by creation date, input paid by installment number)
      const sortedDbPaid = [...existingPaidPayments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const sortedInputPaid = [...inputPaid].sort((a, b) => a.installmentNumber - b.installmentNumber);
      for (let i = 0; i < sortedDbPaid.length; i++) {
        if (Math.abs(parseFloat(sortedDbPaid[i].amount) - sortedInputPaid[i].amount) > 0.01) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Amount for paid installment #${sortedInputPaid[i].installmentNumber} (₹${sortedInputPaid[i].amount}) does not match paid record in database (₹${parseFloat(sortedDbPaid[i].amount)}).`,
          });
        }
      }

      // Validate: Sum of all installments equals the total fee
      const sumInputPaid = inputPaid.reduce((sum, inst) => sum + inst.amount, 0);
      const sumInputUnpaid = inputUnpaid.reduce((sum, inst) => sum + inst.amount, 0);
      const sumAllInstallments = sumInputPaid + sumInputUnpaid;

      if (Math.abs(sumAllInstallments - input.totalCourseFee) > 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Sum of all installments (₹${sumAllInstallments}) must equal the total course fee (₹${input.totalCourseFee}).`,
        });
      }

      // Validate: Initial payment cannot exceed total fee
      if (input.initialPayment && input.initialPayment > input.totalCourseFee) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Initial payment cannot exceed the total course fee.",
        });
      }

      // Validate: Installment due dates cannot overlap/duplicate
      const dueDates = input.installments
        .map((inst) => inst.dueDate)
        .filter((date): date is Date => !!date);
      const uniqueDueDates = new Set(dueDates.map((d) => new Date(d).toDateString()));
      if (uniqueDueDates.size !== dueDates.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Installment due dates cannot overlap.",
        });
      }

      // Validate: installmentNumber uniqueness in the input
      const installmentNumbers = input.installments.map((inst) => inst.installmentNumber);
      if (new Set(installmentNumbers).size !== installmentNumbers.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Installment numbers must be unique.",
        });
      }

      // Perform updates in a transaction
      await db.transaction(async (tx) => {
        // 1. Update batch enrollment if exists
        if (activeEnrollment) {
          await tx.update(batchEnrollments)
            .set({
              paymentType: input.paymentType,
            })
            .where(eq(batchEnrollments.id, activeEnrollment.id));
        }

        // 2. Delete all existing unpaid tuition payments
        await tx.delete(payments)
          .where(and(
            eq(payments.studentId, studentId),
            eq(payments.status, "unpaid"),
            eq(payments.type, "tuition")
          ));

        // 3. Insert new unpaid payments/installments
        let paymentDueDate: Date | null = null;
        if (input.paymentType === "INSTALLMENT") {
          for (const inst of inputUnpaid) {
            await tx.insert(payments).values({
              studentId,
              amount: String(inst.amount),
              type: "tuition",
              status: "unpaid",
              dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
              installmentNumber: inst.installmentNumber,
              batchId: activeEnrollment?.batchId || null,
              notes: `Installment #${inst.installmentNumber} (configured)`,
            });
          }

          // Next due date is the earliest unpaid installment's due date
          const unpaidWithDates = inputUnpaid.filter((inst) => !!inst.dueDate);
          if (unpaidWithDates.length > 0) {
            const sortedUnpaid = [...unpaidWithDates].sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
            paymentDueDate = sortedUnpaid[0].dueDate!;
          }
        } else {
          // Full payment
          const unpaidAmount = input.totalCourseFee - sumPaid;
          if (unpaidAmount > 0) {
            // Find earliest due date if specified in input installments, or default to profile's due date / today
            paymentDueDate = input.installments.find((inst) => inst.status === "unpaid")?.dueDate || profile.paymentDueDate || new Date();

            await tx.insert(payments).values({
              studentId,
              amount: String(unpaidAmount),
              type: "tuition",
              status: "unpaid",
              dueDate: paymentDueDate,
              installmentNumber: null,
              batchId: activeEnrollment?.batchId || null,
              notes: `Unpaid balance (Full Payment)`,
            });
          }
        }

        // 4. Update student profile
        const feesTotal = String(input.totalCourseFee);
        const feesPaid = String(sumPaid);
        const feesBalance = String(input.totalCourseFee - sumPaid);
        const nextPaymentStatus = (input.totalCourseFee - sumPaid <= 0) ? "paid" : (sumPaid > 0 ? "partial" : "unpaid");

        const minInitialPayment = input.initialPayment !== undefined ? String(input.initialPayment) : profile.minInitialPayment;
        const downPayment = input.initialPayment !== undefined ? String(input.initialPayment) : profile.downPayment;

        const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
        timeline.push({
          type: "fee_rules_configuration",
          paymentType: input.paymentType,
          totalCourseFee: input.totalCourseFee,
          initialPayment: input.initialPayment,
          outstandingBalance: input.totalCourseFee - sumPaid,
          timestamp: new Date().toISOString(),
        });

        await tx.update(profiles)
          .set({
            feesTotal,
            feesPaid,
            feesBalance,
            minInitialPayment,
            downPayment,
            paymentStatus: nextPaymentStatus,
            paymentOption: input.paymentType === "INSTALLMENT" ? "installment" : "full_payment",
            paymentDueDate,
            activityTimeline: timeline,
            totalCourseFee: feesTotal,
            remainingBalance: feesBalance,
          })
          .where(eq(profiles.userId, studentId));
      });

      // Recalculate student fees
      await recalculateStudentFees(studentId);

      // Reactivate user if fees are fully cleared
      const finalProfile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, studentId),
      });
      if (finalProfile && parseFloat(finalProfile.feesBalance ?? "0") <= 0) {
        await db.update(batchEnrollments)
          .set({ status: "active" })
          .where(and(
            eq(batchEnrollments.studentId, studentId),
            eq(batchEnrollments.status, "restricted")
          ));

        await db.update(users)
          .set({ status: "active" })
          .where(eq(users.id, studentId));
      }

      return { success: true };
    }),

  sendManualReminder: adminQuery
    .input(z.object({ studentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Student profile not found" });

      const message = `Manual Reminder: Your batch fee balance of ₹${profile.feesBalance} is outstanding. Please pay as soon as possible.`;
      
      await sendNotification(
        input.studentId,
        "Fee Payment Reminder",
        message,
        "fee_reminder_manual"
      );

      // Log manual reminder
      const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
      timeline.push({
        type: "manual_reminder_sent",
        timestamp: new Date().toISOString(),
      });
      await db.update(profiles)
        .set({ activityTimeline: timeline })
        .where(eq(profiles.userId, input.studentId));

      return { success: true };
    }),

  exportPaymentReport: adminQuery
    .input(z.object({
      batchId: z.number().optional(),
      status: z.string().optional(),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const filters = [];
      if (input.batchId) filters.push(eq(payments.batchId, input.batchId));
      if (input.status) filters.push(eq(payments.status, input.status as any));
      const where = filters.length > 0 ? and(...filters) : undefined;

      const list = await db.query.payments.findMany({
        where,
        orderBy: desc(payments.createdAt),
        with: {
          student: {
            with: {
              profile: true,
              enrollments: true,
            },
          },
          batch: true,
        },
      });

      return {
        format: input.format,
        message: "Use this structured data for client-side report generation.",
        data: list.map((l) => {
          const activeEnrollment = l.student?.enrollments?.find((e) => e.status === "active");
          const paymentType = activeEnrollment?.paymentType || "FULL_PAYMENT";

          return {
            id: l.id,
            studentName: l.student?.name,
            studentId: l.student?.unionId,
            batchName: l.batch?.name,
            amount: l.amount,
            type: l.type,
            status: l.status,
            dueDate: l.dueDate,
            paidAt: l.paidAt,
            transactionId: l.transactionId,
            installmentNumber: l.installmentNumber,
            paidDate: l.paidDate,
            paymentType,
            totalFee: l.student?.profile?.feesTotal || "0",
            amountPaid: l.student?.profile?.feesPaid || "0",
            outstandingBalance: l.student?.profile?.feesBalance || "0",
            paymentStatus: l.student?.profile?.paymentStatus || "unpaid",
          };
        }),
      };
    }),

  // ─── Flexibility Requests ────────────────────────────────────────────────────

  listRequests: adminQuery
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();
      const where = input?.status
        ? eq(flexibilityRequests.status, input.status as "pending" | "approved" | "rejected" | "cancelled")
        : undefined;
      const list = await db.query.flexibilityRequests.findMany({
        where,
        orderBy: desc(flexibilityRequests.requestedAt),
        with: { student: { with: { profile: true } }, fromBatch: true, toBatch: true, resolver: true },
      });

      return list.map((req) => {
        const fromFee = req.fromBatch ? parseFloat(req.fromBatch.courseFee ?? "0") : 0;
        const toFee = req.toBatch ? parseFloat(req.toBatch.courseFee ?? "0") : 0;
        return {
          ...req,
          fromBatchFee: fromFee,
          toBatchFee: toFee,
          feeDifference: toFee - fromFee,
        };
      });
    }),

  // Tasks 10.1–10.3 — apply enrollment state changes, notify, append timeline
  resolveRequest: adminQuery
    .input(z.object({
      requestId: z.number(),
      status: z.enum(["approved", "rejected"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied",
        });
      }
      const db = getDb();

      const request = await db.query.flexibilityRequests.findFirst({
        where: eq(flexibilityRequests.id, input.requestId),
      });
      if (!request) throw new Error("Request not found");

      await db.update(flexibilityRequests)
        .set({
          status: input.status,
          adminNote: input.note,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
        })
        .where(eq(flexibilityRequests.id, input.requestId));

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, request.studentId),
      });

      // Task 10.1 — apply enrollment state changes on approval
      if (input.status === "approved") {
        const { requestType, fromBatchId, toBatchId, studentId } = request;

        if (requestType === "hold" && fromBatchId) {
          await db.update(batchEnrollments)
            .set({ status: "on_hold" })
            .where(and(
              eq(batchEnrollments.batchId, fromBatchId),
              eq(batchEnrollments.studentId, studentId),
            ));
        } else if (requestType === "rejoin" && fromBatchId) {
          await db.update(batchEnrollments)
            .set({ status: "active" })
            .where(and(
              eq(batchEnrollments.batchId, fromBatchId),
              eq(batchEnrollments.studentId, studentId),
            ));
        } else if (requestType === "batch_change" && fromBatchId && toBatchId) {
          await db.update(batchEnrollments)
            .set({ status: "inactive", leftAt: new Date() })
            .where(and(
              eq(batchEnrollments.batchId, fromBatchId),
              eq(batchEnrollments.studentId, studentId),
            ));
          await db.insert(batchEnrollments).values({
            batchId: toBatchId,
            studentId,
            status: "active",
          });

          // Update student profile with new batch details and adjust fees
          const newBatch = await db.query.batches.findFirst({
            where: eq(batches.id, toBatchId),
            with: { module: true },
          });

          const oldBatch = await db.query.batches.findFirst({
            where: eq(batches.id, fromBatchId),
          });

          if (newBatch && profile) {
            const oldFee = parseFloat(oldBatch?.courseFee ?? "0");
            const newFee = parseFloat(newBatch.courseFee ?? "0");
            const diff = newFee - oldFee;

            const currentTotal = parseFloat(profile.feesTotal ?? "0");
            const currentPaid = parseFloat(profile.feesPaid ?? "0");
            
            const nextTotal = Math.max(0, currentTotal + diff);
            const nextBalance = Math.max(0, nextTotal - currentPaid);
            const nextPaymentStatus = nextBalance <= 0 ? "paid" : (currentPaid > 0 ? "partial" : "unpaid");

            await db.update(profiles)
              .set({
                batch: newBatch.name,
                batchTime: newBatch.timeSlot,
                course: newBatch.module?.name || null,
                feesTotal: String(nextTotal),
                feesBalance: String(nextBalance),
                paymentStatus: nextPaymentStatus,
              })
              .where(eq(profiles.userId, studentId));
          }
        } else if (requestType === "batch_removal" && fromBatchId) {
          await db.update(batchEnrollments)
            .set({ status: "inactive", leftAt: new Date() })
            .where(and(
              eq(batchEnrollments.batchId, fromBatchId),
              eq(batchEnrollments.studentId, studentId),
            ));
          
          // Clear profile batch info
          await db.update(profiles)
            .set({
              batch: null,
              batchTime: null,
              course: null,
            })
            .where(eq(profiles.userId, studentId));
        }
      }

      // Task 10.2 — notify student
      const statusLabel = input.status === "approved" ? "approved" : "rejected";
      await sendNotification(
        request.studentId,
        "Flexibility Request Update",
        `Your ${request.requestType.replace("_", " ")} request has been ${statusLabel}.${input.note ? ` Note: ${input.note}` : ""}`,
        "flexibility_request_resolved",
      );

      // Task 10.3 — append to activityTimeline
      if (profile) {
        const timeline = Array.isArray(profile.activityTimeline) ? profile.activityTimeline : [];
        timeline.push({
          type: request.requestType,
          status: input.status,
          timestamp: new Date().toISOString(),
          adminNote: input.note ?? null,
        });
        await db.update(profiles)
          .set({ activityTimeline: timeline })
          .where(eq(profiles.userId, request.studentId));
      }

      return { success: true };
    }),

  // ─── Teacher Salaries ────────────────────────────────────────────────────────

  listSalaries: adminQuery
    .input(z.object({ teacherId: z.number().optional(), month: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const filters = [];
      if (input?.teacherId) filters.push(eq(teacherSalaries.teacherId, input.teacherId));
      if (input?.month) filters.push(eq(teacherSalaries.month, input.month));
      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.query.teacherSalaries.findMany({
        where,
        with: { teacher: true },
      });
    }),

  calculateSalary: adminQuery
    .input(z.object({
      teacherId: z.number(),
      month: z.string(),
      groupClassRate: z.number().optional(),
      oneToOneRate: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const res = await recalculateSalaryInternal(db, input.teacherId, input.month, true);
      if (!res) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to calculate salary" });
      }
      return res;
    }),

  getSalaryConfig: adminQuery
    .input(z.object({ teacherId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const config = await db.query.teacherSalaryConfigs.findFirst({
        where: eq(teacherSalaryConfigs.teacherId, input.teacherId),
      });
      return config ?? {
        basicSalary: "0.00",
        group30MinRate: "0.00",
        group45MinRate: "0.00",
        group60MinRate: "0.00",
        oneToOne30MinRate: "0.00",
        oneToOne45MinRate: "0.00",
        oneToOne60MinRate: "0.00",
      };
    }),

  updateSalaryConfig: adminQuery
    .input(z.object({
      teacherId: z.number(),
      basicSalary: z.number().nonnegative(),
      group30MinRate: z.number().nonnegative(),
      group45MinRate: z.number().nonnegative(),
      group60MinRate: z.number().nonnegative(),
      oneToOne30MinRate: z.number().nonnegative(),
      oneToOne45MinRate: z.number().nonnegative(),
      oneToOne60MinRate: z.number().nonnegative(),
      bonusAmount: z.number().nonnegative().optional().default(0),
      deductionAmount: z.number().nonnegative().optional().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin is allowed to modify salary configurations." });
      }
      const db = getDb();
      const existing = await db.query.teacherSalaryConfigs.findFirst({
        where: eq(teacherSalaryConfigs.teacherId, input.teacherId),
      });

      const basicSalaryStr = String(input.basicSalary);
      const group30MinRateStr = String(input.group30MinRate);
      const group45MinRateStr = String(input.group45MinRate);
      const group60MinRateStr = String(input.group60MinRate);
      const oneToOne30MinRateStr = String(input.oneToOne30MinRate);
      const oneToOne45MinRateStr = String(input.oneToOne45MinRate);
      const oneToOne60MinRateStr = String(input.oneToOne60MinRate);
      const bonusAmountStr = String(input.bonusAmount ?? 0);
      const deductionAmountStr = String(input.deductionAmount ?? 0);

      const prevBasic = existing ? parseFloat(existing.basicSalary) : 0;
      const prevGroup30 = existing ? parseFloat(existing.group30MinRate) : 0;
      const prevGroup45 = existing ? parseFloat(existing.group45MinRate) : 0;
      const prevGroup60 = existing ? parseFloat(existing.group60MinRate) : 0;
      const prevOneToOne30 = existing ? parseFloat(existing.oneToOne30MinRate) : 0;
      const prevOneToOne45 = existing ? parseFloat(existing.oneToOne45MinRate) : 0;
      const prevOneToOne60 = existing ? parseFloat(existing.oneToOne60MinRate) : 0;
      const prevBonus = existing ? parseFloat(existing.bonusAmount) : 0;
      const prevDeduction = existing ? parseFloat(existing.deductionAmount) : 0;

      // Update or insert configuration
      if (existing) {
        await db.update(teacherSalaryConfigs)
          .set({
            basicSalary: basicSalaryStr,
            group30MinRate: group30MinRateStr,
            group45MinRate: group45MinRateStr,
            group60MinRate: group60MinRateStr,
            oneToOne30MinRate: oneToOne30MinRateStr,
            oneToOne45MinRate: oneToOne45MinRateStr,
            oneToOne60MinRate: oneToOne60MinRateStr,
            bonusAmount: bonusAmountStr,
            deductionAmount: deductionAmountStr,
            updatedAt: new Date(),
          })
          .where(eq(teacherSalaryConfigs.id, existing.id));
      } else {
        await db.insert(teacherSalaryConfigs).values({
          teacherId: input.teacherId,
          basicSalary: basicSalaryStr,
          group30MinRate: group30MinRateStr,
          group45MinRate: group45MinRateStr,
          group60MinRate: group60MinRateStr,
          oneToOne30MinRate: oneToOne30MinRateStr,
          oneToOne45MinRate: oneToOne45MinRateStr,
          oneToOne60MinRate: oneToOne60MinRateStr,
          bonusAmount: bonusAmountStr,
          deductionAmount: deductionAmountStr,
        });
      }

      // Log changes to audit trail
      const auditEntries: any[] = [];
      const addAuditLog = (fieldName: string, prev: number, curr: string) => {
        if (parseFloat(curr) !== prev) {
          auditEntries.push({
            teacherId: input.teacherId,
            fieldName,
            previousValue: String(prev),
            newValue: curr,
            changedBy: ctx.user.id,
          });
        }
      };

      addAuditLog("basicSalary", prevBasic, basicSalaryStr);
      addAuditLog("group30MinRate", prevGroup30, group30MinRateStr);
      addAuditLog("group45MinRate", prevGroup45, group45MinRateStr);
      addAuditLog("group60MinRate", prevGroup60, group60MinRateStr);
      addAuditLog("oneToOne30MinRate", prevOneToOne30, oneToOne30MinRateStr);
      addAuditLog("oneToOne45MinRate", prevOneToOne45, oneToOne45MinRateStr);
      addAuditLog("oneToOne60MinRate", prevOneToOne60, oneToOne60MinRateStr);
      addAuditLog("bonusAmount", prevBonus, bonusAmountStr);
      addAuditLog("deductionAmount", prevDeduction, deductionAmountStr);

      if (auditEntries.length > 0) {
        await db.insert(teacherSalaryConfigAuditLogs).values(auditEntries);
      }

      // Automatically recalculate the current month's salary if a record exists
      const currentMonth = new Date().toISOString().substring(0, 7);
      await recalculateSalaryInternal(db, input.teacherId, currentMonth);

      return { success: true };
    }),

  listConfigAuditLogs: adminQuery
    .input(z.object({ teacherId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const filters = [];
      if (input?.teacherId) filters.push(eq(teacherSalaryConfigAuditLogs.teacherId, input.teacherId));
      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.query.teacherSalaryConfigAuditLogs.findMany({
        where,
        orderBy: desc(teacherSalaryConfigAuditLogs.changedAt),
        with: {
          teacher: true,
          changedByUser: true,
        },
      });
    }),

  markSalaryPaid: adminQuery
    .input(z.object({
      salaryId: z.number(),
      paymentDate: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin is allowed to mark salaries as paid." });
      }
      const db = getDb();
      const salary = await db.query.teacherSalaries.findFirst({
        where: eq(teacherSalaries.id, input.salaryId),
      });
      if (!salary) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Salary record not found." });
      }

      await db.update(teacherSalaries)
        .set({
          status: "paid",
          paymentDate: input.paymentDate ?? new Date(),
        })
        .where(eq(teacherSalaries.id, input.salaryId));

      return { success: true };
    }),

  // Task 12.1 — salary report export (structured JSON for client-side generation)
  exportSalaryReport: adminQuery
    .input(z.object({
      teacherId: z.number(),
      month: z.string(),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "academic_head") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access Denied" });
      }
      const db = getDb();
      const teacher = await db.query.users.findFirst({ where: eq(users.id, input.teacherId) });
      const salary = await db.query.teacherSalaries.findFirst({
        where: and(
          eq(teacherSalaries.teacherId, input.teacherId),
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

  // ─── Feedback ────────────────────────────────────────────────────────────────

  listFeedback: adminQuery
    .input(z.object({
      teacherId: z.number().optional(),
      batchId: z.number().optional(),
      courseName: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      
      let batchIdsWithCourse: number[] | undefined = undefined;
      if (input?.courseName) {
        const matchingBatches = await db
          .select({ id: batches.id })
          .from(batches)
          .innerJoin(modules, eq(batches.moduleId, modules.id))
          .where(ilike(modules.name, `%${input.courseName}%`));
        batchIdsWithCourse = matchingBatches.map(b => b.id);
        if (batchIdsWithCourse.length === 0) {
          return [];
        }
      }
      
      const whereConditions = [];
      if (input?.teacherId) whereConditions.push(eq(feedback.teacherId, input.teacherId));
      if (input?.batchId) whereConditions.push(eq(feedback.batchId, input.batchId));
      if (batchIdsWithCourse) whereConditions.push(inArray(feedback.batchId, batchIdsWithCourse));
      if (input?.startDate) whereConditions.push(gte(feedback.createdAt, input.startDate));
      if (input?.endDate) whereConditions.push(lte(feedback.createdAt, input.endDate));
      
      const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;
      
      return db.query.feedback.findMany({
        where,
        orderBy: desc(feedback.createdAt),
        with: {
          student: true,
          teacher: true,
          batch: {
            with: {
              module: true
            }
          },
          class: true,
        },
      });
    }),

  getFeedbackStats: adminQuery
    .input(z.object({
      teacherId: z.number().optional(),
      batchId: z.number().optional(),
      courseName: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      
      let batchIdsWithCourse: number[] | undefined = undefined;
      if (input?.courseName) {
        const matchingBatches = await db
          .select({ id: batches.id })
          .from(batches)
          .innerJoin(modules, eq(batches.moduleId, modules.id))
          .where(ilike(modules.name, `%${input.courseName}%`));
        batchIdsWithCourse = matchingBatches.map(b => b.id);
        if (batchIdsWithCourse.length === 0) {
          return {
            averageRating: 0,
            totalCount: 0,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            recentComments: [],
          };
        }
      }
      
      const whereConditions = [];
      if (input?.teacherId) whereConditions.push(eq(feedback.teacherId, input.teacherId));
      if (input?.batchId) whereConditions.push(eq(feedback.batchId, input.batchId));
      if (batchIdsWithCourse) whereConditions.push(inArray(feedback.batchId, batchIdsWithCourse));
      if (input?.startDate) whereConditions.push(gte(feedback.createdAt, input.startDate));
      if (input?.endDate) whereConditions.push(lte(feedback.createdAt, input.endDate));
      
      const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;
      
      const feedbacks = await db.query.feedback.findMany({
        where,
        orderBy: desc(feedback.createdAt),
        with: {
          student: true,
          teacher: true,
          batch: true,
        }
      });
      
      const totalCount = feedbacks.length;
      if (totalCount === 0) {
        return {
          averageRating: 0,
          totalCount: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          recentComments: [],
        };
      }
      
      const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
      const averageRating = Math.round((sum / totalCount) * 100) / 100;
      
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const f of feedbacks) {
        const rating = f.rating as 1 | 2 | 3 | 4 | 5;
        if (distribution[rating] !== undefined) {
          distribution[rating]++;
        }
      }
      
      const recentComments = feedbacks
        .filter((f) => f.comment && f.comment.trim() !== "")
        .map((f) => ({
          studentName: f.student.name,
          teacherName: f.teacher.name,
          rating: f.rating,
          comment: f.comment,
          createdAt: f.createdAt,
          batchName: f.batch?.name || "N/A",
        }))
        .slice(0, 10);
        
      return {
        averageRating,
        totalCount,
        distribution,
        recentComments,
      };
    }),

  getFeedbackSettings: adminQuery.query(async () => {
    const db = getDb();
    const settingsList = await db.query.systemSettings.findMany();
    const settingsMap = new Map(settingsList.map((s) => [s.key, s.value]));
    
    return {
      feedback_edit_period_minutes: parseInt(settingsMap.get("feedback_edit_period_minutes") || "60", 10),
      feedback_limit_per_batch: settingsMap.has("feedback_limit_per_batch")
        ? settingsMap.get("feedback_limit_per_batch") === "true"
        : true,
      feedback_teacher_stats_enabled: settingsMap.get("feedback_teacher_stats_enabled") === "true",
    };
  }),

  updateFeedbackSettings: adminQuery
    .input(z.object({
      feedback_edit_period_minutes: z.number().nonnegative(),
      feedback_limit_per_batch: z.boolean(),
      feedback_teacher_stats_enabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!["super_admin", "admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins/Super Admins can update system settings.",
        });
      }
      const db = getDb();
      
      const upsertSetting = async (key: string, value: string) => {
        const existing = await db.query.systemSettings.findFirst({
          where: eq(systemSettings.key, key),
        });
        if (existing) {
          await db.update(systemSettings)
            .set({ value, updatedAt: new Date() })
            .where(eq(systemSettings.key, key));
        } else {
          await db.insert(systemSettings).values({ key, value });
        }
      };
      
      await upsertSetting("feedback_edit_period_minutes", String(input.feedback_edit_period_minutes));
      await upsertSetting("feedback_limit_per_batch", String(input.feedback_limit_per_batch));
      await upsertSetting("feedback_teacher_stats_enabled", String(input.feedback_teacher_stats_enabled));
      
      return { success: true };
    }),

  getStudentIdConfig: adminQuery
    .query(async () => {
      const db = getDb();
      const activePrefixRow = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "active_student_id_prefix"),
      });
      const activePrefix = activePrefixRow?.value || "STU";

      const seq = await db.query.studentIdSequence.findFirst({
        where: eq(studentIdSequence.prefix, activePrefix),
      });

      return {
        prefix: activePrefix,
        startingNumber: seq ? seq.lastNumber + 1 : 1,
        numberLength: seq ? seq.numberLength : 4,
      };
    }),

  updateStudentIdConfig: adminQuery
    .input(z.object({
      prefix: z.string().min(1).max(50),
      startingNumber: z.number().int().nonnegative(),
      numberLength: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Upsert prefix key in systemSettings
      const existingPrefix = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "active_student_id_prefix"),
      });
      if (existingPrefix) {
        await db.update(systemSettings)
          .set({ value: input.prefix, updatedAt: new Date() })
          .where(eq(systemSettings.key, "active_student_id_prefix"));
      } else {
        await db.insert(systemSettings).values({ key: "active_student_id_prefix", value: input.prefix });
      }

      // Upsert in studentIdSequence table
      const seq = await db.query.studentIdSequence.findFirst({
        where: eq(studentIdSequence.prefix, input.prefix),
      });
      if (seq) {
        await db.update(studentIdSequence)
          .set({
            lastNumber: input.startingNumber - 1,
            numberLength: input.numberLength,
          })
          .where(eq(studentIdSequence.prefix, input.prefix));
      } else {
        await db.insert(studentIdSequence).values({
          prefix: input.prefix,
          lastNumber: input.startingNumber - 1,
          numberLength: input.numberLength,
        });
      }

      return { success: true };
    }),

  getDefaultCountry: adminQuery
    .query(async () => {
      const db = getDb();
      const codeRow = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "default_country_code"),
      });
      const isoRow = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "default_country_iso"),
      });
      return {
        code: codeRow?.value || "+91",
        iso: isoRow?.value || "IN",
      };
    }),

  updateDefaultCountry: adminQuery
    .input(z.object({
      code: z.string(),
      iso: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const upsert = async (key: string, value: string) => {
        const existing = await db.query.systemSettings.findFirst({
          where: eq(systemSettings.key, key),
        });
        if (existing) {
          await db.update(systemSettings)
            .set({ value, updatedAt: new Date() })
            .where(eq(systemSettings.key, key));
        } else {
          await db.insert(systemSettings).values({ key, value });
        }
      };
      await upsert("default_country_code", input.code);
      await upsert("default_country_iso", input.iso);
      return { success: true };
    }),

  getTeacherAggregatedStats: teacherQuery
    .input(z.object({
      teacherId: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      
      let targetTeacherId = ctx.user.id;
      
      const isPrivileged = ["super_admin", "admin", "academic_head"].includes(ctx.user.role);
      if (input?.teacherId && isPrivileged) {
        targetTeacherId = input.teacherId;
      }
      
      if (ctx.user.role === "teacher" && targetTeacherId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view your own statistics.",
        });
      }
      
      if (ctx.user.role === "teacher") {
        const statsEnabledRow = await db.query.systemSettings.findFirst({
          where: eq(systemSettings.key, "feedback_teacher_stats_enabled"),
        });
        const statsEnabled = statsEnabledRow ? statsEnabledRow.value === "true" : false;
        if (!statsEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Feedback statistics view is currently disabled by the Super Admin.",
          });
        }
      }
      
      const feedbacks = await db.query.feedback.findMany({
        where: eq(feedback.teacherId, targetTeacherId),
      });
      
      const totalCount = feedbacks.length;
      if (totalCount === 0) {
        return {
          averageRating: 0,
          totalCount: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
      }
      
      const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
      const averageRating = Math.round((sum / totalCount) * 100) / 100;
      
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const f of feedbacks) {
        const rating = f.rating as 1 | 2 | 3 | 4 | 5;
        if (distribution[rating] !== undefined) {
          distribution[rating]++;
        }
      }
      
      return {
        averageRating,
        totalCount,
        distribution,
      };
    }),

  // ─── Notifications ───────────────────────────────────────────────────────────

  listNotifications: adminQuery
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const where = input?.userId ? eq(notifications.userId, input.userId) : undefined;
      return db.query.notifications.findMany({
        where,
        orderBy: desc(notifications.createdAt),
        with: { user: true },
      });
    }),

  sendNotification: adminQuery
    .input(z.object({
      userId: z.number(),
      title: z.string(),
      message: z.string(),
      type: z.string(),
      data: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(notifications).values(input);
      return { success: true };
    }),

  // ─── Violations / Discipline ─────────────────────────────────────────────────

  listViolations: adminQuery.query(async () => {
    const db = getDb();
    return db.query.violations.findMany({
      orderBy: desc(violations.createdAt),
      with: { user: true, reporter: true },
    });
  }),

  // Task 14.1 — notify subject user after violation creation
  createViolation: adminQuery
    .input(z.object({
      userId: z.number(),
      type: z.string(),
      description: z.string(),
      action: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.insert(violations).values({
        ...input,
        reportedBy: ctx.user.id,
      });

      await sendNotification(
        input.userId,
        "Violation Recorded",
        `A ${input.type} violation has been recorded against your account. ${input.description}`,
        "violation_created",
      );

      return { success: true };
    }),

  // Task 14.2 — resolve violation
  resolveViolation: adminQuery
    .input(z.object({ violationId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(violations)
        .set({ status: "resolved", resolvedAt: new Date() })
        .where(eq(violations.id, input.violationId));
      return { success: true };
    }),

  // Task 14.3 — suspend user
  suspendUser: adminQuery
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users)
        .set({ status: "suspended" })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),

  // ─── Reports & Analytics ─────────────────────────────────────────────────────

  getDashboardStats: adminQuery.query(async () => {
    const db = getDb();
    const totalStudents = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "student"));
    const totalTeachers = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "teacher"));
    const totalBatches = await db.select({ count: sql<number>`count(*)` }).from(batches);
    const totalClasses = await db.select({ count: sql<number>`count(*)` }).from(classes).where(eq(classes.status, "completed"));
    const pendingFees = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` }).from(payments).where(eq(payments.status, "unpaid"));

    return {
      totalStudents: Number(totalStudents[0]?.count || 0),
      totalTeachers: Number(totalTeachers[0]?.count || 0),
      totalBatches: Number(totalBatches[0]?.count || 0),
      totalClasses: Number(totalClasses[0]?.count || 0),
      pendingFees: Number(pendingFees[0]?.total || 0),
    };
  }),

  searchStudents: adminQuery
    .input(z.object({ search: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const query = `%${input.search.trim()}%`;
      
      const results = await db
        .select({
          id: users.id,
          name: users.name,
          unionId: users.unionId,
          enrollmentId: profiles.enrollmentId,
          course: profiles.course,
          batch: profiles.batch,
          oneOnOneEnabled: profiles.oneOnOneEnabled,
          groupSessionEnabled: profiles.groupSessionEnabled,
          preferredClassTime: profiles.preferredClassTime,
          paymentType: profiles.paymentType,
        })
        .from(users)
        .leftJoin(profiles, eq(users.id, profiles.userId))
        .where(
          and(
            eq(users.role, "student"),
            or(
              ilike(users.name, query),
              ilike(users.unionId, query),
              ilike(profiles.enrollmentId, query),
              ilike(profiles.preferredClassTime, query),
              ilike(profiles.paymentType, query)
            )
          )
        )
        .limit(20);

      return results;
    }),

  getStudentReport: adminQuery
    .input(z.object({ studentId: z.union([z.number(), z.string()]) }))
    .query(async ({ input }) => {
      const db = getDb();

      let userId: number | null = null;
      if (typeof input.studentId === "number") {
        userId = input.studentId;
      } else {
        const trimmed = input.studentId.trim();
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed) && String(parsed) === trimmed) {
          userId = parsed;
        } else {
          // Exact match check
          const userByUnion = await db.query.users.findFirst({
            where: and(eq(users.role, "student"), eq(users.unionId, trimmed)),
          });
          if (userByUnion) {
            userId = userByUnion.id;
          } else {
            const profileByEnrollment = await db.query.profiles.findFirst({
              where: eq(profiles.enrollmentId, trimmed),
            });
            if (profileByEnrollment) {
              userId = profileByEnrollment.userId;
            } else {
              // Partial match fallback: return first user matching the search string
              const partialMatches = await db
                .select({ id: users.id })
                .from(users)
                .leftJoin(profiles, eq(users.id, profiles.userId))
                .where(
                  and(
                    eq(users.role, "student"),
                    or(
                      ilike(users.unionId, `%${trimmed}%`),
                      ilike(profiles.enrollmentId, `%${trimmed}%`),
                      ilike(users.name, `%${trimmed}%`)
                    )
                  )
                )
                .limit(1);
              if (partialMatches.length > 0) {
                userId = partialMatches[0].id;
              }
            }
          }
        }
      }

      if (!userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No matching student found." });
      }

      return await fetchFullStudentReportData(db, userId);
    }),

  // Tasks 13.1 + 13.2 — teacher report with performance classification
  searchTeachers: adminQuery
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      batchId: z.number().optional()
    }).default({}))
    .query(async ({ input }) => {
      const db = getDb();
      let conditions = [eq(users.role, "teacher")];

      if (input.search && input.search.trim()) {
        const query = `%${input.search.trim()}%`;
        const cond = or(
          ilike(users.name, query),
          ilike(users.unionId, query)
        );
        if (cond) conditions.push(cond);
      }

      if (input.status && input.status !== "all") {
        const mappedStatus = (input.status === "on_leave" ? "on_hold" : input.status) as "active" | "inactive" | "suspended" | "on_hold";
        conditions.push(eq(users.status, mappedStatus));
      }

      let results;
      if (input.batchId) {
        results = await db
          .select({
            id: users.id,
            name: users.name,
            unionId: users.unionId,
            status: users.status,
            email: users.email,
            phone: users.phone,
            avatar: users.avatar,
          })
          .from(users)
          .innerJoin(batches, eq(users.id, batches.teacherId))
          .where(and(...conditions, eq(batches.id, input.batchId)))
          .limit(50);
      } else {
        results = await db
          .select({
            id: users.id,
            name: users.name,
            unionId: users.unionId,
            status: users.status,
            email: users.email,
            phone: users.phone,
            avatar: users.avatar,
          })
          .from(users)
          .where(and(...conditions))
          .limit(50);
      }

      return results;
    }),

  getTeacherReport: adminQuery
    .input(z.object({ teacherId: z.union([z.number(), z.string()]) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();

      let userId: number;
      if (typeof input.teacherId === "string") {
        const parsed = parseInt(input.teacherId, 10);
        if (!isNaN(parsed) && String(parsed) === input.teacherId.trim()) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: and(eq(users.role, "teacher"), eq(users.unionId, input.teacherId)),
          });
          if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Teacher not found with this ID" });
          userId = u.id;
        }
      } else {
        userId = input.teacherId;
      }

      const report = await fetchFullTeacherReportData(db, userId);
      if (ctx.user.role === "academic_head") {
        report.salaries = [];
        report.salaryReport = {
          config: {
            basicSalary: 0,
            group30MinRate: 0,
            group45MinRate: 0,
            group60MinRate: 0,
            oneToOne30MinRate: 0,
            oneToOne45MinRate: 0,
            oneToOne60MinRate: 0,
            bonusAmount: 0,
            deductionAmount: 0,
          },
          currentMonthBreakdown: {
            month: "",
            oneToOne: { min30: { count: 0, earnings: 0 }, min45: { count: 0, earnings: 0 }, min60: { count: 0, earnings: 0 }, totalEarnings: 0 },
            group: { min30: { count: 0, earnings: 0 }, min45: { count: 0, earnings: 0 }, min60: { count: 0, earnings: 0 }, totalEarnings: 0 },
            summary: { basicSalary: 0, oneToOneEarnings: 0, groupEarnings: 0, incentives: 0, bonus: 0, deductions: 0, netSalary: 0 }
          },
          history: []
        };
      }
      return report;
    }),

  // Task 13.3 — ranked teacher list by studentCompletionRate
  listTeachersByPerformance: adminQuery.query(async () => {
    const db = getDb();
    const teachers = await db.query.users.findMany({
      where: eq(users.role, "teacher"),
    });

    const results = [];
    for (const teacher of teachers) {
      const teacherBatches = await db.query.batches.findMany({
        where: eq(batches.teacherId, teacher.id),
      });

      const enrolledStudentIds = new Set<number>();
      for (const batch of teacherBatches) {
        const enrollments = await db.query.batchEnrollments.findMany({
          where: eq(batchEnrollments.batchId, batch.id),
        });
        enrollments.forEach((e) => enrolledStudentIds.add(e.studentId));
      }

      const totalStudents = enrolledStudentIds.size;
      let completedStudents = 0;
      for (const studentId of enrolledStudentIds) {
        const profile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, studentId),
        });
        if (profile?.completionDate) completedStudents++;
      }

      const studentCompletionRate = totalStudents > 0
        ? Math.round((completedStudents / totalStudents) * 100)
        : 0;

      // Task 17.3 — flag teachers with completion rate < 60% (feature-flagged)
      const needsImprovement = process.env.FEATURE_AI_INSIGHTS === "true"
        ? studentCompletionRate < 60
        : undefined;

      results.push({
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        studentCompletionRate,
        ...(needsImprovement !== undefined ? { needsImprovement } : {}),
      });
    }

    return results.sort((a, b) => b.studentCompletionRate - a.studentCompletionRate);
  }),

  // Task 13.4 — student leaderboard with composite score
  getLeaderboard: adminQuery.query(async () => {
    const db = getDb();
    const students = await db.query.users.findMany({
      where: eq(users.role, "student"),
    });

    const results = [];
    for (const student of students) {
      const attendanceRecords = await db.query.attendance.findMany({
        where: eq(attendance.studentId, student.id),
      });
      const total = attendanceRecords.length;
      const present = attendanceRecords.filter((a) => a.status === "present").length;
      const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;

      const chatActivity = attendanceRecords.reduce((sum, r) => sum + (r.chatCount ?? 0), 0);
      const compositeScore = attendancePct + chatActivity;

      // Task 17.2 — flag at-risk students (feature-flagged)
      const atRisk = process.env.FEATURE_AI_INSIGHTS === "true"
        ? attendancePct < 60
        : undefined;

      results.push({
        id: student.id,
        name: student.name,
        attendancePct,
        chatActivity,
        compositeScore,
        ...(atRisk !== undefined ? { atRisk } : {}),
      });
    }

    return results.sort((a, b) => b.compositeScore - a.compositeScore);
  }),

  // Task 13.5 — export student/teacher reports (structured JSON for client-side generation)
  exportStudentReport: adminQuery
    .input(z.object({
      studentId: z.union([z.number(), z.string()]),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input }) => {
      const db = getDb();

      let userId: number | null = null;
      if (typeof input.studentId === "number") {
        userId = input.studentId;
      } else {
        const trimmed = input.studentId.trim();
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed) && String(parsed) === trimmed) {
          userId = parsed;
        } else {
          // Exact match check
          const userByUnion = await db.query.users.findFirst({
            where: and(eq(users.role, "student"), eq(users.unionId, trimmed)),
          });
          if (userByUnion) {
            userId = userByUnion.id;
          } else {
            const profileByEnrollment = await db.query.profiles.findFirst({
              where: eq(profiles.enrollmentId, trimmed),
            });
            if (profileByEnrollment) {
              userId = profileByEnrollment.userId;
            } else {
              // Partial match fallback
              const partialMatches = await db
                .select({ id: users.id })
                .from(users)
                .leftJoin(profiles, eq(users.id, profiles.userId))
                .where(
                  and(
                    eq(users.role, "student"),
                    or(
                      ilike(users.unionId, `%${trimmed}%`),
                      ilike(profiles.enrollmentId, `%${trimmed}%`),
                      ilike(users.name, `%${trimmed}%`)
                    )
                  )
                )
                .limit(1);
              if (partialMatches.length > 0) {
                userId = partialMatches[0].id;
              }
            }
          }
        }
      }

      if (!userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No matching student found." });
      }

      const reportData = await fetchFullStudentReportData(db, userId);

      return {
        format: input.format,
        message: "Use this structured data for client-side report generation.",
        data: reportData,
      };
    }),

  exportTeacherReport: adminQuery
    .input(z.object({
      teacherId: z.union([z.number(), z.string()]),
      format: z.enum(["pdf", "excel"]).default("excel"),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      
      let userId: number;
      if (typeof input.teacherId === "string") {
        const parsed = parseInt(input.teacherId, 10);
        if (!isNaN(parsed) && String(parsed) === input.teacherId.trim()) {
          userId = parsed;
        } else {
          const u = await db.query.users.findFirst({
            where: and(eq(users.role, "teacher"), eq(users.unionId, input.teacherId)),
          });
          if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Teacher not found with this ID" });
          userId = u.id;
        }
      } else {
        userId = input.teacherId;
      }

      const reportData = await fetchFullTeacherReportData(db, userId);
      if (ctx.user.role === "academic_head") {
        reportData.salaries = [];
        reportData.salaryReport = {
          config: {
            basicSalary: 0,
            group30MinRate: 0,
            group45MinRate: 0,
            group60MinRate: 0,
            oneToOne30MinRate: 0,
            oneToOne45MinRate: 0,
            oneToOne60MinRate: 0,
            bonusAmount: 0,
            deductionAmount: 0,
          },
          currentMonthBreakdown: {
            month: "",
            oneToOne: { min30: { count: 0, earnings: 0 }, min45: { count: 0, earnings: 0 }, min60: { count: 0, earnings: 0 }, totalEarnings: 0 },
            group: { min30: { count: 0, earnings: 0 }, min45: { count: 0, earnings: 0 }, min60: { count: 0, earnings: 0 }, totalEarnings: 0 },
            summary: { basicSalary: 0, oneToOneEarnings: 0, groupEarnings: 0, incentives: 0, bonus: 0, deductions: 0, netSalary: 0 }
          },
          history: []
        };
      }

      return {
        format: input.format,
        message: "Use this structured data for client-side report generation.",
        data: reportData,
      };
    }),

  getClassChatReport: adminQuery
    .input(z.object({ classId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
      if (!cls) return [];

      const filters = [eq(messages.batchId, cls.batchId)];
      if (cls.startedAt) filters.push(sql`${messages.createdAt} >= ${cls.startedAt}`);
      if (cls.endedAt) filters.push(sql`${messages.createdAt} <= ${cls.endedAt}`);

      const rows = await db
        .select({
          studentId: messages.senderId,
          studentName: users.name,
          messageCount: sql<number>`count(*)`,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(and(...filters))
        .groupBy(messages.senderId, users.name);

      return rows.map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        messageCount: Number(r.messageCount),
      }));
    }),

  getTeacherChatReport: adminQuery
    .input(z.object({ teacherId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const teacherClasses = await db.query.classes.findMany({
        where: eq(classes.teacherId, input.teacherId),
      });

      const result = [];
      for (const cls of teacherClasses) {
        const filters = [
          eq(messages.batchId, cls.batchId),
          eq(messages.senderId, input.teacherId),
        ];
        if (cls.startedAt) filters.push(sql`${messages.createdAt} >= ${cls.startedAt}`);
        if (cls.endedAt) filters.push(sql`${messages.createdAt} <= ${cls.endedAt}`);

        const rows = await db
          .select({ messageCount: sql<number>`count(*)` })
          .from(messages)
          .where(and(...filters));

        result.push({
          classId: cls.id,
          classTitle: cls.title,
          messageCount: Number(rows[0]?.messageCount ?? 0),
        });
      }
      return result;
    }),

  adjustStudentSessions: adminQuery
    .input(z.object({
      studentId: z.number(),
      allocatedOneToOne: z.number().nonnegative(),
      allocatedGroup: z.number().nonnegative(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access Denied: Only Super Admin can adjust session allocations.",
        });
      }

      const db = getDb();
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Student profile not found.",
        });
      }

      const prevOneToOne = profile.allocatedOneToOneSessions ?? 0;
      const prevGroup = profile.allocatedGroupSessions ?? 0;

      const attendedOneToOne = profile.attendedOneToOneSessions ?? 0;
      const attendedGroup = profile.attendedGroupSessions ?? 0;

      if (input.allocatedOneToOne < attendedOneToOne) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot reduce One-to-One sessions below the attended count of ${attendedOneToOne}.`,
        });
      }

      if (input.allocatedGroup < attendedGroup) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot reduce Group sessions below the attended count of ${attendedGroup}.`,
        });
      }

      const totalAllocated = input.allocatedOneToOne + input.allocatedGroup;
      const remainingOneToOne = input.allocatedOneToOne - attendedOneToOne;
      const remainingGroup = input.allocatedGroup - attendedGroup;
      const totalRemaining = remainingOneToOne + remainingGroup;

      const activeEnrollment = await db.query.batchEnrollments.findFirst({
        where: and(
          eq(batchEnrollments.studentId, input.studentId),
          eq(batchEnrollments.status, "active")
        )
      });
      if (!activeEnrollment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Active enrollment not found for student." });
      }

      const currentAlloc = {
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

      const adjustDurationCounts = (current30: number, current45: number, current60: number, completed30: number, completed45: number, completed60: number, targetTotal: number) => {
        const currentTotal = current30 + current45 + current60;
        const diff = targetTotal - currentTotal;
        if (diff >= 0) {
          return {
            sessions30: current30 + diff,
            sessions45: current45,
            sessions60: current60
          };
        } else {
          let toReduce = Math.abs(diff);
          let new30 = current30;
          let new45 = current45;
          let new60 = current60;

          const maxReduce30 = Math.max(0, new30 - completed30);
          const reduce30 = Math.min(toReduce, maxReduce30);
          new30 -= reduce30;
          toReduce -= reduce30;

          if (toReduce > 0) {
            const maxReduce45 = Math.max(0, new45 - completed45);
            const reduce45 = Math.min(toReduce, maxReduce45);
            new45 -= reduce45;
            toReduce -= reduce45;
          }

          if (toReduce > 0) {
            const maxReduce60 = Math.max(0, new60 - completed60);
            const reduce60 = Math.min(toReduce, maxReduce60);
            new60 -= reduce60;
            toReduce -= reduce60;
          }

          return {
            sessions30: new30,
            sessions45: new45,
            sessions60: new60
          };
        }
      };

      const otoRes = adjustDurationCounts(
        currentAlloc.oneToOne?.sessions30 || 0,
        currentAlloc.oneToOne?.sessions45 || 0,
        currentAlloc.oneToOne?.sessions60 || 0,
        currentAlloc.oneToOne?.completed30 || 0,
        currentAlloc.oneToOne?.completed45 || 0,
        currentAlloc.oneToOne?.completed60 || 0,
        input.allocatedOneToOne
      );

      const grpRes = adjustDurationCounts(
        currentAlloc.group?.sessions30 || 0,
        currentAlloc.group?.sessions45 || 0,
        currentAlloc.group?.sessions60 || 0,
        currentAlloc.group?.completed30 || 0,
        currentAlloc.group?.completed45 || 0,
        currentAlloc.group?.completed60 || 0,
        input.allocatedGroup
      );

      await db.transaction(async (tx) => {
        await tx.update(profiles)
          .set({
            allocatedOneToOneSessions: input.allocatedOneToOne,
            allocatedGroupSessions: input.allocatedGroup,
            totalAllocatedSessions: totalAllocated,
            remainingOneToOneSessions: remainingOneToOne,
            remainingGroupSessions: remainingGroup,
            totalRemainingSessions: totalRemaining,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, input.studentId));

        await tx.update(batchEnrollments)
          .set({
            oneOnOne30Allocated: otoRes.sessions30,
            oneOnOne45Allocated: otoRes.sessions45,
            oneOnOne60Allocated: otoRes.sessions60,
            group30Allocated: grpRes.sessions30,
            group45Allocated: grpRes.sessions45,
            group60Allocated: grpRes.sessions60,
          })
          .where(eq(batchEnrollments.id, activeEnrollment.id));

        await tx.insert(sessionAllocationLogs).values({
          studentId: input.studentId,
          changedBy: ctx.user.id,
          previousOneToOne: prevOneToOne,
          newOneToOne: input.allocatedOneToOne,
          previousGroup: prevGroup,
          newGroup: input.allocatedGroup,
          reason: input.reason || null,
        });

        await updateStudentSessionBalances(tx, input.studentId);
      });

      await updateStudentSessionBalances(db, input.studentId);

      return db.query.profiles.findFirst({
        where: eq(profiles.userId, input.studentId),
      });
    }),

  getSessionAllocationLogs: adminQuery
    .input(z.object({ studentId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.query.sessionAllocationLogs.findMany({
        where: eq(sessionAllocationLogs.studentId, input.studentId),
        orderBy: desc(sessionAllocationLogs.changedAt),
        with: {
          changedByUser: true,
        },
      });
    }),
});
