import { handle } from "hono/vercel";
import app from "@/../server/boot";

export const runtime = "nodejs";

const handler = handle(app);

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as DELETE,
  handler as PATCH,
  handler as OPTIONS,
};
