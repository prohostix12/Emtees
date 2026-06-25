import { profiles, attendance, classes, oneToOneSessions, users, batchEnrollments } from "@db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendNotification, sendBulkNotification, getAdminUserIds } from "./notificationEngine";

export async function updateStudentSessionBalances(db: any, studentId: number) {
  // Get student's profile
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, studentId),
  });
  if (!profile) return;

  // Get student's active enrollment
  const enrollment = await db.query.batchEnrollments.findFirst({
    where: and(
      eq(batchEnrollments.studentId, studentId),
      eq(batchEnrollments.status, "active")
    )
  });
  if (!enrollment) return;

  // Count attended 1-to-1 sessions grouped by sessionLength
  const completedO2OSessions = await db
    .select({
      sessionLength: oneToOneSessions.sessionLength,
      count: sql<number>`count(*)`
    })
    .from(oneToOneSessions)
    .where(
      and(
        eq(oneToOneSessions.studentId, studentId),
        eq(oneToOneSessions.status, "completed")
      )
    )
    .groupBy(oneToOneSessions.sessionLength);

  let completedO2O30 = 0;
  let completedO2O45 = 0;
  let completedO2O60 = 0;

  for (const item of completedO2OSessions) {
    if (item.sessionLength === 30) completedO2O30 = Number(item.count || 0);
    else if (item.sessionLength === 45) completedO2O45 = Number(item.count || 0);
    else if (item.sessionLength === 60) completedO2O60 = Number(item.count || 0);
  }

  // Count attended group classes grouped by duration
  const completedGroupClasses = await db
    .select({
      duration: classes.duration,
      count: sql<number>`count(*)`
    })
    .from(attendance)
    .innerJoin(classes, eq(attendance.classId, classes.id))
    .where(
      and(
        eq(attendance.studentId, studentId),
        eq(attendance.status, "present"),
        eq(classes.classType, "group")
      )
    )
    .groupBy(classes.duration);

  let completedGroup30 = 0;
  let completedGroup45 = 0;
  let completedGroup60 = 0;

  for (const item of completedGroupClasses) {
    if (item.duration === 30) completedGroup30 = Number(item.count || 0);
    else if (item.duration === 45) completedGroup45 = Number(item.count || 0);
    else if (item.duration === 60) completedGroup60 = Number(item.count || 0);
  }

  const sessionsO2O30 = enrollment.oneOnOne30Allocated || 0;
  const sessionsO2O45 = enrollment.oneOnOne45Allocated || 0;
  const sessionsO2O60 = enrollment.oneOnOne60Allocated || 0;

  const sessionsGroup30 = enrollment.group30Allocated || 0;
  const sessionsGroup45 = enrollment.group45Allocated || 0;
  const sessionsGroup60 = enrollment.group60Allocated || 0;

  const remainingO2O30 = Math.max(0, sessionsO2O30 - completedO2O30);
  const remainingO2O45 = Math.max(0, sessionsO2O45 - completedO2O45);
  const remainingO2O60 = Math.max(0, sessionsO2O60 - completedO2O60);

  const remainingGroup30 = Math.max(0, sessionsGroup30 - completedGroup30);
  const remainingGroup45 = Math.max(0, sessionsGroup45 - completedGroup45);
  const remainingGroup60 = Math.max(0, sessionsGroup60 - completedGroup60);

  // Update enrollment record
  await db.update(batchEnrollments)
    .set({
      oneOnOne30Used: completedO2O30,
      oneOnOne45Used: completedO2O45,
      oneOnOne60Used: completedO2O60,
      group30Used: completedGroup30,
      group45Used: completedGroup45,
      group60Used: completedGroup60,
    })
    .where(eq(batchEnrollments.id, enrollment.id));

  // Sync totals to profiles table
  const totalAllocatedO2O = sessionsO2O30 + sessionsO2O45 + sessionsO2O60;
  const totalAllocatedGroup = sessionsGroup30 + sessionsGroup45 + sessionsGroup60;
  const totalAllocated = totalAllocatedO2O + totalAllocatedGroup;

  const totalAttendedO2O = completedO2O30 + completedO2O45 + completedO2O60;
  const totalAttendedGroup = completedGroup30 + completedGroup45 + completedGroup60;
  const totalAttended = totalAttendedO2O + totalAttendedGroup;

  const totalRemainingO2O = remainingO2O30 + remainingO2O45 + remainingO2O60;
  const totalRemainingGroup = remainingGroup30 + remainingGroup45 + remainingGroup60;
  const totalRemaining = totalRemainingO2O + totalRemainingGroup;

  // Predefined student threshold
  const STUDENT_THRESHOLD = 3;

  // Fetch old counts to prevent duplicate notifications
  const oldRemainingOneToOne = profile.remainingOneToOneSessions ?? 0;
  const oldRemainingGroup = profile.remainingGroupSessions ?? 0;
  const oldTotalRemaining = profile.totalRemainingSessions ?? 0;

  await db.update(profiles)
    .set({
      allocatedOneToOneSessions: totalAllocatedO2O,
      allocatedGroupSessions: totalAllocatedGroup,
      totalAllocatedSessions: totalAllocated,
      attendedOneToOneSessions: totalAttendedO2O,
      attendedGroupSessions: totalAttendedGroup,
      totalAttendedSessions: totalAttended,
      remainingOneToOneSessions: totalRemainingO2O,
      remainingGroupSessions: totalRemainingGroup,
      totalRemainingSessions: totalRemaining,
    })
    .where(eq(profiles.userId, studentId));

  // 1-to-1 session balance low or exhausted notifications
  if (totalRemainingO2O === STUDENT_THRESHOLD && oldRemainingOneToOne > STUDENT_THRESHOLD) {
    await sendNotification(
      studentId,
      "Low One-to-One Session Balance",
      `You have only ${totalRemainingO2O} One-to-One sessions remaining.`,
      "session_threshold"
    );
  } else if (totalRemainingO2O === 0 && oldRemainingOneToOne > 0) {
    await sendNotification(
      studentId,
      "One-to-One Sessions Exhausted",
      `Your One-to-One session balance has been fully exhausted.`,
      "session_exhausted"
    );
  }

  // Group session balance low or exhausted notifications
  if (totalRemainingGroup === STUDENT_THRESHOLD && oldRemainingGroup > STUDENT_THRESHOLD) {
    await sendNotification(
      studentId,
      "Low Group Session Balance",
      `You have only ${totalRemainingGroup} Group sessions remaining.`,
      "session_threshold"
    );
  } else if (totalRemainingGroup === 0 && oldRemainingGroup > 0) {
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
