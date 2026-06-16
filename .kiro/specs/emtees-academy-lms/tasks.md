# Implementation Plan: EMTEES Academy LMS

## Overview

Build on top of the existing scaffolded codebase (schema, routers, pages) to complete all missing business logic, UI, and engine implementations. The existing stack is TypeScript + tRPC + Drizzle ORM + React + shadcn/ui. Tasks are ordered so each step integrates cleanly into the previous one.

## Tasks

- [x] 1. Harden authentication — account status checks & single-device enforcement
  - [x] 1.1 Add suspended/on_hold login guard in `api/routers/auth.ts`
    - After password/OTP validation, check `user.status`; throw `FORBIDDEN` with "Account suspended" or "Account on hold" accordingly
    - _Requirements: 1.8, 1.9, 16.6_

  - [ ]* 1.2 Write unit tests for auth status guards
    - Test suspended user returns FORBIDDEN, on_hold user returns FORBIDDEN, active user succeeds
    - _Requirements: 1.8, 1.9_

  - [x] 1.3 Implement single-device session invalidation in `api/routers/auth.ts`
    - On login, if a `deviceToken` already exists on the user record and differs from the incoming token, invalidate the previous session by overwriting it
    - Store a `sessionToken` field (or reuse `deviceToken`) so the JWT middleware can reject stale tokens
    - _Requirements: 1.7_

  - [ ]* 1.4 Write property test for device token replacement (Property 4)
    - **Property 4: Device token replacement on login**
    - **Validates: Requirements 1.6, 1.7**

- [x] 2. Complete user management — duplicate checks, profile fees balance, bulk import
  - [x] 2.1 Add duplicate username/phone CONFLICT errors in `api/routers/users.ts` `create` mutation
    - Check for existing username and phone before insert; throw `CONFLICT` with correct messages
    - _Requirements: 2.2, 2.3_

  - [x] 2.2 Auto-recalculate `feesBalance` on profile update in `api/routers/users.ts` `update` mutation
    - When `feesTotal` changes, recompute `feesBalance = feesTotal - feesPaid` and persist
    - _Requirements: 2.10, 8.8_

  - [ ]* 2.3 Write property test for fees balance invariant (Property 7)
    - **Property 7: Fees balance is always total minus paid**
    - **Validates: Requirements 2.10, 8.8**

  - [ ]* 2.4 Write unit tests for user creation round-trip (Property 5)
    - Verify all fields are persisted and password is never returned in response
    - **Property 5: User creation round-trip preserves all fields**
    - **Validates: Requirements 2.1, 18.2**

  - [ ]* 2.5 Write property test for bulk import count invariant (Property 6)
    - **Property 6: Bulk student import count invariant**
    - **Validates: Requirements 2.4, 2.5**

- [x] 3. Complete module & batch management — enrollment conflict, capacity alerts
  - [x] 3.1 Add CONFLICT guard for duplicate enrollment in `api/routers/learning.ts` `enrollStudent`
    - Query for existing active enrollment before insert; throw `CONFLICT` with "Student already enrolled in this batch"
    - _Requirements: 3.4_

  - [x] 3.2 Create `api/lib/notificationEngine.ts` — shared notification helper
    - Export `sendNotification(db, userId, title, message, type, data?)` that inserts into the `notifications` table
    - Export `sendBulkNotification(db, userIds[], ...)` for multi-recipient dispatch
    - _Requirements: 15.1–15.8_

  - [x] 3.3 Add capacity alert notifications in `api/routers/learning.ts` after enrollment changes
    - After `enrollStudent`: if active count > batch `maxStudents`, notify all admins
    - After `removeStudent`: if active count < module `minStudents`, notify all admins
    - _Requirements: 3.6, 3.7_

  - [ ]* 3.4 Write property test for enrollment round-trip (Property 8)
    - **Property 8: Enrollment round-trip creates active record**
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 3.5 Write property test for enrollment removal (Property 9)
    - **Property 9: Enrollment removal sets inactive status and records timestamp**
    - **Validates: Requirements 3.5**

