import { profiles, attendance, classes, oneToOneSessions, users } from "@db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendNotification, sendBulkNotification, getAdminUserIds } from "./notificationEngine";

export async function updateStudentSessionBalances(db: any, studentId: number) {
  // Get student's profile
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, studentId),
  });
  if (!profile) return;

  // Count attended group sessions
  const attendedGroupClasses = await db
    .select({ count: sql<number>`count(*)` })
    .from(attendance)
    .innerJoin(classes, eq(attendance.classId, classes.id))
    .where(
      and(
        eq(attendance.studentId, studentId),
        eq(attendance.status, "present"),
        eq(classes.classType, "group")
      )
    );
  const attendedGroupCount = Number(attendedGroupClasses[0]?.count || 0);

  // Count attended 1-to-1 sessions
  const attendedOneToOne = await db
    .select({ count: sql<number>`count(*)` })
    .from(oneToOneSessions)
    .where(
      and(
        eq(oneToOneSessions.studentId, studentId),
        eq(oneToOneSessions.status, "completed"),
        eq(oneToOneSessions.studentAttendance, "present")
      )
    );
  const attendedOneToOneCount = Number(attendedOneToOne[0]?.count || 0);

  const allocatedOneToOne = profile.allocatedOneToOneSessions || 0;
  const allocatedGroup = profile.allocatedGroupSessions || 0;

  const remainingOneToOne = Math.max(0, allocatedOneToOne - attendedOneToOneCount);
  const remainingGroup = Math.max(0, allocatedGroup - attendedGroupCount);
  const totalAttended = attendedOneToOneCount + attendedGroupCount;
  const totalRemaining = remainingOneToOne + remainingGroup;

  // Fetch old counts to prevent duplicate notifications
  const oldRemainingOneToOne = profile.remainingOneToOneSessions ?? 0;
  const oldRemainingGroup = profile.remainingGroupSessions ?? 0;
  const oldTotalRemaining = profile.totalRemainingSessions ?? 0;

  await db.update(profiles)
    .set({
      attendedOneToOneSessions: attendedOneToOneCount,
      attendedGroupSessions: attendedGroupCount,
      totalAttendedSessions: totalAttended,
      remainingOneToOneSessions: remainingOneToOne,
      remainingGroupSessions: remainingGroup,
      totalRemainingSessions: totalRemaining,
    })
    .where(eq(profiles.userId, studentId));

  // Predefined student threshold
  const STUDENT_THRESHOLD = 3;

  // 1-to-1 session balance low or exhausted notifications
  if (remainingOneToOne === STUDENT_THRESHOLD && oldRemainingOneToOne > STUDENT_THRESHOLD) {
    await sendNotification(
      studentId,
      "Low One-to-One Session Balance",
      `You have only ${remainingOneToOne} One-to-One sessions remaining.`,
      "session_threshold"
    );
  } else if (remainingOneToOne === 0 && oldRemainingOneToOne > 0) {
    await sendNotification(
      studentId,
      "One-to-One Sessions Exhausted",
      `Your One-to-One session balance has been fully exhausted.`,
      "session_exhausted"
    );
  }

  // Group session balance low or exhausted notifications
  if (remainingGroup === STUDENT_THRESHOLD && oldRemainingGroup > STUDENT_THRESHOLD) {
    await sendNotification(
      studentId,
      "Low Group Session Balance",
      `You have only ${remainingGroup} Group sessions remaining.`,
      "session_threshold"
    );
  } else if (remainingGroup === 0 && oldRemainingGroup > 0) {
    await sendNotification(
      studentId,
      "Group Sessions Exhausted",
      `Your Group session balance has been fully exhausted.`,
      "session_exhausted"
    );
  }

  // Admin notification for total remaining
  const adminIds = await getAdminUserIds();
  if (adminIds.length > 0) {
    const student = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    const studentName = student?.name || "Student";

    if (totalRemaining === STUDENT_THRESHOLD && oldTotalRemaining > STUDENT_THRESHOLD) {
      await sendBulkNotification(
        adminIds,
        `Low Session Balance Alert: ${studentName}`,
        `Student ${studentName} has only ${totalRemaining} total sessions remaining.`,
        "session_threshold_admin",
        { studentId }
      );
    } else if (totalRemaining === 0 && oldTotalRemaining > 0) {
      await sendBulkNotification(
        adminIds,
        `Session Balance Exhausted: ${studentName}`,
        `Student ${studentName} has exhausted all allocated sessions.`,
        "session_exhausted_admin",
        { studentId }
      );
    }
  }
}
