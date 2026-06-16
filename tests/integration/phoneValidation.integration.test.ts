import { describe, it, expect } from "vitest";
import { appRouter } from "../../server/router";

describe("Phone Number Validation Integration Tests", () => {
  const adminCaller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user: { id: 1, role: "super_admin", name: "Admin", sessionToken: "" },
  });

  const publicCaller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user: null,
  });

  const invalidPhones = [
    "1234567890", // first digit 1
    "5999999999", // first digit 5
    "999999999",  // 9 digits
    "99999999999", // 11 digits
    "99999a9999", // contains non-numeric character
    "999 999999", // contains space
    "999999999-", // contains special character
  ];

  describe("auth.register validation", () => {
    it.each(invalidPhones)("should reject invalid phone: %s", async (phone) => {
      await expect(
        adminCaller.auth.register({
          name: "Test User",
          phone,
          username: `user_${Math.random().toString(36).slice(2, 7)}`,
          password: "password123",
          role: "student",
        })
      ).rejects.toThrow("Please enter a valid 10-digit mobile number.");
    });
  });

  describe("auth.sendOtp validation", () => {
    it.each(invalidPhones)("should reject invalid phone: %s", async (phone) => {
      await expect(
        publicCaller.auth.sendOtp({ phone })
      ).rejects.toThrow("Please enter a valid 10-digit mobile number.");
    });
  });

  describe("auth.verifyOtp validation", () => {
    it.each(invalidPhones)("should reject invalid phone: %s", async (phone) => {
      await expect(
        publicCaller.auth.verifyOtp({
          phone,
          code: "123456",
        })
      ).rejects.toThrow("Please enter a valid 10-digit mobile number.");
    });
  });

  describe("user.create validation", () => {
    it.each(invalidPhones)("should reject invalid phone: %s", async (phone) => {
      await expect(
        adminCaller.user.create({
          name: "Admin Created",
          phone,
          username: `admin_user_${Math.random().toString(36).slice(2, 7)}`,
          password: "password123",
          role: "student",
          courseId: 1,
          batchId: 1,
        })
      ).rejects.toThrow("Please enter a valid 10-digit mobile number.");
    });
  });

  describe("user.update validation", () => {
    it.each(invalidPhones)("should reject invalid phone: %s", async (phone) => {
      await expect(
        adminCaller.user.update({
          id: 99999, // dummy id
          phone,
        })
      ).rejects.toThrow("Please enter a valid 10-digit mobile number.");
    });
  });

  describe("user.importStudents validation", () => {
    it("should reject when one or more phone numbers are invalid", async () => {
      await expect(
        adminCaller.user.importStudents([
          { name: "Valid Student", phone: "9876543210" },
          { name: "Invalid Student", phone: "1234567890" },
        ])
      ).rejects.toThrow("Please enter a valid 10-digit mobile number.");
    });
  });

  describe("International Phone Validation", () => {
    it("should accept valid UAE number via user.create", async () => {
      const username = `uae_user_${Math.random().toString(36).slice(2, 7)}`;
      const randomUaePhone = Math.floor(500000000 + Math.random() * 400000000).toString(); // 9 digits
      const user = await adminCaller.user.create({
        name: "UAE Teacher",
        countryCode: "+971",
        phoneNumber: randomUaePhone,
        username,
        password: "password123",
        role: "teacher",
      });
      expect(user.countryCode).toBe("+971");
      expect(user.phoneNumber).toBe(randomUaePhone);
      expect(user.phone).toBe(`+971 ${randomUaePhone}`);
    });

    it("should reject invalid length UAE number via user.create", async () => {
      const username = `uae_user_${Math.random().toString(36).slice(2, 7)}`;
      const randomInvalidUaePhone = Math.floor(5000000000 + Math.random() * 4000000000).toString(); // 10 digits
      await expect(
        adminCaller.user.create({
          name: "UAE Teacher",
          countryCode: "+971",
          phoneNumber: randomInvalidUaePhone,
          username,
          password: "password123",
          role: "teacher",
        })
      ).rejects.toThrow("Phone number must be exactly 9 digits for UAE.");
    });

    it("should enforce uniqueness of country_code + phone_number combination", async () => {
      const username1 = `unique_user_1_${Math.random().toString(36).slice(2, 7)}`;
      const username2 = `unique_user_2_${Math.random().toString(36).slice(2, 7)}`;
      const uniqueNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
      const digits = uniqueNumber;
      
      // First creation should succeed
      await adminCaller.user.create({
        name: "First User",
        countryCode: "+1",
        phoneNumber: digits, // 10 digits
        username: username1,
        password: "password123",
        role: "teacher",
      });

      // Second creation with same countryCode + phoneNumber should fail with CONFLICT
      await expect(
        adminCaller.user.create({
          name: "Second User",
          countryCode: "+1",
          phoneNumber: digits,
          username: username2,
          password: "password123",
          role: "teacher",
        })
      ).rejects.toThrow("Phone already registered");
    });
  });
});
