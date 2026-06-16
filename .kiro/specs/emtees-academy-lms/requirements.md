# Requirements Document

## Introduction

EMTEES Academy LMS is a full-stack Learning Management System comprising a Web Admin Panel and Mobile App. The platform manages WhatsApp-style group learning (Module Groups with Sub-Group Batches), one-to-one video classes, admissions, fees, attendance, performance analytics, and reporting. The system is built on an existing stack: PostgreSQL + Drizzle ORM, tRPC + Hono, React + TanStack Query + shadcn/ui, with scaffolded schema and routers already in place.

---

## Glossary

- **System**: The EMTEES Academy LMS platform (web + mobile)
- **Super_Admin**: The platform owner with full access to all features and data
- **Admin**: Backend officer managing admissions, fees, approvals, and reports
- **Academic_Head**: Staff member who monitors teacher and student performance
- **Teacher**: Instructor who conducts classes and manages assigned students
- **Student**: Learner who attends classes, accesses modules, and tracks progress
- **Module**: A top-level course group containing one or more Batches
- **Batch**: A sub-group of students within a Module, assigned to a Teacher
- **Enrollment**: The active association between a Student and a Batch
- **Group_Chat**: The WhatsApp-style messaging channel scoped to a Batch
- **Learning_Tab**: The daily content feed within a Batch where materials are pushed
- **Live_Class**: A built-in video call session started by a Teacher within a Batch
- **One_to_One_Session**: A private video call session between a Teacher and a single Student
- **Flexibility_Request**: A Student-initiated request for Hold, Rejoin, or Batch Change
- **Attendance_Engine**: The subsystem that auto-calculates attendance based on chat activity
- **Payment_Engine**: The subsystem that tracks fees, due dates, and access restrictions
- **Salary_Engine**: The subsystem that auto-calculates Teacher salary from class counts
- **Notification_Engine**: The subsystem that dispatches in-app and push notifications
- **Recording**: A silent video recording of a One_to_One_Session accessible only to Admin
- **Violation**: A logged disciplinary event against a User
- **Community_Group**: A post-course Batch open to all completed Students for lifetime access
- **Leaderboard**: A ranked display of Student performance metrics
- **OTP**: A one-time password sent via SMS for phone-based authentication

---

## Requirements

### Requirement 1: User Authentication

**User Story:** As a User, I want to log in securely using my credentials or phone OTP, so that I can access the platform from my registered device only.

#### Acceptance Criteria

1. WHEN a User submits a valid username and password, THE System SHALL authenticate the User and return a signed JWT token valid for 7 days.
2. WHEN a User submits an invalid username or password, THE System SHALL return an UNAUTHORIZED error with the message "Invalid credentials".
3. WHEN a User requests an OTP for a registered phone number, THE System SHALL generate a 6-digit OTP, store it with a 10-minute expiry, and return a success response.
4. WHEN a User submits a valid OTP within its expiry window, THE System SHALL mark the OTP as used, authenticate the User, and return a signed JWT token.
5. WHEN a User submits an expired or already-used OTP, THE System SHALL return an UNAUTHORIZED error.
6. WHEN a User authenticates with a device token, THE System SHALL store the device token against the User record, replacing any previously stored device token.
7. WHILE a User is authenticated on one device, THE System SHALL reject authentication attempts from a second device by invalidating the previous session token.
8. IF a User account has status "suspended", THEN THE System SHALL return a FORBIDDEN error and deny login.
9. IF a User account has status "on_hold", THEN THE System SHALL return a FORBIDDEN error and deny login.

---

### Requirement 2: Admission & User Management

**User Story:** As an Admin, I want to register and manage Students and Teachers, so that I can maintain accurate user records and control platform access.

#### Acceptance Criteria

1. THE Admin SHALL be able to create a User with fields: name, phone, email (optional), username, password, role, course, batch, and fees total.
2. WHEN an Admin creates a User with a duplicate username, THE System SHALL return a CONFLICT error.
3. WHEN an Admin creates a User with a duplicate phone number, THE System SHALL return a CONFLICT error.
4. THE Admin SHALL be able to import multiple Students in a single operation by providing an array of student records.
5. WHEN an Admin imports Students, THE System SHALL create a User record for each entry and set the default password to the last 6 digits of the Student's phone number.
6. THE Admin SHALL be able to update a User's name, phone, email, status, course, batch, and fees total.
7. THE Admin SHALL be able to set a User's status to one of: active, inactive, suspended, or on_hold.
8. THE Admin SHALL be able to delete a User record, which SHALL cascade-delete all associated profile data.
9. THE System SHALL maintain a profile record per User containing: course, batch, fees total, fees paid, fees balance, payment status, admission date, completion date, and activity timeline.
10. WHEN a User's profile is updated, THE System SHALL recalculate the fees balance as (fees total − fees paid).

