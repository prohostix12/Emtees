import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { setupSocketHandlers } from "../../server/lib/socketHandlers";
import { jwtSecret } from "../../server/lib/env";

describe("Socket.IO Authentication Middleware", () => {
  // Extract the middleware from setupSocketHandlers
  const getMiddleware = (): any => {
    let captured: any = null;
    const mockIo = {
      use: (fn: any) => {
        captured = fn;
      },
      on: () => {},
    } as any;
    setupSocketHandlers(mockIo);
    return captured;
  };

  const middleware = getMiddleware();

  const generateTestToken = async (
    userId: number,
    role: string,
    name: string,
    expiresIn: string = "1h",
    customSecret = jwtSecret
  ) => {
    return new SignJWT({ role, name })
      .setSubject(String(userId))
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(customSecret);
  };

  it("should authenticate a valid token successfully and populate user data", async () => {
    const token = await generateTestToken(42, "teacher", "Test Instructor");
    const mockSocket = {
      id: "socket-1",
      handshake: {
        auth: { token },
      },
      data: {},
    } as any;

    let nextCalled = false;
    let nextError: Error | undefined = undefined;

    await middleware(mockSocket, (err?: Error) => {
      nextCalled = true;
      nextError = err;
    });

    expect(nextCalled).toBe(true);
    expect(nextError).toBeUndefined();
    expect(mockSocket.data.user).toEqual({
      id: 42,
      role: "teacher",
      name: "Test Instructor",
    });
  });

  it("should reject a request with no token", async () => {
    const mockSocket = {
      id: "socket-2",
      handshake: {
        auth: {},
      },
      data: {},
    } as any;

    let nextCalled = false;
    let nextError: Error | undefined = undefined;

    await middleware(mockSocket, (err?: Error) => {
      nextCalled = true;
      nextError = err;
    });

    expect(nextCalled).toBe(true);
    expect(nextError).toBeInstanceOf(Error);
    expect(nextError?.message).toBe("Authentication required");
    expect(mockSocket.data.user).toBeUndefined();
  });

  it("should reject a token signed with an invalid secret key", async () => {
    const invalidSecret = new TextEncoder().encode("wrong-secret-key-12345");
    const token = await generateTestToken(10, "student", "Impostor User", "1h", invalidSecret);

    const mockSocket = {
      id: "socket-3",
      handshake: {
        auth: { token },
      },
      data: {},
    } as any;

    let nextCalled = false;
    let nextError: Error | undefined = undefined;

    await middleware(mockSocket, (err?: Error) => {
      nextCalled = true;
      nextError = err;
    });

    expect(nextCalled).toBe(true);
    expect(nextError).toBeInstanceOf(Error);
    expect(nextError?.message).toBe("Invalid or expired token");
    expect(mockSocket.data.user).toBeUndefined();
  });

  it("should reject an expired token", async () => {
    // Generate token that expired 1 hour ago
    const token = await new SignJWT({ role: "student", name: "Old Session" })
      .setSubject("99")
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2 hours ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
      .sign(jwtSecret);

    const mockSocket = {
      id: "socket-4",
      handshake: {
        auth: { token },
      },
      data: {},
    } as any;

    let nextCalled = false;
    let nextError: Error | undefined = undefined;

    await middleware(mockSocket, (err?: Error) => {
      nextCalled = true;
      nextError = err;
    });

    expect(nextCalled).toBe(true);
    expect(nextError).toBeInstanceOf(Error);
    expect(nextError?.message).toBe("Invalid or expired token");
    expect(mockSocket.data.user).toBeUndefined();
  });
});
