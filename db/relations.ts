import { relations } from "drizzle-orm";
import {
  users,
  profiles,
  modules,
  batches,
  batchEnrollments,
  messages,
  classes,
  attendance,
  flexibilityRequests,
  payments,
  teacherSalaries,
  feedback,
  notifications,
  violations,
  learningMaterials,
  oneToOneSessions,
  batchFeeAuditLogs,
  privateMessages,
  announcements,
  announcementDismissals,
  classBatches,
  classJoinRequests,
  batchAuditLogs,
  privateMessageAuditLogs,
  attendanceAlerts,
  teacherSalaryConfigs,
  teacherSalaryConfigAuditLogs,
  sessionAllocationLogs,
  oneToOneRescheduleRequests,
  learningNotes,
  learningVideos,
  assignments,
  assignmentSubmissions,
  communityLessons,
  communityPosts,
  communityComments,
  communityPostReactions,
  communityCareers,
  communitySavedCareers,
  communitySuccessStories,
  communityLessonViews,
  communityActiveUsers,
} from "./schema";

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  sentMessages: many(messages),
  enrollments: many(batchEnrollments),
  attendance: many(attendance),
  feedbackGiven: many(feedback, { relationName: "studentFeedback" }),
  feedbackReceived: many(feedback, { relationName: "teacherFeedback" }),
  notifications: many(notifications),
  violations: many(violations),
  salaries: many(teacherSalaries),
  payments: many(payments),
  feeAuditLogs: many(batchFeeAuditLogs),
  sentPrivateMessages: many(privateMessages, { relationName: "sentPrivateMessages" }),
  receivedPrivateMessages: many(privateMessages, { relationName: "receivedPrivateMessages" }),
  joinRequests: many(classJoinRequests),
  auditLogs: many(batchAuditLogs),
  pmAuditLogs: many(privateMessageAuditLogs),
  attendanceAlerts: many(attendanceAlerts),
  salaryConfig: one(teacherSalaryConfigs, {
    fields: [users.id],
    references: [teacherSalaryConfigs.teacherId],
  }),
  salaryConfigAuditLogs: many(teacherSalaryConfigAuditLogs),
  createdOneToOneSessions: many(oneToOneSessions, { relationName: "oneToOneCreator" }),
  sessionAllocationLogs: many(sessionAllocationLogs, { relationName: "studentAllocationLogs" }),
  changedSessionAllocationLogs: many(sessionAllocationLogs, { relationName: "adminAllocationLogs" }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
  batches: many(batches),
  teacher: one(users, {
    fields: [modules.teacherId],
    references: [users.id],
  }),
}));

export const batchesRelations = relations(batches, ({ one, many }) => ({
  module: one(modules, {
    fields: [batches.moduleId],
    references: [modules.id],
  }),
  teacher: one(users, {
    fields: [batches.teacherId],
    references: [users.id],
  }),
  enrollments: many(batchEnrollments),
  messages: many(messages),
  classes: many(classes),
  materials: many(learningMaterials),
  payments: many(payments),
  feeAuditLogs: many(batchFeeAuditLogs),
  classBatches: many(classBatches),
  auditLogs: many(batchAuditLogs),
  attendanceAlerts: many(attendanceAlerts),
  feedback: many(feedback),
}));

