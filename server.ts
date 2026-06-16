if (process.env.LOG_LEVEL === "error") {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
}

// Truncate long tRPC query params in server log outputs
const originalWrite = process.stdout.write;
process.stdout.write = function (chunk: any, encoding?: any, callback?: any): boolean {
  let str = typeof chunk === "string" ? chunk : chunk.toString();
  if (str.includes("/api/trpc/")) {
    str = str.replace(/(\/api\/trpc\/[^?\s]+)\?[^\s]*/g, "$1 ...");
  }
  return originalWrite.call(process.stdout, str, encoding, callback);
};

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { setIo } from "./server/lib/socketInstance";
import { setupSocketHandlers } from "./server/lib/socketHandlers";
import { startScheduler } from "./server/lib/scheduler";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 10 * 1024 * 1024,
  });

  setIo(io);
  setupSocketHandlers(io);
  console.log("[socket.io] WebSocket server attached to Next.js server");

  if (!process.env.VERCEL) {
    startScheduler();
    console.log("[scheduler] Background scheduler started");
  }

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
