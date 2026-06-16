import { useEffect, useState } from "react";
import { socket, connectSocket, disconnectSocket } from "@/lib/socket";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Manages the global socket.io connection lifecycle.
 *
 * - Connects when a valid token is present (user logged in).
 * - Disconnects when the token is removed (user logs out).
 * - Reconnects automatically if the token changes (e.g., token refresh).
 * - Reports connection status via the `connected` boolean.
 *
 * Usage: call this hook once, high in the component tree (e.g. Layout).
 */
export function useSocket() {
  const { token } = useAuth();
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    connectSocket(token);

    function onConnect() {
      setConnected(true);
      console.log(`[socket] successfully connected: socket.id=${socket.id}. Authorized with token preview: ${token ? token.slice(0, 10) + "..." + token.slice(-10) : "none"}`);
    }

    function onDisconnect(reason: string) {
      setConnected(false);
      console.log("[socket] disconnected from server. Reason:", reason);
    }

    function onConnectError(err: Error) {
      console.warn(
        `[socket] connection error occurred: "${err.message}". Current token length: ${token ? token.length : 0}. Token preview: ${token ? token.slice(0, 10) + "..." + token.slice(-10) : "none"}`
      );
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    // Sync initial state in case socket was already connected
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [token]);

  return { socket, connected };
}

/**
 * Listens for real-time class:started events for the current batch and shows
 * an in-app toast. Mount this in the Classes page or globally in Layout.
 */
export function useClassStartedAlert() {
  useEffect(() => {
    function onClassStarted({ title }: { batchId: number; classId: number; title: string }) {
      toast.info(`🎓 Class started: "${title}" — Join now!`, {
        duration: 8000,
        action: {
          label: "Go to Classes",
          onClick: () => (window.location.href = "/classes"),
        },
      });
    }

    socket.on("class:started", onClassStarted);
    return () => { socket.off("class:started", onClassStarted); };
  }, []);
}