---

### Requirement 3: Module & Batch Management

**User Story:** As an Admin, I want to create and manage Modules and Batches, so that I can organise learning groups and assign Teachers and Students.

#### Acceptance Criteria

1. THE Admin SHALL be able to create a Module with a name, description, maximum student count, and minimum student count.
2. THE Admin SHALL be able to create a Batch under a Module with a name, time slot, assigned Teacher, and maximum student count.
3. THE Admin SHALL be able to enrol a Student into a Batch, creating an active Enrollment record.
4. WHEN an Admin enrols a Student who is already enrolled in the same Batch, THE System SHALL return a CONFLICT error.
5. THE Admin SHALL be able to remove a Student from a Batch, setting the Enrollment status to "inactive" and recording the left-at timestamp.
6. WHEN a Batch's active Enrollment count exceeds the Batch's maximum student count, THE Notification_Engine SHALL send an alert to the Admin.
7. WHEN a Batch's active Enrollment count falls below the Module's minimum student count, THE Notification_Engine SHALL send an alert to the Admin.
8. THE System SHALL expose a list endpoint for Modules and Batches filterable by module ID.

---

### Requirement 4: WhatsApp-Style Group Chat

**User Story:** As a Student or Teacher, I want to send and receive messages within my Batch group, so that I can communicate and collaborate with my class.

#### Acceptance Criteria

1. WHEN an enrolled Student sends a message to a Batch, THE System SHALL store the message with sender ID, batch ID, type, content, and timestamp.
2. THE System SHALL support message types: text, voice note, image, video, and PDF.
3. THE System SHALL support emoji reactions stored as JSON on the message record.
4. THE System SHALL support reply-to threading by storing a reference to the parent message ID.
5. WHEN a User requests messages for a Batch, THE System SHALL return only messages for Batches in which the User is enrolled, is the assigned Teacher, or holds an admin-level role.
6. WHEN a Student attempts to send a direct private message to another Student, THE System SHALL return a FORBIDDEN error.
7. THE System SHALL never expose a User's phone number within message sender data returned to other Users.
8. WHEN a Teacher or Admin sends a message, THE System SHALL allow marking it as an announcement via the isAnnouncement flag.
9. WHEN a Student's payment status is "unpaid" and the grace period has elapsed, THE System SHALL prevent the Student from sending messages to any Batch.

---

### Requirement 5: Learning Materials (Learning Tab)

**User Story:** As a Teacher or Admin, I want to push daily learning content to a Batch, so that Students can access structured materials on schedule.

#### Acceptance Criteria

1. THE Teacher SHALL be able to create a learning material for a Batch with a title, description, type (text, voice, image, video, PDF), content URL, and optional scheduled date.
2. WHEN a scheduled date is set on a learning material, THE System SHALL make the material visible to Students only on or after the scheduled date.
3. THE System SHALL return learning materials for a Batch ordered by creation date descending.
4. THE Admin SHALL be able to create learning materials for any Batch.
5. WHEN a Student requests learning materials for a Batch, THE System SHALL return only materials for Batches in which the Student is actively enrolled.

---

### Requirement 6: Live Class (Group Video)

**User Story:** As a Teacher, I want to start a live video class within a Batch, so that Students can join and attend in real time.

#### Acceptance Criteria

1. THE Teacher SHALL be able to schedule a group class for a Batch with a title, description, class type "group", scheduled time, and optional meeting URL.
2. WHEN a Teacher starts a scheduled class, THE System SHALL set the class status to "ongoing" and record the start timestamp.
3. WHEN a Teacher ends an ongoing class, THE System SHALL set the class status to "completed", record the end timestamp, and calculate the duration in minutes.
4. WHEN a class status changes to "ongoing", THE Notification_Engine SHALL send a class-start reminder to all enrolled Students in the Batch.
5. THE Notification_Engine SHALL send a class reminder to all enrolled Students 10 minutes before the scheduled class time.
6. WHEN a class is cancelled, THE System SHALL set the class status to "cancelled".

---

### Requirement 7: Attendance System

