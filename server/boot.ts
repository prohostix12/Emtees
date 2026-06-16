import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { startScheduler, runSchedulerTasks } from "./lib/scheduler";
import { setIo } from "./lib/socketInstance";
import { setupSocketHandlers } from "./lib/socketHandlers";

const app = new Hono<{ Bindings: HttpBindings }>();

// app.use(bodyLimit({ maxSize: 100 * 1024 * 1024 })); // 100 MB to handle base64-encoded admin voice messages
app.use("/api/trpc/*", async (c) => {

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

app.get("/api/cron/scheduler", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    await runSchedulerTasks();
    return c.json({ success: true, message: "Scheduler tasks completed successfully." });
  } catch (err: any) {
    console.error("[cron scheduler] error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction && !process.env.VERCEL) {
  const { serve } = await import("@hono/node-server");
  const { Server } = await import("socket.io");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  const httpServer = serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Attach socket.io to the same Node.js HTTP server
  const io = new Server(httpServer as any, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB max socket payload
  });
  setIo(io);
  setupSocketHandlers(io);
  console.log(`[socket.io] WebSocket server attached on port ${port}`);
}

if (!process.env.VERCEL) {
  startScheduler();
}

