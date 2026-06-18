import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  json,
  decimal,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Enums
export const roleEnum = pgEnum("role", ["super_admin", "admin", "academic_head", "teacher", "student"]);
export const statusEnum = pgEnum("status", ["active", "inactive", "suspended", "on_hold"]);
export const paymentStatusEnum = pgEnum("payment_status", ["paid", "partial", "unpaid", "overdue"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "voice", "image", "video", "pdf"]);
export const classTypeEnum = pgEnum("class_type", ["group", "one_to_one"]);
export const classStatusEnum = pgEnum("class_status", ["scheduled", "ongoing", "completed", "cancelled"]);
export const sessionStatusEnum = pgEnum("session_status", ["scheduled", "ongoing", "completed", "cancelled", "rescheduled", "reschedule_request_pending"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent", "late"]);
export const requestTypeEnum = pgEnum("request_type", ["hold", "rejoin", "batch_change", "batch_removal"]);
export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "rejected", "cancelled"]);
export const materialTypeEnum = pgEnum("material_type", ["text", "voice", "image", "video", "pdf"]);

// Users table
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    unionId: varchar("union_id", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 100 }).unique(),
    password: varchar("password", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 20 }),
    countryCode: varchar("country_code", { length: 10 }),
    phoneNumber: varchar("phone_number", { length: 20 }),
    role: roleEnum("role").notNull().default("student"),
    status: statusEnum("status").notNull().default("active"),
    avatar: varchar("avatar", { length: 500 }),
    deviceToken: varchar("device_token", { length: 500 }),
    lastLoginAt: timestamp("last_login_at"),
    notificationsPausedUntil: timestamp("notifications_paused_until"),
    canViewSalaryReports: boolean("can_view_salary_reports").default(false).notNull(),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    usernameIdx: uniqueIndex("username_idx").on(table.username),
    phoneIdx: index("phone_idx").on(table.phone),
    roleIdx: index("role_idx").on(table.role),
    unionIdIdx: uniqueIndex("union_id_idx").on(table.unionId),
    countryPhoneIdx: uniqueIndex("country_phone_idx").on(table.countryCode, table.phoneNumber),
  })
);

// Profiles table
export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  course: varchar("course", { length: 255 }),
  batch: varchar("batch", { length: 255 }),
  batchTime: varchar("batch_time", { length: 50 }),
  feesTotal: decimal("fees_total", { precision: 10, scale: 2 }).default("0"),
  feesPaid: decimal("fees_paid", { precision: 10, scale: 2 }).default("0"),
  feesBalance: decimal("fees_balance", { precision: 10, scale: 2 }).default("0"),
  paymentStatus: paymentStatusEnum("payment_status").default("unpaid"),
  minInitialPayment: decimal("min_initial_payment", { precision: 10, scale: 2 }),
  paymentDueDate: timestamp("payment_due_date"),
  gracePeriodDays: integer("grace_period_days").default(7).notNull(),
  admissionDate: timestamp("admission_date").defaultNow(),
  completionDate: timestamp("completion_date"),
  activityTimeline: json("activity_timeline"),
  allocatedOneToOneSessions: integer("allocated_one_to_one_sessions").default(0).notNull(),
  allocatedGroupSessions: integer("allocated_group_sessions").default(0).notNull(),
  totalAllocatedSessions: integer("total_allocated_sessions").default(0).notNull(),
  attendedOneToOneSessions: integer("attended_one_to_one_sessions").default(0).notNull(),
  attendedGroupSessions: integer("attended_group_sessions").default(0).notNull(),
  totalAttendedSessions: integer("total_attended_sessions").default(0).notNull(),
  remainingOneToOneSessions: integer("remaining_one_to_one_sessions").default(0).notNull(),
  remainingGroupSessions: integer("remaining_group_sessions").default(0).notNull(),
  totalRemainingSessions: integer("total_remaining_sessions").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Modules (Course Groups)