**User Story:** As a Teacher or Admin, I want attendance to be calculated automatically from chat activity during class time, so that I have an objective record of Student participation.

#### Acceptance Criteria

1. WHEN attendance is recorded for a Student in a class with a chat count of 4 or more, THE Attendance_Engine SHALL set the attendance status to "present".
2. WHEN attendance is recorded for a Student in a class with a chat count of 0 to 3, THE Attendance_Engine SHALL set the attendance status to "absent".
3. THE Teacher SHALL be able to record or update attendance for a Student in a class by providing the class ID, student ID, and chat count.
4. WHEN attendance already exists for a Student in a class, THE Attendance_Engine SHALL update the existing record rather than create a duplicate.
5. THE System SHALL enforce a unique constraint on (class ID, student ID) in the attendance table.
6. WHEN a Student has been absent for 7 consecutive class days, THE Notification_Engine SHALL send an alert to the Student, the assigned Teacher, and all Admin users.
7. THE Admin SHALL be able to retrieve a student-wise chat count report for any class.
8. THE Admin SHALL be able to retrieve a teacher chat activity report showing message counts per Teacher per class.

---

### Requirement 8: Fees & Payment Management

**User Story:** As an Admin, I want to track student fees and automatically restrict access for unpaid students, so that the academy's revenue is protected.

#### Acceptance Criteria

1. THE Admin SHALL be able to create a payment record for a Student with amount, type, due date, and notes.
2. THE Admin SHALL be able to record a payment against an existing payment record, setting the status to "paid" and recording the paid-at timestamp and transaction ID.
3. WHEN a payment due date is 3 days away and the payment status is not "paid", THE Notification_Engine SHALL send a fee-due reminder to the Student.
4. WHEN a payment due date has passed and the payment status is not "paid", THE Payment_Engine SHALL set the payment status to "overdue" and send an overdue notification to the Student and Admin.
5. WHEN a Student's payment status is "overdue" and the grace period of 7 days has elapsed, THE Payment_Engine SHALL set the Student's Enrollment status to "inactive" in all active Batches.
6. WHEN a Student's Enrollment is set to "inactive" due to non-payment, THE System SHALL prevent the Student from accessing Group_Chat and Live_Class features.
7. WHEN a Student's payment is recorded as "paid", THE Payment_Engine SHALL reactivate the Student's Enrollment in all previously deactivated Batches.
8. THE System SHALL track fees balance as (fees total − fees paid) on the Student's profile.

---

### Requirement 9: Flexibility System (Hold, Rejoin, Batch Change)

**User Story:** As a Student, I want to request a hold, rejoin, or batch change, so that I can manage my learning schedule around personal circumstances.

#### Acceptance Criteria

1. THE Student SHALL be able to submit a Flexibility_Request of type "hold", "rejoin", or "batch_change" with an optional reason and source/target batch IDs.
2. WHEN a Flexibility_Request is submitted, THE System SHALL create the request with status "pending" and notify the Admin.
3. THE Admin SHALL be able to approve or reject a Flexibility_Request, recording the resolution timestamp, resolver ID, and an optional admin note.
4. WHEN an Admin approves a "hold" request, THE System SHALL set the Student's Enrollment status to "on_hold" in the specified Batch.
5. WHEN an Admin approves a "rejoin" request, THE System SHALL set the Student's Enrollment status to "active" in the specified Batch.
6. WHEN an Admin approves a "batch_change" request, THE System SHALL set the Student's Enrollment in the source Batch to "inactive" and create a new active Enrollment in the target Batch.
7. THE System SHALL maintain a full activity timeline on the Student's profile recording all Flexibility_Request state changes with timestamps.
8. THE Student SHALL be able to view all their own Flexibility_Requests with current status.

---

### Requirement 10: One-to-One Video Class System

**User Story:** As a Student, I want to attend private one-to-one video sessions with a Teacher, so that I can receive personalised instruction.

#### Acceptance Criteria

