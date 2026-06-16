import { handle } from "@hono/node-server/vercel";
import app from "./boot";

export const runtime = "nodejs";

export default handle(app);