export const batchEnrollmentsRelations = relations(batchEnrollments, ({ one }) => ({
  batch: one(batches, {
    fields: [batchEnrollments.batchId],
    references: [batches.id],
  }),
  student: one(users, {
    fields: [batchEnrollments.studentId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  batch: one(batches, {
    fields: [messages.batchId],
    references: [batches.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  batch: one(batches, {
    fields: [classes.batchId],
    references: [batches.id],
  }),
  teacher: one(users, {
    fields: [classes.teacherId],
    references: [users.id],
  }),
  attendance: many(attendance),
  oneToOneSessions: many(oneToOneSessions),
  classBatches: many(classBatches),
  joinRequests: many(classJoinRequests),
}));

export const oneToOneSessionsRelations = relations(oneToOneSessions, ({ one, many }) => ({
  class: one(classes, {
    fields: [oneToOneSessions.classId],
    references: [classes.id],
  }),
  teacher: one(users, {
    fields: [oneToOneSessions.teacherId],
    references: [users.id],
  }),
  student: one(users, {
    fields: [oneToOneSessions.studentId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [oneToOneSessions.createdBy],
    references: [users.id],
    relationName: "oneToOneCreator",
  }),
  rescheduleRequests: many(oneToOneRescheduleRequests),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  class: one(classes, {
    fields: [attendance.classId],
    references: [classes.id],
  }),
  student: one(users, {
    fields: [attendance.studentId],
    references: [users.id],
  }),
}));

export const flexibilityRequestsRelations = relations(flexibilityRequests, ({ one }) => ({
  student: one(users, {
    fields: [flexibilityRequests.studentId],
    references: [users.id],
  }),
  fromBatch: one(batches, {
    fields: [flexibilityRequests.fromBatchId],
    references: [batches.id],
  }),
  toBatch: one(batches, {
    fields: [flexibilityRequests.toBatchId],
    references: [batches.id],
  }),
  resolver: one(users, {
    fields: [flexibilityRequests.resolvedBy],
    references: [users.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  student: one(users, {
    fields: [payments.studentId],
    references: [users.id],
  }),
  batch: one(batches, {
    fields: [payments.batchId],
    references: [batches.id],
  }),
}));

export const teacherSalariesRelations = relations(teacherSalaries, ({ one }) => ({
  teacher: one(users, {
    fields: [teacherSalaries.teacherId],
    references: [users.id],
  }),
}));

export const teacherSalaryConfigsRelations = relations(teacherSalaryConfigs, ({ one }) => ({
  teacher: one(users, {
    fields: [teacherSalaryConfigs.teacherId],
    references: [users.id],
  }),
}));

export const teacherSalaryConfigAuditLogsRelations = relations(teacherSalaryConfigAuditLogs, ({ one }) => ({
  teacher: one(users, {
    fields: [teacherSalaryConfigAuditLogs.teacherId],
    references: [users.id],
  }),
  changedByUser: one(users, {
    fields: [teacherSalaryConfigAuditLogs.changedBy],
    references: [users.id],
  }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  student: one(users, {
    fields: [feedback.studentId],
    references: [users.id],
  }),
  teacher: one(users, {
    fields: [feedback.teacherId],
    references: [users.id],
  }),
  class: one(classes, {
    fields: [feedback.classId],
    references: [classes.id],
  }),
  batch: one(batches, {
    fields: [feedback.batchId],
    references: [batches.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const violationsRelations = relations(violations, ({ one }) => ({
  user: one(users, {
    fields: [violations.userId],
    references: [users.id],
  }),
  reporter: one(users, {
    fields: [violations.reportedBy],
    references: [users.id],
  }),
}));

export const learningMaterialsRelations = relations(learningMaterials, ({ one }) => ({
  batch: one(batches, {
    fields: [learningMaterials.batchId],
    references: [batches.id],
  }),
  creator: one(users, {
    fields: [learningMaterials.createdBy],
    references: [users.id],
  }),
}));

export const batchFeeAuditLogsRelations = relations(batchFeeAuditLogs, ({ one }) => ({
  batch: one(batches, {
    fields: [batchFeeAuditLogs.batchId],
    references: [batches.id],
  }),
  admin: one(users, {
    fields: [batchFeeAuditLogs.adminId],
    references: [users.id],
  }),
}));

export const batchAuditLogsRelations = relations(batchAuditLogs, ({ one }) => ({
  batch: one(batches, {
    fields: [batchAuditLogs.batchId],
    references: [batches.id],
  }),
  changedByUser: one(users, {
    fields: [batchAuditLogs.changedBy],
    references: [users.id],
  }),
}));
export const privateMessagesRelations = relations(privateMessages, ({ one }) => ({
  sender: one(users, {
    fields: [privateMessages.senderId],
    references: [users.id],
    relationName: "sentPrivateMessages",
  }),
  receiver: one(users, {
    fields: [privateMessages.receiverId],
    references: [users.id],
    relationName: "receivedPrivateMessages",
  }),
}));

export const announcementsRelations = relations(announcements, ({ many }) => ({
  dismissals: many(announcementDismissals),
}));

export const announcementDismissalsRelations = relations(announcementDismissals, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementDismissals.announcementId],
    references: [announcements.id],
  }),
  user: one(users, {
    fields: [announcementDismissals.userId],
    references: [users.id],
  }),
}));

export const classBatchesRelations = relations(classBatches, ({ one }) => ({
  class: one(classes, {
    fields: [classBatches.classId],
    references: [classes.id],
  }),
  batch: one(batches, {
    fields: [classBatches.batchId],
    references: [batches.id],
  }),
}));

export const classJoinRequestsRelations = relations(classJoinRequests, ({ one }) => ({
  class: one(classes, {
    fields: [classJoinRequests.classId],
    references: [classes.id],
  }),
  student: one(users, {
    fields: [classJoinRequests.studentId],
    references: [users.id],
  }),
}));

export const privateMessageAuditLogsRelations = relations(privateMessageAuditLogs, ({ one }) => ({
  admin: one(users, {
    fields: [privateMessageAuditLogs.adminId],
    references: [users.id],
  }),
}));

export const attendanceAlertsRelations = relations(attendanceAlerts, ({ one }) => ({
  student: one(users, {
    fields: [attendanceAlerts.studentId],
    references: [users.id],
  }),
  batch: one(batches, {
    fields: [attendanceAlerts.batchId],
    references: [batches.id],
  }),
}));

export const sessionAllocationLogsRelations = relations(sessionAllocationLogs, ({ one }) => ({
  student: one(users, {
    fields: [sessionAllocationLogs.studentId],
    references: [users.id],
    relationName: "studentAllocationLogs",
  }),
  changedByUser: one(users, {
    fields: [sessionAllocationLogs.changedBy],
    references: [users.id],
    relationName: "adminAllocationLogs",
  }),
}));

export const oneToOneRescheduleRequestsRelations = relations(oneToOneRescheduleRequests, ({ one }) => ({
  session: one(oneToOneSessions, {
    fields: [oneToOneRescheduleRequests.sessionId],
    references: [oneToOneSessions.id],
  }),
  requestedByUser: one(users, {
    fields: [oneToOneRescheduleRequests.requestedBy],
    references: [users.id],
  }),
  resolvedByUser: one(users, {
    fields: [oneToOneRescheduleRequests.resolvedBy],
    references: [users.id],
  }),
}));

export const learningNotesRelations = relations(learningNotes, ({ one }) => ({
  module: one(modules, {
    fields: [learningNotes.moduleId],
    references: [modules.id],
  }),
  batch: one(batches, {
    fields: [learningNotes.batchId],
    references: [batches.id],
  }),
  uploader: one(users, {
    fields: [learningNotes.uploadedBy],
    references: [users.id],
  }),
}));

export const learningVideosRelations = relations(learningVideos, ({ one }) => ({
  student: one(users, {
    fields: [learningVideos.studentId],
    references: [users.id],
  }),
  batch: one(batches, {
    fields: [learningVideos.batchId],
    references: [batches.id],
  }),
  teacher: one(users, {
    fields: [learningVideos.teacherId],
    references: [users.id],
  }),
  module: one(modules, {
    fields: [learningVideos.moduleId],
    references: [modules.id],
  }),
  uploader: one(users, {
    fields: [learningVideos.uploadedBy],
    references: [users.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  module: one(modules, {
    fields: [assignments.moduleId],
    references: [modules.id],
  }),
  batch: one(batches, {
    fields: [assignments.batchId],
    references: [batches.id],
  }),
  creator: one(users, {
    fields: [assignments.createdBy],
    references: [users.id],
  }),
  submissions: many(assignmentSubmissions),
}));

export const assignmentSubmissionsRelations = relations(assignmentSubmissions, ({ one }) => ({
  student: one(users, {
    fields: [assignmentSubmissions.studentId],
    references: [users.id],
  }),
  assignment: one(assignments, {
    fields: [assignmentSubmissions.assignmentId],
    references: [assignments.id],
  }),
}));

export const communityLessonsRelations = relations(communityLessons, ({ one, many }) => ({
  publisher: one(users, {
    fields: [communityLessons.publishedBy],
    references: [users.id],
  }),
  views: many(communityLessonViews),
}));

export const communityPostsRelations = relations(communityPosts, ({ one, many }) => ({
  author: one(users, {
    fields: [communityPosts.authorId],
    references: [users.id],
  }),
  comments: many(communityComments),
  reactions: many(communityPostReactions),
}));

export const communityCommentsRelations = relations(communityComments, ({ one }) => ({
  post: one(communityPosts, {
    fields: [communityComments.postId],
    references: [communityPosts.id],
  }),
  author: one(users, {
    fields: [communityComments.authorId],
    references: [users.id],
  }),
}));

export const communityPostReactionsRelations = relations(communityPostReactions, ({ one }) => ({
  post: one(communityPosts, {
    fields: [communityPostReactions.postId],
    references: [communityPosts.id],
  }),
  user: one(users, {
    fields: [communityPostReactions.userId],
    references: [users.id],
  }),
}));

export const communityCareersRelations = relations(communityCareers, ({ one, many }) => ({
  publisher: one(users, {
    fields: [communityCareers.publishedBy],
    references: [users.id],
  }),
  savedBy: many(communitySavedCareers),
}));

export const communitySavedCareersRelations = relations(communitySavedCareers, ({ one }) => ({
  user: one(users, {
    fields: [communitySavedCareers.userId],
    references: [users.id],
  }),
  career: one(communityCareers, {
    fields: [communitySavedCareers.careerId],
    references: [communityCareers.id],
  }),
}));

export const communitySuccessStoriesRelations = relations(communitySuccessStories, ({ one }) => ({
  publisher: one(users, {
    fields: [communitySuccessStories.publishedBy],
    references: [users.id],
  }),
}));

export const communityLessonViewsRelations = relations(communityLessonViews, ({ one }) => ({
  lesson: one(communityLessons, {
    fields: [communityLessonViews.lessonId],
    references: [communityLessons.id],
  }),
  user: one(users, {
    fields: [communityLessonViews.userId],
    references: [users.id],
  }),
}));

export const communityActiveUsersRelations = relations(communityActiveUsers, ({ one }) => ({
  user: one(users, {
    fields: [communityActiveUsers.userId],
    references: [users.id],
  }),
}));