1. THE Admin SHALL be able to create a One_to_One_Session for a Teacher and Student with a session length of 30 or 45 minutes and a scheduled time.
2. WHEN a One_to_One_Session is created, THE System SHALL set the validity window to 60 days from the scheduled date.
3. WHEN a 30-minute One_to_One_Session has an actual duration between 25 and 40 minutes, THE System SHALL mark the session status as "completed".
4. WHEN a 45-minute One_to_One_Session has an actual duration between 35 and 60 minutes, THE System SHALL mark the session status as "completed".
5. WHEN a One_to_One_Session has not been completed before its validity expiry date, THE System SHALL automatically mark the session status as "completed".
6. THE Student SHALL be able to view their completed sessions count and remaining sessions count.
7. THE Teacher SHALL be able to view their total sessions handled count and total earnings from One_to_One_Sessions.
8. WHEN a One_to_One_Session is ongoing, THE System SHALL silently record the session video and store the recording URL on the session record.
9. THE Recording SHALL be accessible only to Admin and Super_Admin roles.
10. THE Admin SHALL be able to delete a recording manually, setting the recording URL to null and recording the deletion timestamp.
11. WHEN a recording has exceeded the configured retention period, THE System SHALL automatically delete the recording and record the deletion timestamp.
12. THE Student SHALL be able to submit a Flexibility_Request of type "hold" for a One_to_One_Session, which the Admin can approve to pause the validity countdown.

---

### Requirement 11: Teacher Salary System

**User Story:** As an Admin, I want the system to auto-calculate teacher salaries based on classes handled, so that payroll is accurate and auditable.

#### Acceptance Criteria

1. WHEN an Admin calculates salary for a Teacher for a given month, THE Salary_Engine SHALL count all completed group classes taught by the Teacher in that month.
2. WHEN an Admin calculates salary for a Teacher for a given month, THE Salary_Engine SHALL count all completed One_to_One_Sessions handled by the Teacher in that month.
3. THE Salary_Engine SHALL calculate total salary as (group class count × group class rate) + (one-to-one count × one-to-one rate).
4. THE System SHALL store the salary record with teacher ID, month, class counts, rates, and total amount.
5. THE Admin SHALL be able to download a salary report for a Teacher for a given month in PDF or Excel format.
6. THE Admin SHALL be able to list salary records filterable by teacher ID and month.

---

### Requirement 12: Reports & Analytics

**User Story:** As an Admin or Academic_Head, I want to generate and export reports on student and teacher performance, so that I can make data-driven decisions.

#### Acceptance Criteria

1. THE Admin SHALL be able to retrieve a student report containing: attendance percentage, chat activity count, payment status, and activity timeline history.
2. THE Admin SHALL be able to retrieve a teacher report containing: total classes handled, student engagement rate, student retention rate, and course completion rate.
3. THE System SHALL calculate attendance percentage as (present count ÷ total class count) × 100, rounded to the nearest integer.
4. THE Admin SHALL be able to export any report in Excel (.xls) format.
5. THE Admin SHALL be able to export any report in PDF format.
6. THE Admin SHALL be able to retrieve a dashboard summary containing: total students, total teachers, total batches, total completed classes, and total pending fees amount.

---

### Requirement 13: Teacher & Student Performance Analytics

**User Story:** As an Academic_Head, I want to view performance analytics for Teachers and Students, so that I can identify top performers and those needing support.

#### Acceptance Criteria

1. THE System SHALL calculate a Teacher's student completion rate as (students who completed the course ÷ total students assigned) × 100.
2. THE System SHALL calculate a Teacher's attendance rate as (total present records ÷ total attendance records for the Teacher's classes) × 100.
3. WHEN a Teacher's student completion rate is 100%, THE System SHALL classify the Teacher's performance level as "Best".
4. WHEN a Teacher's student completion rate is below 60%, THE System SHALL classify the Teacher's performance level as "Needs Improvement".
5. THE Academic_Head SHALL be able to view a ranked list of Teachers ordered by student completion rate descending.
6. THE System SHALL maintain a Student leaderboard ranked by attendance percentage and chat activity score.
7. WHERE the gamification feature is enabled, THE System SHALL award badges to Students for achieving attendance streaks of 7, 14, and 30 consecutive present days.
8. WHERE the gamification feature is enabled, THE System SHALL display a streak counter on the Student's profile showing the current consecutive present-day count.

---

### Requirement 14: Feedback System

**User Story:** As a Student, I want to rate and comment on my Teacher after a class, so that the academy can monitor teaching quality.

#### Acceptance Criteria

1. THE Student SHALL be able to submit feedback for a Teacher with a star rating between 1 and 5 and an optional text comment.
2. THE Student SHALL be able to associate feedback with a specific class session.
3. THE Admin SHALL be able to view all feedback records with student name, teacher name, rating, comment, and timestamp.
4. THE Academic_Head SHALL be able to view all feedback records with student name, teacher name, rating, comment, and timestamp.
5. WHEN a Student attempts to view another Student's feedback submission, THE System SHALL return a FORBIDDEN error.