export const modules = pgTable("modules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  learningObjectives: text("learning_objectives"),
  topics: text("topics"),
  teacherId: bigint("teacher_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  duration: varchar("duration", { length: 255 }),
  maxStudents: integer("max_students").default(50),
  minStudents: integer("min_students").default(5),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Batches (Sub Groups)
export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  moduleId: bigint("module_id", { mode: "number" })
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  timeSlot: varchar("time_slot", { length: 50 }),
  teacherId: bigint("teacher_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  maxStudents: integer("max_students").default(30),
  status: varchar("status", { length: 20 }).default("active"),
  isCommunityGroup: boolean("is_community_group").default(false),
  startDate: timestamp("start_date"),
  duration: varchar("duration", { length: 255 }),
  courseFee: decimal("course_fee", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Batch Fee Audit Logs
export const batchFeeAuditLogs = pgTable("batch_fee_audit_logs", {
  id: serial("id").primaryKey(),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  previousFee: decimal("previous_fee", { precision: 10, scale: 2 }).notNull(),
  updatedFee: decimal("updated_fee", { precision: 10, scale: 2 }).notNull(),
  adminId: bigint("admin_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

// Batch Audit Logs
export const batchAuditLogs = pgTable("batch_audit_logs", {
  id: serial("id").primaryKey(),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  fieldName: varchar("field_name", { length: 255 }).notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  changedBy: bigint("changed_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

// Batch Enrollments
export const batchEnrollments = pgTable(
  "batch_enrollments",
  {
    id: serial("id").primaryKey(),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
    status: varchar("status", { length: 20 }).default("active"),
    paymentType: varchar("payment_type", { length: 50 }).default("FULL_PAYMENT").notNull(),
  },
  (table) => ({
    uniqueEnrollment: uniqueIndex("unique_enrollment_idx").on(table.batchId, table.studentId),
  })
);

// Messages (Chat)
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    senderId: bigint("sender_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: messageTypeEnum("type").notNull().default("text"),
    content: text("content").notNull(),
    mediaUrl: varchar("media_url", { length: 500 }),
    replyToId: bigint("reply_to_id", { mode: "number" }),
    reactions: json("reactions"),
    isAnnouncement: boolean("is_announcement").default(false),
    deletedAt: timestamp("deleted_at"),
    deletedForUsers: json("deleted_for_users"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    batchIdIdx: index("msg_batch_idx").on(table.batchId),
    senderIdIdx: index("msg_sender_idx").on(table.senderId),
    createdAtIdx: index("msg_created_idx").on(table.createdAt),
  })
);

// Classes (Live Sessions)
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  classType: classTypeEnum("class_type").notNull().default("group"),
  status: classStatusEnum("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  duration: integer("duration").default(0),
  meetingUrl: varchar("meeting_url", { length: 500 }),
  meetingRoomId: varchar("meeting_room_id", { length: 255 }),
  recordingUrl: varchar("recording_url", { length: 500 }),
  recordingDeletedAt: timestamp("recording_deleted_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  reminder1DaySentAt: timestamp("reminder_1day_sent_at"),
  reminder1HourSentAt: timestamp("reminder_1hour_sent_at"),
  reminder10MinSentAt: timestamp("reminder_10min_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Class Batches Join Table (Multi-Batch Support)
export const classBatches = pgTable(
  "class_batches",
  {
    id: serial("id").primaryKey(),
    classId: bigint("class_id", { mode: "number" })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueClassBatch: uniqueIndex("unique_class_batch_idx").on(table.classId, table.batchId),
  })
);

// One-to-One Class Sessions
export const oneToOneSessions = pgTable("one_to_one_sessions", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  classId: bigint("class_id", { mode: "number" }).references(() => classes.id),
  title: varchar("title", { length: 255 }).default("1-to-1 Session").notNull(),
  remarks: text("remarks"),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  sessionLength: integer("session_length").notNull().default(30),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: sessionStatusEnum("session_status").notNull().default("scheduled"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  actualDuration: integer("actual_duration"),
  teacherAttendance: varchar("teacher_attendance", { length: 50 }),
  studentAttendance: varchar("student_attendance", { length: 50 }),
  meetingRoomId: varchar("meeting_room_id", { length: 255 }),
  meetingUrl: varchar("meeting_url", { length: 500 }),
  reminder1DaySentAt: timestamp("reminder_1day_sent_at"),
  reminder1HourSentAt: timestamp("reminder_1hour_sent_at"),
  reminder10MinSentAt: timestamp("reminder_10min_sent_at"),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  completedAt: timestamp("completed_at"),
  recordingUrl: varchar("recording_url", { length: 500 }),
  recordingDeletedAt: timestamp("recording_deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Attendance
export const attendance = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    classId: bigint("class_id", { mode: "number" })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatCount: integer("chat_count").default(0),
    status: attendanceStatusEnum("attendance_status").notNull().default("absent"),
    joinedAt: timestamp("joined_at"),
    leftAt: timestamp("left_at"),
    duration: integer("duration").default(0),
    recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueAttendance: uniqueIndex("unique_attendance_idx").on(table.classId, table.studentId),
  })
);

// Flexibility Requests (Hold, Rejoin, Batch Change)
export const flexibilityRequests = pgTable("flexibility_requests", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestType: requestTypeEnum("request_type").notNull(),
  fromBatchId: bigint("from_batch_id", { mode: "number" }).references(() => batches.id),
  toBatchId: bigint("to_batch_id", { mode: "number" }).references(() => batches.id),
  reason: text("reason"),
  status: requestStatusEnum("request_status").notNull().default("pending"),
  adminNote: text("admin_note"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: bigint("resolved_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
});

// Payments
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: varchar("type", { length: 50 }).default("tuition"),
  status: paymentStatusEnum("payment_status").notNull().default("paid"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  transactionId: varchar("transaction_id", { length: 255 }),
  notes: text("notes"),
  batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id, { onDelete: "set null" }),
  installmentNumber: integer("installment_number"),
  paidDate: timestamp("paid_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Teacher Salaries
export const teacherSalaries = pgTable("teacher_salaries", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(),
  groupClassesCount: integer("group_classes_count").default(0),
  oneToOneCount: integer("one_to_one_count").default(0),
  basicSalary: decimal("basic_salary", { precision: 10, scale: 2 }).default("0"),
  groupClassRate: decimal("group_class_rate", { precision: 10, scale: 2 }).default("0"),
  oneToOneRate: decimal("one_to_one_rate", { precision: 10, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).default("pending"),
  paymentDate: timestamp("payment_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Teacher Salary Configurations
export const teacherSalaryConfigs = pgTable("teacher_salary_configs", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  basicSalary: decimal("basic_salary", { precision: 10, scale: 2 }).default("0").notNull(),
  groupClassRate: decimal("group_class_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  oneToOneRate: decimal("one_to_one_rate", { precision: 10, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Teacher Salary Config Audit Logs
export const teacherSalaryConfigAuditLogs = pgTable("teacher_salary_config_audit_logs", {
  id: serial("id").primaryKey(),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fieldName: varchar("field_name", { length: 100 }).notNull(), // 'basicSalary', 'groupClassRate', 'oneToOneRate'
  previousValue: decimal("previous_value", { precision: 10, scale: 2 }),
  newValue: decimal("new_value", { precision: 10, scale: 2 }).notNull(),
  changedBy: bigint("changed_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

// Feedback
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  classId: bigint("class_id", { mode: "number" }).references(() => classes.id),
  batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  isRead: boolean("is_read").default(false),
  data: json("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Announcements
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  audienceType: varchar("audience_type", { length: 50 }).notNull(), // 'all' | 'students' | 'teachers' | 'batch' | 'course'
  audienceId: integer("audience_id"), // holds batchId or courseId if type is 'batch' or 'course'
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Announcement Dismissals
export const announcementDismissals = pgTable("announcement_dismissals", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id")
    .notNull()
    .references(() => announcements.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
});

// Discipline / Violations
export const violations = pgTable("violations", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reportedBy: bigint("reported_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  type: varchar("type", { length: 100 }).notNull(), // Kept for backward compatibility
  description: text("description").notNull(),
  action: varchar("action", { length: 100 }), // Kept for backward compatibility
  status: varchar("status", { length: 20 }).default("active").notNull(), // 'active' | 'resolved'
  batch: varchar("batch", { length: 255 }),
  level: varchar("level", { length: 50 }).notNull().default("Warning"), // 'Warning' | 'Final Warning' | 'Suspension'
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// Learning Materials
export const learningMaterials = pgTable("learning_materials", {
  id: serial("id").primaryKey(),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: materialTypeEnum("material_type").notNull().default("text"),
  contentUrl: varchar("content_url", { length: 500 }),
  scheduledDate: timestamp("scheduled_date"),
  createdBy: bigint("created_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// OTP Codes
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: serial("id").primaryKey(),
    phone: varchar("phone", { length: 20 }).notNull(),
    code: varchar("code", { length: 10 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    used: boolean("used").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    phoneIdx: index("otp_phone_idx").on(table.phone),
  })
);

// ID Sequences for role-based unique IDs
export const idSequences = pgTable("id_sequences", {
  rolePrefix: varchar("role_prefix", { length: 10 }).primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
});

// Private Messages Table
export const privateMessages = pgTable(
  "private_messages",
  {
    id: serial("id").primaryKey(),
    senderId: bigint("sender_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: bigint("receiver_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    type: messageTypeEnum("type").notNull().default("text"),
    mediaUrl: varchar("media_url", { length: 500 }),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    senderIdx: index("pm_sender_idx").on(table.senderId),
    receiverIdx: index("pm_receiver_idx").on(table.receiverId),
    createdAtIdx: index("pm_created_idx").on(table.createdAt),
  })
);

// Private Message Audit Logs Table
export const privateMessageAuditLogs = pgTable(
  "private_message_audit_logs",
  {
    id: serial("id").primaryKey(),
    adminId: bigint("admin_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 50 }).notNull(), // 'access' | 'send' | 'edit' | 'delete'
    senderId: bigint("sender_id", { mode: "number" }),
    receiverId: bigint("receiver_id", { mode: "number" }),
    messageId: bigint("message_id", { mode: "number" }),
    details: text("details"),
    performedAt: timestamp("performed_at").defaultNow().notNull(),
  },
  (table) => ({
    adminIdx: index("pm_audit_admin_idx").on(table.adminId),
    performedAtIdx: index("pm_audit_time_idx").on(table.performedAt),
  })
);

export type User = typeof users.$inferSelect;
export type PrivateMessageAuditLog = typeof privateMessageAuditLogs.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type FeedbackItem = typeof feedback.$inferSelect;
export type FlexibilityRequest = typeof flexibilityRequests.$inferSelect;
export type BatchFeeAuditLog = typeof batchFeeAuditLogs.$inferSelect;
export type BatchAuditLog = typeof batchAuditLogs.$inferSelect;
export type PrivateMessage = typeof privateMessages.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;
export type AnnouncementDismissal = typeof announcementDismissals.$inferSelect;
export type InsertAnnouncementDismissal = typeof announcementDismissals.$inferInsert;
export type ClassBatch = typeof classBatches.$inferSelect;
export type InsertClassBatch = typeof classBatches.$inferInsert;

// Class Join Requests (Lobby approval)
export const classJoinRequests = pgTable(
  "class_join_requests",
  {
    id: serial("id").primaryKey(),
    classId: bigint("class_id", { mode: "number" })
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending', 'approved', 'declined'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueClassStudent: uniqueIndex("unique_class_student_join_idx").on(table.classId, table.studentId),
  })
);

export type ClassJoinRequest = typeof classJoinRequests.$inferSelect;
export type InsertClassJoinRequest = typeof classJoinRequests.$inferInsert;

// Attendance Alerts Table
export const attendanceAlerts = pgTable(
  "attendance_alerts",
  {
    id: serial("id").primaryKey(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    consecutiveAbsences: integer("consecutive_absences").notNull().default(7),
    lastAttendanceDate: timestamp("last_attendance_date"),
    status: varchar("status", { length: 50 }).notNull().default("active"), // 'active' | 'resolved'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => ({
    studentIdx: index("att_alert_student_idx").on(table.studentId),
    batchIdx: index("att_alert_batch_idx").on(table.batchId),
  })
);

export type AttendanceAlert = typeof attendanceAlerts.$inferSelect;
export type InsertAttendanceAlert = typeof attendanceAlerts.$inferInsert;

export type TeacherSalary = typeof teacherSalaries.$inferSelect;
export type TeacherSalaryConfig = typeof teacherSalaryConfigs.$inferSelect;
export type TeacherSalaryConfigAuditLog = typeof teacherSalaryConfigAuditLogs.$inferSelect;

// Session Allocation Logs Table
export const sessionAllocationLogs = pgTable("session_allocation_logs", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  changedBy: bigint("changed_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  previousOneToOne: integer("previous_one_to_one").notNull(),
  newOneToOne: integer("new_one_to_one").notNull(),
  previousGroup: integer("previous_group").notNull(),
  newGroup: integer("new_group").notNull(),
  reason: text("reason"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export type SessionAllocationLog = typeof sessionAllocationLogs.$inferSelect;
export type InsertSessionAllocationLog = typeof sessionAllocationLogs.$inferInsert;

// One-to-One Reschedule Requests Table
export const oneToOneRescheduleRequests = pgTable("one_to_one_reschedule_requests", {
  id: serial("id").primaryKey(),
  sessionId: bigint("session_id", { mode: "number" })
    .notNull()
    .references(() => oneToOneSessions.id, { onDelete: "cascade" }),
  previousScheduledAt: timestamp("previous_scheduled_at").notNull(),
  proposedScheduledAt: timestamp("proposed_scheduled_at").notNull(),
  reason: text("reason").notNull(),
  status: requestStatusEnum("status").notNull().default("pending"),
  adminRemarks: text("admin_remarks"),
  requestedBy: bigint("requested_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: bigint("resolved_by", { mode: "number" })
    .references(() => users.id, { onDelete: "set null" }),
});

export type OneToOneRescheduleRequest = typeof oneToOneRescheduleRequests.$inferSelect;
export type InsertOneToOneRescheduleRequest = typeof oneToOneRescheduleRequests.$inferInsert;

// System Settings (key-value store for app configuration)
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// Learning Notes
export const learningNotes = pgTable("learning_notes", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  moduleId: bigint("module_id", { mode: "number" })
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  fileType: varchar("file_type", { length: 50 }).notNull(), // 'pdf', 'docx', 'ppt', 'pptx'
  uploadedBy: bigint("uploaded_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(), // contains the base64 or file URL
  uploadDate: timestamp("upload_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Learning Videos
export const learningVideos = pgTable("learning_videos", {
  id: serial("id").primaryKey(),
  sessionType: varchar("session_type", { length: 20 }).notNull(), // 'one_to_one' | 'group'
  studentId: bigint("student_id", { mode: "number" })
    .references(() => users.id, { onDelete: "cascade" }), // nullable for group
  batchId: bigint("batch_id", { mode: "number" })
    .references(() => batches.id, { onDelete: "cascade" }), // nullable for 1-to-1
  teacherId: bigint("teacher_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  moduleId: bigint("module_id", { mode: "number" })
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  sessionDate: timestamp("session_date").notNull(),
  duration: integer("duration").notNull(), // duration in minutes
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  uploadedBy: bigint("uploaded_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Assignments
export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  moduleId: bigint("module_id", { mode: "number" })
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  batchId: bigint("batch_id", { mode: "number" })
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  dueDate: timestamp("due_date").notNull(),
  attachmentUrl: text("attachment_url"),
  attachmentName: varchar("attachment_name", { length: 255 }),
  createdBy: bigint("created_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Assignment Submissions
export const assignmentSubmissions = pgTable("assignment_submissions", {
  id: serial("id").primaryKey(),
  studentId: bigint("student_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  assignmentId: bigint("assignment_id", { mode: "number" })
    .notNull()
    .references(() => assignments.id, { onDelete: "cascade" }),
  submissionFileUrl: text("submission_file_url").notNull(),
  submissionFileName: varchar("submission_file_name", { length: 255 }),
  submittedDate: timestamp("submitted_date").defaultNow().notNull(),
  marks: integer("marks"),
  feedback: text("feedback"),
  status: varchar("status", { length: 50 }).notNull().default("Submitted"), // 'Submitted', 'Reviewed', 'Completed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LearningNote = typeof learningNotes.$inferSelect;
export type InsertLearningNote = typeof learningNotes.$inferInsert;
export type LearningVideo = typeof learningVideos.$inferSelect;
export type InsertLearningVideo = typeof learningVideos.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = typeof assignments.$inferInsert;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type InsertAssignmentSubmission = typeof assignmentSubmissions.$inferInsert;

// Community Lessons
export const communityLessons = pgTable("community_lessons", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(), // 'pdf' | 'docx' | 'ppt' | 'pptx' | 'video' | 'youtube' | 'text'
  contentUrl: text("content_url"), // base64 or video url
  youtubeUrl: varchar("youtube_url", { length: 255 }),
  textContent: text("text_content"),
  fileName: varchar("file_name", { length: 255 }),
  publishedBy: bigint("published_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Discussion Posts
export const communityPosts = pgTable("community_posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }),
  content: text("content").notNull(),
  authorId: bigint("author_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isPinned: boolean("is_pinned").default(false).notNull(),
  mediaUrl: text("media_url"),
  mediaName: varchar("media_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Comments (including nested replies)
export const communityComments = pgTable("community_comments", {
  id: serial("id").primaryKey(),
  postId: bigint("post_id", { mode: "number" })
    .notNull()
    .references(() => communityPosts.id, { onDelete: "cascade" }),
  authorId: bigint("author_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  parentId: integer("parent_id"), // self-reference using raw integer to avoid circular type ref in drizzle schemas
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Post Reactions (Likes)
export const communityPostReactions = pgTable(
  "community_post_reactions",
  {
    id: serial("id").primaryKey(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reaction: varchar("reaction", { length: 50 }).notNull().default("like"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniquePostUserReaction: uniqueIndex("unique_post_user_reaction_idx").on(table.postId, table.userId),
  })
);

// Community Career Opportunities
export const communityCareers = pgTable("community_careers", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(), // 'Job' | 'Internship' | 'Freelance' | 'Guidance'
  location: varchar("location", { length: 255 }).notNull(),
  description: text("description").notNull(),
  link: varchar("link", { length: 500 }),
  publishedBy: bigint("published_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Saved Career Opportunities
export const communitySavedCareers = pgTable(
  "community_saved_careers",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    careerId: bigint("career_id", { mode: "number" })
      .notNull()
      .references(() => communityCareers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserCareer: uniqueIndex("unique_user_career_idx").on(table.userId, table.careerId),
  })
);

// Community Student Success Stories
export const communitySuccessStories = pgTable("community_success_stories", {
  id: serial("id").primaryKey(),
  studentName: varchar("student_name", { length: 255 }).notNull(),
  courseCompleted: varchar("course_completed", { length: 255 }).notNull(),
  achievement: text("achievement").notNull(),
  photoUrl: text("photo_url"),
  testimonial: text("testimonial").notNull(),
  publishedBy: bigint("published_by", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community Lesson Views (for analytics)
export const communityLessonViews = pgTable(
  "community_lesson_views",
  {
    id: serial("id").primaryKey(),
    lessonId: bigint("lesson_id", { mode: "number" })
      .notNull()
      .references(() => communityLessons.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueLessonUserView: uniqueIndex("unique_lesson_user_view_idx").on(table.lessonId, table.userId),
  })
);

// Community Daily Active Users (for analytics)
export const communityActiveUsers = pgTable(
  "community_active_users",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeDate: varchar("active_date", { length: 10 }).notNull(), // 'YYYY-MM-DD'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserActiveDate: uniqueIndex("unique_user_active_date_idx").on(table.userId, table.activeDate),
  })
);

export type CommunityLesson = typeof communityLessons.$inferSelect;
export type InsertCommunityLesson = typeof communityLessons.$inferInsert;
export type CommunityPost = typeof communityPosts.$inferSelect;
export type InsertCommunityPost = typeof communityPosts.$inferInsert;
export type CommunityComment = typeof communityComments.$inferSelect;
export type InsertCommunityComment = typeof communityComments.$inferInsert;
export type CommunityPostReaction = typeof communityPostReactions.$inferSelect;
export type InsertCommunityPostReaction = typeof communityPostReactions.$inferInsert;
export type CommunityCareer = typeof communityCareers.$inferSelect;
export type InsertCommunityCareer = typeof communityCareers.$inferInsert;
export type CommunitySavedCareer = typeof communitySavedCareers.$inferSelect;
export type InsertCommunitySavedCareer = typeof communitySavedCareers.$inferInsert;
export type CommunitySuccessStory = typeof communitySuccessStories.$inferSelect;
export type InsertCommunitySuccessStory = typeof communitySuccessStories.$inferInsert;
export type CommunityLessonView = typeof communityLessonViews.$inferSelect;
export type CommunityActiveUser = typeof communityActiveUsers.$inferSelect;




