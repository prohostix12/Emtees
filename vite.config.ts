import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import type { Plugin, ViteDevServer } from "vite"

/**
 * Vite plugin: attach socket.io to Vite's own HTTP server during development.
 *
 * This keeps socket.io in the same Node.js process as the Hono/tRPC dev server
 * so that tRPC procedures can emit events via the shared `global.__io` singleton.
 */
function socketIoDevPlugin(): Plugin {
  return {
    name: "socket-io-dev",
    apply: "serve", // dev mode only
    configureServer: async (server: ViteDevServer) => {
      // Wait until the HTTP server is ready before attaching
      server.httpServer?.once("listening", async () => {
        const { Server } = await import("socket.io");
        const { setIo } = await import("./server/lib/socketInstance");
        const { setupSocketHandlers } = await import("./server/lib/socketHandlers");

        const io = new Server(server.httpServer as any, {
          cors: { origin: "*", methods: ["GET", "POST"] },
          maxHttpBufferSize: 10 * 1024 * 1024,
        });

        setIo(io);
        setupSocketHandlers(io);
        console.log("[socket.io] WebSocket server attached to Vite dev server");
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    socketIoDevPlugin(),
    devServer({ entry: "server/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
