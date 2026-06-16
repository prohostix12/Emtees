import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../server/queries/connection";
import { appRouter } from "../../server/router";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { jwtSecret } from "../../server/lib/env";

describe("Single Device Login Restriction Integration Tests", () => {
  const username = "single_device_test_user";
  const password = "password123";
  const name = "Single Device User";
  const phone = "9234567890";
  let userId: number;

  const cleanup = async () => {
    const db = getDb();
    await db.delete(users).where(eq(users.username, username));
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should enforce single active session policy across login and registration", async () => {
    const db = getDb();
    const callerPublic = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: null,
    });

    const adminCaller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: { id: 9999, role: "super_admin", name: "Admin", sessionToken: "" },
    });

    // 1. Register user
    const regRes = await adminCaller.auth.register({
      name,
      phone,
      username,
      password,
      role: "student",
    });
    
    userId = regRes.user.id;
    const tokenA = regRes.token;

    // Verify tokenA contains a sessionToken
    const { payload: payloadA } = await jwtVerify(tokenA, jwtSecret);
    const sessionTokenA = payloadA.sessionToken as string;
    expect(sessionTokenA).toBeTruthy();

    // Verify sessionTokenA matches stored deviceToken in database
    let dbUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(dbUser?.deviceToken).toBe(sessionTokenA);

    // Verify authenticated call works with tokenA
    const callerA = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: {
        id: userId,
        role: "student",
        name,
        sessionToken: sessionTokenA,
      },
    });

    // This query should succeed
    const profileA = await callerA.user.myProfile();
    expect(profileA.id).toBe(userId);

    // 2. Perform a second login (Device B)
    const loginRes = await callerPublic.auth.login({
      username,
      password,
      deviceToken: "device_token_B",
    });

    const tokenB = loginRes.token;
    const { payload: payloadB } = await jwtVerify(tokenB, jwtSecret);
    const sessionTokenB = payloadB.sessionToken as string;
    expect(sessionTokenB).toBe("device_token_B");

    // Verify database deviceToken has updated to the new token
    dbUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(dbUser?.deviceToken).toBe("device_token_B");

    // Verify authenticated call works with tokenB
    const callerB = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: {
        id: userId,
        role: "student",
        name,
        sessionToken: sessionTokenB,
      },
    });
    const profileB = await callerB.user.myProfile();
    expect(profileB.id).toBe(userId);

    // 3. Verify that querying with tokenA (Device A) now FAILS because of mismatch
    await expect(
      callerA.user.myProfile()
    ).rejects.toThrow("Your account has been logged in from another device. You have been signed out.");

    // 4. Verify that calling the 'me' query with tokenA also FAILS
    const callerMeA = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      user: {
        id: userId,
        role: "student",
        name,
        sessionToken: sessionTokenA,
      },
    });
    await expect(
      callerMeA.auth.me()
    ).rejects.toThrow("Your account has been logged in from another device. You have been signed out.");
  }, 30000);
});