- [x] 4. Complete group chat — access control, payment gate, announcement flag, phone privacy
  - [x] 4.1 Add payment-status gate in `api/routers/learning.ts` `sendMessage`
    - Before inserting a message, check if the sender is a student with `paymentStatus = "overdue"` and grace period elapsed; throw `FORBIDDEN` with "Payment required to send messages"
    - _Requirements: 4.9, 8.6_

  - [x] 4.2 Strip phone number from sender data in `listMessages` response
    - After fetching messages with `with: { sender: true }`, map over results and delete `sender.phone` before returning
    - _Requirements: 4.7, 18.1_

  - [x] 4.3 Add `isAnnouncement` support to `sendMessage` input schema
    - Accept `isAnnouncement` boolean; only allow `true` for teacher/admin roles; throw `FORBIDDEN` otherwise
    - _Requirements: 4.8_

  - [x] 4.4 Add emoji reaction mutation to `api/routers/learning.ts`
    - `addReaction(messageId, emoji)` — merge emoji into the `reactions` JSON field using a read-modify-write pattern
    - _Requirements: 4.3_

  - [ ]* 4.5 Write property test for message send round-trip (Property 10)
    - **Property 10: Message send round-trip preserves all fields, phone not exposed**
    - **Validates: Requirements 4.1, 4.7, 18.1**

  - [ ]* 4.6 Write property test for message access control (Property 11)
    - **Property 11: Message access control enforces enrollment**
    - **Validates: Requirements 4.5**

- [x] 5. Complete learning materials — scheduled date visibility filter
  - [x] 5.1 Filter scheduled materials by date in `api/routers/learning.ts` `listMaterials`
    - For student role, add `WHERE scheduledDate IS NULL OR scheduledDate <= NOW()` to the query
    - _Requirements: 5.2, 5.5_

  - [ ]* 5.2 Write unit tests for scheduled material visibility
    - Future-dated material hidden from students, visible to teachers/admins
    - _Requirements: 5.2_

- [x] 6. Complete class management — notifications on start, 10-min reminder, cancel endpoint
  - [x] 6.1 Trigger class-start notification in `api/routers/classes.ts` `start` mutation
    - After setting status to "ongoing", fetch all active enrollments for the batch and call `sendBulkNotification` with type `"class_start"`
    - _Requirements: 6.4_

  - [x] 6.2 Add `cancel` mutation to `api/routers/classes.ts`
    - Set class status to "cancelled"; accessible to teacher (own class) and admin
    - _Requirements: 6.6_

  - [x] 6.3 Implement 10-minute class reminder scheduler in `api/lib/scheduler.ts`
    - Create a polling function (called on server boot) that queries classes with `status = "scheduled"` and `scheduledAt` within the next 10 minutes, sends reminders, and marks them as reminded (add `reminderSentAt` field or use a flag)
    - _Requirements: 6.5, 15.1_

  - [ ]* 6.4 Write unit tests for class start/end duration calculation
    - Verify `duration` is correctly computed as `(endedAt - startedAt) / 60000`
    - _Requirements: 6.3_

- [x] 7. Complete attendance engine — absence streak detection & alert
  - [x] 7.1 Add 7-consecutive-absence alert in `api/routers/classes.ts` `recordAttendance`
    - After recording, query the student's last 7 attendance records ordered by `recordedAt` desc; if all are "absent", call `sendNotification` for the student, their batch teacher, and all admins
    - _Requirements: 7.6, 15.4_

  - [ ]* 7.2 Write property test for attendance status threshold (Property 12)
    - **Property 12: Attendance status is determined solely by chat count threshold**
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 7.3 Write property test for attendance idempotency (Property 13)
    - **Property 13: Attendance recording is idempotent per (class, student) pair**
    - **Validates: Requirements 7.4, 7.5**

  - [x] 7.4 Add chat count report endpoints to `api/routers/admin.ts`
    - `getClassChatReport(classId)` — return per-student message counts for a class
    - `getTeacherChatReport(teacherId)` — return message counts per teacher per class
    - _Requirements: 7.7, 7.8_

