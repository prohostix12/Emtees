import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { 
  users, 
  classes, 
  oneToOneSessions, 
  teacherSalaries, 
  teacherSalaryConfigs, 
  teacherSalaryConfigAuditLogs,
  modules,
  batches
} from "../../db/schema";
import { eq } from "drizzle-orm";

describe("Teacher Salary System Integration Tests", () => {
  let superAdminId: number;
  let adminId: number;
  let academicHeadId: number;
  let teacherId: number;
  let studentId: number;
  let moduleId: number;
  let batchId: number;
  let classId: number;
  let sessionId: number;

  const cleanup = async () => {
    const db = getDb();
    
    // Cleanup generated salary records
    await db.delete(teacherSalaries).where(eq(teacherSalaries.teacherId, teacherId));
    await db.delete(teacherSalaryConfigAuditLogs).where(eq(teacherSalaryConfigAuditLogs.teacherId, teacherId));
    await db.delete(teacherSalaryConfigs).where(eq(teacherSalaryConfigs.teacherId, teacherId));

    // Cleanup classes and sessions
    await db.delete(oneToOneSessions).where(eq(oneToOneSessions.teacherId, teacherId));
    await db.delete(classes).where(eq(classes.teacherId, teacherId));

    // Cleanup batches & modules
    if (batchId) {
      await db.delete(batches).where(eq(batches.id, batchId));
    }
    if (moduleId) {
      await db.delete(modules).where(eq(modules.id, moduleId));
    }

    // Cleanup users
    await db.delete(users).where(eq(users.id, teacherId));
    await db.delete(users).where(eq(users.id, studentId));
    await db.delete(users).where(eq(users.id, superAdminId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, academicHeadId));
  };

  beforeAll(async () => {
    const db = getDb();

    // Create Super Admin
    const sa = await db.insert(users).values({
      unionId: "SA_SALARY_TEST",
      name: "Super Admin Salary",
      role: "super_admin",
      status: "active",
    }).returning({ id: users.id });
    superAdminId = sa[0].id;

    // Create Admin
    const adm = await db.insert(users).values({
      unionId: "ADM_SALARY_TEST",
      name: "Admin Salary",
      role: "admin",
      status: "active",
    }).returning({ id: users.id });
    adminId = adm[0].id;

    // Create Academic Head
    const ah = await db.insert(users).values({
      unionId: "AH_SALARY_TEST",
      name: "Academic Head Salary",
      role: "academic_head",
      status: "active",
    }).returning({ id: users.id });
    academicHeadId = ah[0].id;

    // Create Teacher
    const t = await db.insert(users).values({
      unionId: "T_SALARY_TEST",
      name: "Teacher Salary",
      role: "teacher",
      status: "active",
    }).returning({ id: users.id });
    teacherId = t[0].id;

    // Create Student
    const s = await db.insert(users).values({
      unionId: "S_SALARY_TEST",
      name: "Student Salary",
      role: "student",
      status: "active",
    }).returning({ id: users.id });
    studentId = s[0].id;

    // Create module and batch for announcements test
    const m = await db.insert(modules).values({ name: "Salary Test Module" }).returning({ id: modules.id });
    moduleId = m[0].id;

    const b = await db.insert(batches).values({
      moduleId: moduleId,
      name: "Salary Test Batch",
      timeSlot: "10:00 AM",
      teacherId: teacherId,
      status: "active",
    }).returning({ id: batches.id });
    batchId = b[0].id;

    // Mock completed classes and sessions
    // First: Create a complete class (scheduled, completed)
    const cls = await db.insert(classes).values({
      batchId: batchId, // Actual batch id
      teacherId: teacherId,
      title: "Completed Group Class",
      classType: "group",
      status: "completed",
      scheduledAt: new Date("2026-06-10T10:00:00Z"),
      startedAt: new Date("2026-06-10T10:00:00Z"),
      endedAt: new Date("2026-06-10T11:00:00Z"),
      duration: 60,
    }).returning({ id: classes.id });
    classId = cls[0].id;

    // Second: Create a completed one to one session
    const sess = await db.insert(oneToOneSessions).values({
      teacherId: teacherId,
      studentId: studentId, // Actual student id
      classId: classId,
      sessionLength: 30,
      status: "completed",
      scheduledAt: new Date("2026-06-15T14:00:00Z"),
      completedAt: new Date("2026-06-15T14:30:00Z"),
    }).returning({ id: oneToOneSessions.id });
    sessionId = sess[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("Salary Configurations", () => {
    it("should allow a Super Admin to create and update configurations", async () => {
      const saCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
      });

      // 1. Initial configuration
      let res = await saCaller.admin.updateSalaryConfig({
        teacherId,
        basicSalary: 5000,
        groupClassRate: 200,
        oneToOneRate: 150
      });
      expect(res.success).toBe(true);

      // Verify DB configuration
      const db = getDb();
      let config = await db.query.teacherSalaryConfigs.findFirst({
        where: eq(teacherSalaryConfigs.teacherId, teacherId)
      });
      expect(config).toBeDefined();
      expect(parseFloat(config!.basicSalary)).toBe(5000);
      expect(parseFloat(config!.groupClassRate)).toBe(200);
      expect(parseFloat(config!.oneToOneRate)).toBe(150);

      // Verify Audit Log
      let auditLogs = await db.query.teacherSalaryConfigAuditLogs.findMany({
        where: eq(teacherSalaryConfigAuditLogs.teacherId, teacherId)
      });
      expect(auditLogs.length).toBe(3); // three fields configured from 0 to target

      // 2. Update config and verify audit log logs the change
      res = await saCaller.admin.updateSalaryConfig({
        teacherId,
        basicSalary: 5500, // +500 change
        groupClassRate: 200, // no change
        oneToOneRate: 180 // +30 change
      });
      expect(res.success).toBe(true);

      // Verify updated config
      config = await db.query.teacherSalaryConfigs.findFirst({
        where: eq(teacherSalaryConfigs.teacherId, teacherId)
      });
      expect(parseFloat(config!.basicSalary)).toBe(5500);
      expect(parseFloat(config!.oneToOneRate)).toBe(180);

      // Verify additional audit logs exist
      auditLogs = await db.query.teacherSalaryConfigAuditLogs.findMany({
        where: eq(teacherSalaryConfigAuditLogs.teacherId, teacherId),
      });
      // There should now be 5 entries in total (3 initial, 2 new)
      expect(auditLogs.length).toBe(5);
      
      const basicSalaryLog = auditLogs.find((l) => l.fieldName === "basicSalary" && parseFloat(l.newValue) === 5500);
      const oneToOneRateLog = auditLogs.find((l) => l.fieldName === "oneToOneRate" && parseFloat(l.newValue) === 180);
      expect(basicSalaryLog).toBeDefined();
      expect(oneToOneRateLog).toBeDefined();
      expect(parseFloat(basicSalaryLog!.previousValue || "0")).toBe(5000);
      expect(parseFloat(oneToOneRateLog!.previousValue || "0")).toBe(150);
    });

    it("should prevent regular Admins or Academic Heads from modifying configurations", async () => {
      const adminCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: adminId, role: "admin", name: "Admin User", sessionToken: "" },
      });

      await expect(
        adminCaller.admin.updateSalaryConfig({
          teacherId,
          basicSalary: 6000,
          groupClassRate: 250,
          oneToOneRate: 200
        })
      ).rejects.toThrow("Only Super Admin is allowed to modify salary configurations.");

      const ahCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: academicHeadId, role: "academic_head", name: "Academic Head User", sessionToken: "" },
      });

      await expect(
        ahCaller.admin.updateSalaryConfig({
          teacherId,
          basicSalary: 6000,
          groupClassRate: 250,
          oneToOneRate: 200
        })
      ).rejects.toThrow("Only Super Admin is allowed to modify salary configurations.");

      const teacherCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId, role: "teacher", name: "Teacher User", sessionToken: "" },
      });

      await expect(
        teacherCaller.admin.updateSalaryConfig({
          teacherId,
          basicSalary: 6000,
          groupClassRate: 250,
          oneToOneRate: 200
        })
      ).rejects.toThrow("Admin access required");
    });
  });

  describe("Salary Auto-Calculation", () => {
    it("should calculate monthly earnings automatically using configured rates", async () => {
      const saCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
      });

      // Calculate for 2026-06 (June 2026)
      const salaryRecord = await saCaller.admin.calculateSalary({
        teacherId,
        month: "2026-06"
      });

      expect(salaryRecord).toBeDefined();
      expect(salaryRecord!.groupClassesCount).toBe(1); // 1 completed group class
      expect(salaryRecord!.oneToOneCount).toBe(1); // 1 completed 1-to-1 session
      expect(parseFloat(salaryRecord!.basicSalary || "0")).toBe(5500);
      expect(parseFloat(salaryRecord!.groupClassRate || "0")).toBe(200);
      expect(parseFloat(salaryRecord!.oneToOneRate || "0")).toBe(180);
      
      // Expected Total = 5500 + 1 * 200 + 1 * 180 = 5880
      expect(parseFloat(salaryRecord!.totalAmount || "0")).toBe(5880);
      expect(salaryRecord!.status).toBe("pending");
    });
  });

  describe("Teacher Dashboard & Payout Management", () => {
    it("should allow a teacher to view their own salary statement and prevent modifications", async () => {
      const teacherCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: teacherId, role: "teacher", name: "Teacher", sessionToken: "" },
      });

      const salaries = await teacherCaller.user.mySalaries();
      expect(salaries.length).toBe(1);
      expect(parseFloat(salaries[0].totalAmount || "0")).toBe(5880);

      const report = await teacherCaller.user.myExportSalaryReport({ month: "2026-06" });
      expect(report.data.salary).toBeDefined();
      expect(parseFloat(report.data.salary!.totalAmount || "0")).toBe(5880);
    });

    it("should allow a Super Admin to mark salary as paid and prevent other roles from doing so", async () => {
      const db = getDb();
      const salaryRec = await db.query.teacherSalaries.findFirst({
        where: eq(teacherSalaries.teacherId, teacherId)
      });
      expect(salaryRec).toBeDefined();

      const adminCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: adminId, role: "admin", name: "Admin User", sessionToken: "" },
      });

      await expect(
        adminCaller.admin.markSalaryPaid({
          salaryId: salaryRec!.id,
          paymentDate: new Date()
        })
      ).rejects.toThrow("Only Super Admin is allowed to mark salaries as paid.");

      const saCaller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: superAdminId, role: "super_admin", name: "Super Admin", sessionToken: "" },
      });

      const markRes = await saCaller.admin.markSalaryPaid({
        salaryId: salaryRec!.id,
        paymentDate: new Date("2026-06-30T12:00:00Z")
      });
      expect(markRes.success).toBe(true);

      const updatedRec = await db.query.teacherSalaries.findFirst({
        where: eq(teacherSalaries.id, salaryRec!.id)
      });
      expect(updatedRec!.status).toBe("paid");
      expect(updatedRec!.paymentDate).toBeDefined();
      expect(new Date(updatedRec!.paymentDate!).toISOString()).toContain("2026-06-30");
    });
  });
});