---

### Requirement 15: Notifications System

**User Story:** As a User, I want to receive timely in-app and push notifications, so that I am informed about classes, fees, and important events.

#### Acceptance Criteria

1. THE Notification_Engine SHALL send a class reminder notification to all enrolled Students 10 minutes before a scheduled class.
2. THE Notification_Engine SHALL send a fee-due reminder notification to a Student 3 days before a payment due date.
3. THE Notification_Engine SHALL send an overdue fee notification to a Student and all Admin users when a payment becomes overdue.
4. THE Notification_Engine SHALL send an absence alert to a Student, their Teacher, and all Admin users after 7 consecutive absent days.
5. THE Notification_Engine SHALL send a Flexibility_Request status notification to the Student when their request is approved or rejected.
6. THE Student SHALL be able to retrieve all their own notifications ordered by creation date descending.
7. THE Student SHALL be able to mark a notification as read.
8. THE Admin SHALL be able to send a broadcast notification to a specific User.

---

### Requirement 16: Discipline System

**User Story:** As an Admin, I want to log and manage rule violations, so that I can enforce community standards and take corrective action.

#### Acceptance Criteria

1. THE Admin SHALL be able to create a Violation record for a User with a type, description, and optional action taken.
2. THE Admin SHALL be able to update a Violation's status to "resolved" and record the resolution timestamp.
3. WHEN a Violation is created for a Student, THE Notification_Engine SHALL send an alert to the Student.
4. THE Admin SHALL be able to suspend a User by setting the User's status to "suspended".
5. THE Admin SHALL be able to view all Violation records with reporter name, subject user name, type, description, action, and status.
6. THE System SHALL prevent a suspended User from logging in or accessing any protected endpoint.

---

### Requirement 17: Community Group (Post-Course)

**User Story:** As a completed Student, I want to be added to a lifetime community group, so that I can continue learning after my course ends.

#### Acceptance Criteria

1. WHEN a Student's profile completion date is set, THE System SHALL automatically enrol the Student into the designated Community_Group Batch.
2. THE Community_Group Batch SHALL have no maximum student limit enforced.
3. THE Community_Group Batch SHALL provide access to daily learning materials at no additional fee.
4. WHEN a Student is enrolled in the Community_Group, THE Notification_Engine SHALL send a welcome notification to the Student.
5. THE Community_Group Batch SHALL remain accessible to the Student for the lifetime of their account.

---

### Requirement 18: Security & Data Privacy

**User Story:** As a User, I want my personal data and contact information to be protected, so that my privacy is maintained within the platform.

#### Acceptance Criteria

1. THE System SHALL never include a User's phone number in message sender data returned to other Users.
2. THE System SHALL never expose a User's password hash in any API response.
3. WHEN a Student attempts to initiate a private chat with another Student, THE System SHALL return a FORBIDDEN error.
4. THE System SHALL enforce role-based access control on all protected endpoints, returning FORBIDDEN for unauthorised role access.
5. THE System SHALL store all passwords as bcrypt hashes with a minimum cost factor of 10.
6. THE System SHALL enforce single-device login by replacing the stored device token on each new authentication.
7. THE Recording of a One_to_One_Session SHALL be accessible only to Admin and Super_Admin roles.

---

### Requirement 19: Smart Features (AI & Gamification)

**User Story:** As an Academic_Head, I want AI-based performance insights and gamification tools, so that I can proactively support weak students and motivate high performers.

#### Acceptance Criteria

1. WHERE the AI insights feature is enabled, THE System SHALL identify Students whose attendance percentage falls below 60% and flag them as "at risk" in the analytics dashboard.
2. WHERE the AI insights feature is enabled, THE System SHALL identify Teachers whose student completion rate falls below 60% and surface them in the performance dashboard.
3. WHERE the gamification feature is enabled, THE System SHALL display a Student leaderboard ranked by a composite score of attendance percentage and chat activity count.
4. WHERE the gamification feature is enabled, THE System SHALL award a "7-day streak" badge to a Student upon achieving 7 consecutive present days.
5. WHERE the gamification feature is enabled, THE System SHALL award a "30-day streak" badge to a Student upon achieving 30 consecutive present days.
6. WHERE the voice-to-text feature is enabled, THE System SHALL transcribe voice note messages and store the transcript alongside the media URL on the message record.