- [ ] 8. Checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Complete payment engine — overdue detection, access restriction, reactivation
  - [x] 9.1 Add overdue payment detection in `api/lib/scheduler.ts`
    - Poll payments where `dueDate < NOW()` and `status != "paid"`; set status to "overdue", send overdue notification to student and all admins
    - _Requirements: 8.4, 15.3_

  - [x] 9.2 Add 3-day fee reminder in `api/lib/scheduler.ts`
    - Poll payments where `dueDate` is within 3 days and `status != "paid"`; send fee-due reminder to student
    - _Requirements: 8.3, 15.2_

  - [x] 9.3 Implement enrollment deactivation after grace period in `api/lib/scheduler.ts`
    - For overdue payments older than 7 days, set all active enrollments for the student to "inactive"
    - _Requirements: 8.5, 8.6_

  - [x] 9.4 Implement enrollment reactivation on payment in `api/routers/admin.ts` `recordPayment`
    - After marking payment as "paid", reactivate all "inactive" enrollments for the student that were deactivated due to non-payment; update profile `feesPaid` and recalculate `feesBalance`
    - _Requirements: 8.7, 8.8_

  - [ ]* 9.5 Write unit tests for payment engine state transitions
    - Test: unpaid → overdue after due date, overdue → enrollment inactive after grace, paid → enrollment reactivated
    - _Requirements: 8.4, 8.5, 8.7_

- [x] 10. Complete flexibility system — enrollment state changes on approval
  - [x] 10.1 Apply enrollment state changes in `api/routers/admin.ts` `resolveRequest`
    - On approve "hold": set enrollment status to "on_hold" for `fromBatchId`
    - On approve "rejoin": set enrollment status to "active" for `fromBatchId`
    - On approve "batch_change": set `fromBatch` enrollment to "inactive", create new active enrollment in `toBatch`
    - _Requirements: 9.4, 9.5, 9.6_

  - [x] 10.2 Send flexibility request status notification in `resolveRequest`
    - After resolving, call `sendNotification` to the student with the approval/rejection result
    - _Requirements: 9.2, 15.5_

  - [x] 10.3 Append flexibility request events to profile `activityTimeline` in `resolveRequest`
    - Read existing `activityTimeline` JSON array, push a new event `{ type, status, timestamp, adminNote }`, and persist
    - _Requirements: 9.7_

  - [ ]* 10.4 Write unit tests for flexibility request state machine
    - Test each request type (hold, rejoin, batch_change) approval and rejection paths
    - _Requirements: 9.3–9.6_

