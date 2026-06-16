import { io, Socket } from "socket.io-client";

/**
 * Singleton socket.io client.
 *
 * - Connects to the same origin (works for both Vite dev server and production).
 * - `autoConnect: false` so we connect explicitly once we have a JWT token.
 * - Reconnection is handled automatically by socket.io-client.
 */
const socket: Socket = io({
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

/**
 * Connect (or reconnect) the socket with the current JWT token.
 * Safe to call multiple times — re-uses the existing connection if already open.
 */
export function connectSocket(token: string): void {
  const oldToken = socket.auth && (socket.auth as any).token;
  socket.auth = { token };

  if (oldToken && oldToken !== token) {
    console.log("[socket] Authentication token changed, reconnecting with new token...");
    socket.disconnect().connect();
  } else if (!socket.connected) {
    console.log("[socket] Connecting socket...");
    socket.connect();
  }
}

/**
 * Disconnect and clean up the socket connection.
 */
export function disconnectSocket(): void {
  socket.disconnect();
}

export { socket };
