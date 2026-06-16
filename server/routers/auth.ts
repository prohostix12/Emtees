import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { eq, and, gte } from "drizzle-orm";
import { createRouter, publicQuery, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users, otpCodes } from "@db/schema";
import { getNextUniqueId } from "../lib/idGenerator";
import { phoneSchema, parseFullPhone, validatePhoneNumber, PHONE_ERROR_MESSAGE } from "@contracts/validation";

import { jwtSecret } from "../lib/env";

const generateToken = async (user: { id: number; role: string; name: string; deviceToken: string }) => {
  return new SignJWT({ role: user.role, name: user.name, sessionToken: user.deviceToken })
    .setSubject(String(user.id))
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret);
};

export const authRouter = createRouter({
  register: adminQuery
    .input(
      z.object({
        name: z.string().min(2),
        countryCode: z.string().optional(),
        phoneNumber: z.string().optional(),
        phone: z.string().optional(),
        username: z.string().min(3),
        password: z.string().min(6),
        role: z.enum(["student", "teacher", "admin", "academic_head", "super_admin"]).default("student"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.query.users.findFirst({
        where: eq(users.username, input.username),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
      }

      let countryCode = input.countryCode;
      let phoneNumber = input.phoneNumber;

      if (!countryCode || !phoneNumber) {
        if (input.phone) {
          const parsed = parseFullPhone(input.phone);
          if (parsed) {
            countryCode = parsed.countryCode;
            phoneNumber = parsed.phoneNumber;
          } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: PHONE_ERROR_MESSAGE });
          }
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Country code and phone number are required." });
        }
      }

      const valError = validatePhoneNumber(countryCode, phoneNumber);
      if (valError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: valError });
      }

      const existingPhone = await db.query.users.findFirst({
        where: and(
          eq(users.countryCode, countryCode),
          eq(users.phoneNumber, phoneNumber)
        ),
      });
      if (existingPhone) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
      }

      const formattedPhone = `${countryCode} ${phoneNumber}`;
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const uniqueId = await getNextUniqueId(input.role);
      const deviceToken = crypto.randomUUID();
      const result = await db.insert(users).values({
        unionId: uniqueId,
        name: input.name,
        phone: formattedPhone,
        countryCode,
        phoneNumber,
        username: input.username,
        password: hashedPassword,
        role: input.role,
        deviceToken,
      }).returning({ id: users.id });

      const userId = result[0]?.id;
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const token = await generateToken({ id: user.id, role: user.role, name: user.name, deviceToken });
      return { token, user: { id: user.id, name: user.name, role: user.role, phone: user.phone, unionId: user.unionId, email: user.email, mustChangePassword: user.mustChangePassword } };
    }),

  login: publicQuery
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
        deviceToken: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const user = await db.query.users.findFirst({
        where: eq(users.username, input.username),
      });
      if (!user || !user.password) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      if (user.status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account suspended" });
      }
      if (user.status === "on_hold") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account on hold" });
      }

      // Single device login: update device token
      const deviceToken = input.deviceToken ?? crypto.randomUUID();
      await db.update(users)
        .set({ deviceToken, lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      const token = await generateToken({ id: user.id, role: user.role, name: user.name, deviceToken });
      return { token, user: { id: user.id, name: user.name, role: user.role, phone: user.phone, unionId: user.unionId, email: user.email, mustChangePassword: user.mustChangePassword } };
    }),

  sendOtp: publicQuery
    .input(z.object({ phone: phoneSchema }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await db.insert(otpCodes).values({
        phone: input.phone,
        code,
        expiresAt,
      });

      // In production, send actual SMS
      return { success: true, message: "OTP sent", code }; // code returned for demo
    }),

  verifyOtp: publicQuery
    .input(z.object({ phone: phoneSchema, code: z.string().length(6), deviceToken: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const otp = await db.query.otpCodes.findFirst({
        where: and(
          eq(otpCodes.phone, input.phone),
          eq(otpCodes.code, input.code),
          eq(otpCodes.used, false),
          gte(otpCodes.expiresAt, new Date())
        ),
      });

      if (!otp) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired OTP" });
      }

      await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, otp.id));

      const parsed = parseFullPhone(input.phone);
      if (!parsed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number." });
      }

      let user = await db.query.users.findFirst({
        where: and(
          eq(users.countryCode, parsed.countryCode),
          eq(users.phoneNumber, parsed.phoneNumber)
        ),
      });
      if (!user) {
        // Auto-register
        const uniqueId = await getNextUniqueId("student");
        const formattedPhone = `${parsed.countryCode} ${parsed.phoneNumber}`;
        const result = await db.insert(users).values({
          unionId: uniqueId,
          name: `User ${parsed.phoneNumber.slice(-4)}`,
          phone: formattedPhone,
          countryCode: parsed.countryCode,
          phoneNumber: parsed.phoneNumber,
          role: "student",
        }).returning({ id: users.id });
        const userId = result[0]?.id;
        user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      }

      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (user.status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account suspended" });
      }
      if (user.status === "on_hold") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account on hold" });
      }

      const deviceToken = input.deviceToken ?? crypto.randomUUID();
      await db.update(users)
        .set({ deviceToken, lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      const token = await generateToken({ id: user.id, role: user.role, name: user.name, deviceToken });
      return { token, user: { id: user.id, name: user.name, role: user.role, phone: user.phone, unionId: user.unionId, email: user.email, mustChangePassword: user.mustChangePassword } };
    }),

  me: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
    });
    if (!user) return null;

    // Validate session token matches stored device token
    if (ctx.user.sessionToken && user.deviceToken !== ctx.user.sessionToken) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Your account has been logged in from another device. You have been signed out." });
    }

    return { id: user.id, name: user.name, role: user.role, phone: user.phone, username: user.username, status: user.status, unionId: user.unionId, email: user.email, notificationsPausedUntil: user.notificationsPausedUntil, mustChangePassword: user.mustChangePassword };
  }),
});