- [ ] 11. Complete one-to-one session system — completion rules, expiry, recording access
  - [x] 11.1 Add session completion logic in `api/routers/classes.ts`
    - Add `completeOneToOne(sessionId, actualDurationMinutes)` mutation (teacherQuery)
    - Apply duration rules: 30-min session → complete if 25–40 min; 45-min session → complete if 35–60 min
    - Set `status = "completed"`, `completedAt = now()`
    - _Requirements: 10.3, 10.4_

  - [x] 11.2 Add session expiry check in `api/lib/scheduler.ts`
    - Poll `oneToOneSessions` where `validUntil < NOW()` and `status != "completed"`; auto-mark as "completed"
    - _Requirements: 10.5_

  - [ ] 11.3 Add recording URL update mutation in `api/routers/classes.ts`
    - `updateSessionRecording(sessionId, recordingUrl)` — admin-only; store recording URL on session record
    - `deleteSessionRecording(sessionId)` — admin-only; set `recordingUrl = null`, set `recordingDeletedAt = now()`
    - _Requirements: 10.8, 10.9, 10.10_

  - [x] 11.4 Add recording retention cleanup in `api/lib/scheduler.ts`
    - Poll sessions where `recordingUrl IS NOT NULL` and recording age exceeds configured retention period; auto-delete recording URL and set `recordingDeletedAt`
    - _Requirements: 10.11_

  - [x] 11.5 Add student session summary query to `api/routers/classes.ts`
    - `mySessionSummary()` — returns `{ completed, remaining }` counts for the authenticated student
    - _Requirements: 10.6_

  - [x] 11.6 Add teacher session summary query to `api/routers/classes.ts`
    - `teacherSessionSummary(teacherId?)` — returns `{ totalHandled, totalEarnings }` for the teacher
    - _Requirements: 10.7_

  - [ ]* 11.7 Write unit tests for one-to-one session completion duration rules
    - Test boundary values: 24 min (fail), 25 min (pass), 40 min (pass), 41 min (fail) for 30-min session
    - _Requirements: 10.3, 10.4_

- [x] 12. Complete salary engine — report export
  - [x] 12.1 Add salary report export endpoint to `api/routers/admin.ts`
    - `exportSalaryReport(teacherId, month, format: "pdf" | "excel")` — generate and return a downloadable buffer
    - Use a lightweight library (e.g., `exceljs` for Excel, `pdfkit` for PDF) or return structured data for client-side generation
    - _Requirements: 11.5_

  - [ ]* 12.2 Write property test for salary calculation formula (Property 14)
    - **Property 14: Salary calculation follows the defined formula**
    - **Validates: Requirements 11.3**

- [x] 13. Complete reports & analytics — teacher report, leaderboard, export
  - [x] 13.1 Add `getTeacherReport` endpoint to `api/routers/admin.ts`
    - Calculate: total classes handled, student engagement rate (avg chat count per class), student retention rate (active enrollments / total enrollments), course completion rate
    - _Requirements: 12.2_

  - [x] 13.2 Add teacher performance classification to `getTeacherReport`
    - Compute `studentCompletionRate`; classify as "Best" if 100%, "Needs Improvement" if < 60%
    - _Requirements: 13.1, 13.3, 13.4_

  - [x] 13.3 Add ranked teacher list endpoint to `api/routers/admin.ts`
    - `listTeachersByPerformance()` — return teachers ordered by `studentCompletionRate` descending
    - _Requirements: 13.5_

  - [x] 13.4 Add student leaderboard endpoint to `api/routers/admin.ts`
    - `getLeaderboard()` — compute composite score (attendance % + chat activity count), return students ranked descending
    - _Requirements: 13.6, 19.3_

  - [x] 13.5 Add report export endpoints to `api/routers/admin.ts`
    - `exportStudentReport(studentId, format)` and `exportTeacherReport(teacherId, format)` returning Excel/PDF
    - _Requirements: 12.4, 12.5_

  - [ ]* 13.6 Write property test for attendance percentage formula (Property 15)
    - **Property 15: Attendance percentage formula is correct**
    - **Validates: Requirements 12.3**

  - [ ]* 13.7 Write property test for teacher performance classification (Property 16)
    - **Property 16: Teacher performance classification is consistent with completion rate**
    - **Validates: Requirements 13.3, 13.4**

  - [ ]* 13.8 Write property test for leaderboard ordering (Property 19)
    - **Property 19: Leaderboard ordering is consistent with composite score**
    - **Validates: Requirements 19.3**

