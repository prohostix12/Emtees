import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { getNextUniqueId } from "../../server/lib/idGenerator";
import { users, idSequences } from "../../db/schema";
import { eq, or, inArray } from "drizzle-orm";
import { appRouter } from "../../server/router";

describe("ID Generator Integration Tests", () => {
  const testStudentPhone = "9999999999";
  const testTeacherPhone = "8888888888";

  // Clean up any test records we might create
  const cleanup = async () => {
    const db = getDb();
    await db.delete(users).where(
      or(
        eq(users.phone, testStudentPhone),
        eq(users.phoneNumber, testStudentPhone),
        eq(users.phone, testTeacherPhone),
        eq(users.phoneNumber, testTeacherPhone)
      )
    );
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should generate student ID starting with configured prefix and padded to 4 digits", async () => {
    const prefix = process.env.STUDENT_ID_PREFIX || "STU";
    const regex = new RegExp(`^${prefix}\\d{4}$`);

    const studentId1 = await getNextUniqueId("student");
    expect(studentId1).toMatch(regex);

    const studentId2 = await getNextUniqueId("student");
    expect(studentId2).toMatch(regex);

    const num1 = parseInt(studentId1.slice(prefix.length), 10);
    const num2 = parseInt(studentId2.slice(prefix.length), 10);
    expect(num2).toBe(num1 + 1);
  });

  it("should generate teacher ID starting with T and padded to 3 digits", async () => {
    const teacherId1 = await getNextUniqueId("teacher");
    expect(teacherId1).toMatch(/^T\d{3,}$/);

    const teacherId2 = await getNextUniqueId("teacher");
    expect(teacherId2).toMatch(/^T\d{3,}$/);

    const num1 = parseInt(teacherId1.slice(1), 10);
    const num2 = parseInt(teacherId2.slice(1), 10);
    expect(num2).toBe(num1 + 1);
  });

  it("should generate admin ID starting with A and padded to 2 digits", async () => {
    const adminId1 = await getNextUniqueId("admin");
    expect(adminId1).toMatch(/^A\d{2,}$/);

    const adminId2 = await getNextUniqueId("admin");
    expect(adminId2).toMatch(/^A\d{2,}$/);

    const num1 = parseInt(adminId1.slice(1), 10);
    const num2 = parseInt(adminId2.slice(1), 10);
    expect(num2).toBe(num1 + 1);
  });

  it("should handle concurrent ID generations without duplicates", async () => {
    const prefix = process.env.STUDENT_ID_PREFIX || "STU";
    const regex = new RegExp(`^${prefix}\\d{4}$`);

    // Generate 10 IDs concurrently
    const promises = Array.from({ length: 10 }, () => getNextUniqueId("student"));
    const generatedIds = await Promise.all(promises);

    // Verify all generated IDs are unique
    const uniqueIds = new Set(generatedIds);
    expect(uniqueIds.size).toBe(10);
    for (const id of generatedIds) {
      expect(id).toMatch(regex);
    }
  });

  describe("importStudents validation tests", () => {
    const prefix = process.env.STUDENT_ID_PREFIX || "STU";
    const testPhones = ["9990001111", "9990002222", "9990003333"];

    const cleanupImports = async () => {
      const db = getDb();
      await db.delete(users).where(
        or(
          inArray(users.phone, testPhones),
          inArray(users.phoneNumber, testPhones)
        )
      );
    };

    beforeAll(async () => {
      await cleanupImports();
    });

    afterAll(async () => {
      await cleanupImports();
    });

    it("should generate sequential IDs when userId is omitted during import", async () => {
      const db = getDb();
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
      });

      const importResult = await caller.user.importStudents([
        { name: "Import Student A", phone: testPhones[0] },
      ]);
      expect(importResult.imported).toBe(1);

      const created = await db.query.users.findFirst({
        where: eq(users.phoneNumber, testPhones[0]),
      });
      expect(created).toBeDefined();
      expect(created?.unionId).toMatch(new RegExp(`^${prefix}\\d{4}$`));
    });

    it("should allow import with a valid sequential custom ID", async () => {
      const db = getDb();
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
      });

      const customId = `${prefix}8888`;
      const importResult = await caller.user.importStudents([
        { name: "Import Student B", phone: testPhones[1], userId: customId },
      ]);
      expect(importResult.imported).toBe(1);

      const created = await db.query.users.findFirst({
        where: eq(users.phoneNumber, testPhones[1]),
      });
      expect(created).toBeDefined();
      expect(created?.unionId).toBe(customId);
    });

    it("should reject import with an invalid custom user ID", async () => {
      const caller = appRouter.createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
      });

      await expect(
        caller.user.importStudents([
          { name: "Import Student C", phone: testPhones[2], userId: "INVALID_ID_123" },
        ])
      ).rejects.toThrow(/Invalid User ID/);
    });
  });
});
