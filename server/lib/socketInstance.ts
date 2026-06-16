import type { Server } from "socket.io";

// Store on global so the reference survives Vite HMR module re-evaluation.
declare global {
  // eslint-disable-next-line no-var
  var __io: Server | undefined;
}

/**
 * Store the socket.io Server instance globally.
 * Called once: in the Vite plugin (dev) or in boot.ts (production).
 */
export function setIo(instance: Server): void {
  global.__io = instance;
}

/**
 * Retrieve the active socket.io Server instance.
 * Returns null before the server has been initialised.
 */
export function getIo(): Server | null {
  return global.__io ?? null;
}