- [x] 14. Complete discipline system — violation notification, suspend user
  - [x] 14.1 Send violation notification in `api/routers/admin.ts` `createViolation`
    - After inserting the violation, call `sendNotification` to the subject user
    - _Requirements: 16.3_

  - [x] 14.2 Add `resolveViolation` mutation to `api/routers/admin.ts`
    - Set `status = "resolved"`, `resolvedAt = now()`
    - _Requirements: 16.2_

  - [x] 14.3 Add `suspendUser` mutation to `api/routers/admin.ts`
    - Set `users.status = "suspended"` for the given user ID
    - _Requirements: 16.4_

  - [ ]* 14.4 Write unit tests for discipline workflow
    - Test violation creation triggers notification, resolve sets timestamp, suspend blocks login
    - _Requirements: 16.1–16.4_

- [x] 15. Implement community group auto-enrollment
  - [x] 15.1 Add community group auto-enrollment trigger in `api/routers/users.ts` `update`
    - When `completionDate` is set on a profile, look up the designated Community_Group batch (by a config flag or a `isCommunityGroup` column on batches) and create an active enrollment for the student
    - Send a welcome notification to the student
    - _Requirements: 17.1, 17.4_

  - [x] 15.2 Add `isCommunityGroup` boolean column to `batches` table in `db/schema.ts`
    - Add the column with default `false`; community group batches skip the `maxStudents` enforcement
    - _Requirements: 17.2_

  - [ ]* 15.3 Write unit tests for community group enrollment
    - Test that setting completionDate triggers enrollment and welcome notification
    - _Requirements: 17.1, 17.4_

- [ ] 16. Checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Implement gamification & AI insights (feature-flagged)
  - [x] 17.1 Add attendance streak badge logic in `api/routers/classes.ts` `recordAttendance`
    - After recording a "present" status, count consecutive present days for the student
    - If streak reaches 7 or 30, award the corresponding badge (store in profile `activityTimeline` or a dedicated badges field)
    - Guard with a feature flag check (e.g., `process.env.FEATURE_GAMIFICATION === "true"`)
    - _Requirements: 13.7, 13.8, 19.4, 19.5_

  - [x] 17.2 Add "at risk" student flagging to `getLeaderboard` / analytics
    - Students with attendance % < 60% are flagged as `atRisk: true` in the response
    - Guard with `FEATURE_AI_INSIGHTS` flag
    - _Requirements: 19.1_

  - [x] 17.3 Add "needs improvement" teacher flagging to `listTeachersByPerformance`
    - Teachers with completion rate < 60% are surfaced with a flag in the response
    - Guard with `FEATURE_AI_INSIGHTS` flag
    - _Requirements: 19.2_

  - [ ]* 17.4 Write unit tests for streak badge award thresholds
    - Test streak of 6 (no badge), 7 (badge awarded), 30 (badge awarded)
    - _Requirements: 13.7, 19.4, 19.5_

- [x] 18. Build out React UI — Users page
  - [x] 18.1 Complete `src/pages/Users.tsx` with full CRUD UI
    - List users with search, role filter, status filter using `trpc.user.list`
    - Add user dialog using `trpc.user.create`
    - Edit user dialog using `trpc.user.update`
    - Delete confirmation using `trpc.user.delete`
    - Bulk import dialog (CSV paste or file upload) using `trpc.user.importStudents`
    - _Requirements: 2.1, 2.4, 2.6, 2.7, 2.8_

  - [ ]* 18.2 Write unit tests for Users page rendering
    - Test list renders, add/edit dialogs open, delete confirmation works
    - _Requirements: 2.1–2.8_

- [x] 19. Build out React UI — Batches & Modules page
  - [x] 19.1 Complete `src/pages/Batches.tsx`
    - List modules with their batches using `trpc.learning.listModules` and `trpc.learning.listBatches`
    - Create module dialog, create batch dialog (with teacher selector)
    - Enroll student dialog, remove student action
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.8_

- [x] 20. Build out React UI — Chat page
  - [x] 20.1 Complete `src/pages/Chat.tsx`
    - Batch selector sidebar showing enrolled batches
    - Message list with polling (`refetchInterval: 3000`) using `trpc.learning.listMessages`
    - Message input with type selector (text/image/video/PDF/voice)
    - Reply-to threading UI (click message to set `replyToId`)
    - Emoji reaction picker on message hover
    - Announcement badge for messages with `isAnnouncement = true`
    - _Requirements: 4.1–4.8_

