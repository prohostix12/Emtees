import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { jwtVerify } from "jose";
import { jwtSecret } from "./lib/env";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: { id: number; role: string; name: string; sessionToken: string } | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const token = opts.req.headers.get("authorization")?.replace("Bearer ", "");
  let user = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, jwtSecret, {
        clockTolerance: 60,
      });
      user = {
        id: payload.sub ? parseInt(payload.sub) : 0,
        role: (payload.role as string) || "student",
        name: (payload.name as string) || "",
        sessionToken: (payload.sessionToken as string) || "",
      };
    } catch (err: any) {
      console.error("[tRPC Context] Token verification failed:", err?.message || err);
      user = null;
    }
  }
  return { req: opts.req, resHeaders: opts.resHeaders, user };
}