- [x] 21. Build out React UI — Classes page
  - [x] 21.1 Complete `src/pages/Classes.tsx`
    - Scheduled/ongoing/completed class list using `trpc.class.list`
    - Schedule class dialog (teacher/admin)
    - Start/End/Cancel class actions
    - Attendance recording panel per class (teacher view)
    - One-to-one session list and create dialog (admin)
    - _Requirements: 6.1–6.6, 7.3, 10.1, 10.2_

- [x] 22. Build out React UI — Fees page
  - [x] 22.1 Complete `src/pages/Fees.tsx`
    - Admin view: list all payments with student filter, status filter
    - Create payment record dialog, record payment dialog
    - Student view: show own payment records and balance from profile
    - _Requirements: 8.1, 8.2, 8.8_

- [x] 23. Build out React UI — Reports page
  - [x] 23.1 Complete `src/pages/Reports.tsx`
    - Student report view: attendance %, chat activity, payment status, timeline
    - Teacher report view: classes handled, completion rate, performance classification
    - Leaderboard tab with ranked student list
    - Export buttons (Excel/PDF) for each report
    - _Requirements: 12.1–12.5, 13.5, 13.6_

- [x] 24. Build out React UI — Notifications, Discipline, Settings pages
  - [x] 24.1 Complete `src/pages/Notifications.tsx`
    - List notifications using `trpc.student.myNotifications` (student) or `trpc.admin.listNotifications` (admin)
    - Mark as read action using `trpc.student.markNotificationRead`
    - Admin: send broadcast notification dialog using `trpc.admin.sendNotification`
    - _Requirements: 15.6, 15.7, 15.8_

  - [x] 24.2 Complete `src/pages/Discipline.tsx`
    - List violations using `trpc.admin.listViolations`
    - Create violation dialog, resolve violation action, suspend user action
    - _Requirements: 16.1, 16.2, 16.4, 16.5_

  - [x] 24.3 Complete `src/pages/Settings.tsx`
    - Feature flag toggles for gamification, AI insights, voice-to-text
    - Profile settings for the logged-in user (name, avatar)
    - _Requirements: 19.1–19.6_

- [x] 25. Set up test infrastructure and write property-based tests
  - [x] 25.1 Install `fast-check` and configure test directories
    - `npm install --save-dev fast-check`
    - Create `tests/unit/`, `tests/property/`, `tests/integration/` directories
    - Add `vitest.config.ts` include patterns for all test directories
    - _Requirements: Design — Testing Strategy_

  - [ ]* 25.2 Write property tests for auth (Properties 1–4)
    - **Property 1: Authentication succeeds iff credentials are valid**
    - **Property 2: OTP generation produces valid 6-digit codes with 10-minute expiry**
    - **Property 3: OTP verification is a round-trip that marks the code as used**
    - **Property 4: Device token replacement on login**
    - **Validates: Requirements 1.1–1.7**

  - [ ]* 25.3 Write property test for password hashing (Property 18)
    - **Property 18: Password hashes use bcrypt with cost factor >= 10**
    - **Validates: Requirements 18.5**

- [x] 26. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- The scheduler (`api/lib/scheduler.ts`) should be started on server boot in `api/boot.ts` using `setInterval`
- Feature flags are read from environment variables (`FEATURE_GAMIFICATION`, `FEATURE_AI_INSIGHTS`, `FEATURE_VOICE_TO_TEXT`)
- The `notificationEngine.ts` helper is a prerequisite for tasks 3, 6, 7, 9, 10, 14, and 15 — complete task 3.2 first
- Property tests use `fast-check` with `vitest`; run with `npm test`
