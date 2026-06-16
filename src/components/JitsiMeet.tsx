import { useRef, useState, useEffect } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { socket } from "@/lib/socket";
import { toast } from "sonner";

interface JitsiMeetProps {
  classId: number;
  onClose: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
  classInfo?: {
    title: string;
    scheduledAt: string | Date;
    teacherName?: string;
  };
  isOneToOne?: boolean;
}

export default function JitsiMeet({
  classId,
  onClose,
  onJoin,
  onLeave,
  classInfo,
  isOneToOne = false,
}: JitsiMeetProps) {
  const { user } = useAuth();
  const apiRef = useRef<any>(null);
  const [showLobbyPanel, setShowLobbyPanel] = useState(true);

  const isModerator = user?.role === "super_admin" || user?.role === "teacher";

  // Student waiting status state
  const [joinStatus, setJoinStatus] = useState<"none" | "pending" | "approved" | "declined">(
    isOneToOne || isModerator ? "approved" : "none"
  );

  // Host list of pending requests
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  // TRPC queries & mutations
  const statusQuery = trpc.class.getJoinStatus.useQuery(
    { classId },
    { enabled: !isOneToOne && !isModerator && !!user }
  );

  const requestJoinMutation = trpc.class.requestJoin.useMutation({
    onSuccess: (data) => {
      setJoinStatus(data.status);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to request entry.");
    },
  });

  const listRequestsQuery = trpc.class.listJoinRequests.useQuery(
    { classId },
    { enabled: !!isModerator && !isOneToOne }
  );

  const approveRequest = trpc.class.approveJoinRequest.useMutation({
    onSuccess: () => {
      toast.success("Student approved");
    },
    onError: (err) => toast.error(err.message),
  });

  const declineRequest = trpc.class.declineJoinRequest.useMutation({
    onSuccess: () => {
      toast.success("Student declined");
    },
    onError: (err) => toast.error(err.message),
  });

  const approveAll = trpc.class.approveAllJoinRequests.useMutation({
    onSuccess: () => {
      toast.success("Approved all pending students");
    },
    onError: (err) => toast.error(err.message),
  });

  // Details query (run once joinStatus is approved)
  const detailsQuery = trpc.class.getMeetingDetails.useQuery(
    { classId },
    { enabled: joinStatus === "approved" && !isOneToOne && !!user }
  );

  // Sync initial join status for student
  useEffect(() => {
    if (statusQuery.data) {
      setJoinStatus(statusQuery.data.status);
      // If none, automatically request join
      if (statusQuery.data.status === "none" && statusQuery.data.isEnrolled) {
        requestJoinMutation.mutate({ classId });
      }
    }
  }, [statusQuery.data]);

  // Sync initial pending list for host
  useEffect(() => {
    if (listRequestsQuery.data) {
      setPendingRequests(listRequestsQuery.data);
    }
  }, [listRequestsQuery.data]);

  // Socket connection and listeners
  useEffect(() => {
    if (!socket || isOneToOne) return;

    // Join class room
    socket.emit("class:join", { classId });

    if (isModerator) {
      // Listen for new requests
      socket.on("class:join_request_new", (req: any) => {
        if (req.classId === classId) {
          setPendingRequests((prev) => {
            if (prev.some((p) => p.studentId === req.studentId)) return prev;
            return [req, ...prev];
          });
          toast.info(`${req.studentName} wants to join the class.`);
        }
      });

      // Listen for request updates
      socket.on("class:join_request_updated", (data: any) => {
        setPendingRequests((prev) => prev.filter((p) => p.studentId !== data.studentId));
      });

      // Listen for approved all
      socket.on("class:join_request_updated_all", () => {
        setPendingRequests([]);
      });
    } else {
      // Student listens for personal status update
      socket.on("class:join_request_status", (data: any) => {
        if (data.classId === classId) {
          setJoinStatus(data.status);
          if (data.status === "approved") {
            toast.success("You have been admitted into the class!");
          }
        }
      });
    }

    return () => {
      socket.off("class:join_request_new");
      socket.off("class:join_request_updated");
      socket.off("class:join_request_updated_all");
      socket.off("class:join_request_status");
      socket.emit("class:leave", { classId });
    };
  }, [socket, classId, isModerator, isOneToOne]);

  // If student is pending, render lobby screen
  if (joinStatus === "pending") {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white">
        <div className="max-w-md w-full mx-4 p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl text-center space-y-6 shadow-2xl">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-pulse"></div>
            <div className="absolute inset-0 rounded-full border-t-4 border-emerald-500 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">🎓</span>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold tracking-tight">Waiting Room</h3>
            <p className="text-sm text-gray-400 font-light leading-relaxed">
              Waiting for the teacher to admit you into the class.<br />
              Please stay on this screen.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-all duration-300"
          >
            Cancel & Exit
          </button>
        </div>
      </div>
    );
  }

  // If student was declined, render declined screen
  if (joinStatus === "declined") {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white">
        <div className="max-w-md w-full mx-4 p-8 rounded-2xl bg-white/5 border border-red-500/20 backdrop-blur-xl text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center text-red-500 text-3xl">
            ⚠️
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold tracking-tight text-red-400">Entry Declined</h3>
            <p className="text-sm text-gray-300 font-light leading-relaxed">
              Your request to join the class was declined by the host.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-2.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-red-600/20"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // If none or loading status, show checking screen
  if (joinStatus === "none" || (joinStatus === "approved" && !isOneToOne && detailsQuery.isLoading)) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white">
        <p className="text-xs text-gray-400 animate-pulse">Requesting authorization to join class...</p>
      </div>
    );
  }

  // If details query error
  if (detailsQuery.isError) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white p-4">
        <div className="max-w-md w-full bg-white/5 border border-red-500/20 rounded-2xl p-6 text-center space-y-4">
          <p className="text-sm text-red-400">Failed to fetch meeting credentials: {detailsQuery.error.message}</p>
          <button onClick={onClose} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors">Close</button>
        </div>
      </div>
    );
  }

  const roomName = isOneToOne ? `emtees-1on1-${classId}` : detailsQuery.data?.roomName || "";
  const jwt = isOneToOne ? null : detailsQuery.data?.jwt;
  const cleanRoomName = roomName.replace(/\s+/g, "-").toLowerCase();
  const displayName = user?.name || "Anonymous";
  const email = user?.email || "";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white border-b border-gray-800 shrink-0">
        <div className="flex flex-col">
          <span className="font-semibold text-sm">📹 {classInfo?.title || roomName}</span>
          {classInfo && (
            <span className="text-gray-400 text-xs mt-0.5 font-light">
              Host: {classInfo.teacherName || "Not assigned"} | Scheduled: {new Date(classInfo.scheduledAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isModerator && !isOneToOne && (
            <button
              onClick={() => setShowLobbyPanel(!showLobbyPanel)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors flex items-center gap-1.5 ${
                showLobbyPanel
                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-800 hover:bg-emerald-950/60"
                  : "text-gray-400 border-gray-600 hover:text-white hover:border-gray-400"
              }`}
            >
              👥 Waiting Lobby
              {pendingRequests.filter((r) => r.status === "pending").length > 0 && (
                <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                  {pendingRequests.filter((r) => r.status === "pending").length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (apiRef.current) {
                apiRef.current.executeCommand("hangup");
              }
              onClose();
            }}
            className="text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded border border-gray-600 hover:border-gray-400 transition-colors"
          >
            Leave & Close
          </button>
        </div>
      </div>

      {/* Jitsi container and panel */}
      <div className="flex-1 flex flex-row w-full bg-gray-950 relative overflow-hidden">
        {/* Left Panel: Jitsi Meeting */}
        <div className="flex-1 h-full relative">
          <JitsiMeeting
            domain="meet.jit.si"
            roomName={cleanRoomName}
            jwt={jwt || undefined}
            userInfo={{
              displayName,
              email: email || "",
            }}
            configOverwrite={{
              startWithAudioMuted: false,
              startWithVideoMuted: false,
              disableDeepLinking: true,
              prejoinPageEnabled: false,
              toolbarButtons: [
                "microphone",
                "camera",
                "closedcaptions",
                "desktop",
                "fullscreen",
                "fodeviceselection",
                "hangup",
                "chat",
                ...(isModerator ? ["recording"] : []),
                "raisehand",
                "videoquality",
                "filmstrip",
                "tileview",
                "download",
                "help",
              ],
            }}
            interfaceConfigOverwrite={{
              SHOW_JITSI_WATERMARK: false,
              SHOW_WATERMARK_FOR_GUESTS: false,
            }}
            onApiReady={(externalApi) => {
              apiRef.current = externalApi;

              externalApi.addEventListener("readyToClose", () => {
                if (onLeave) onLeave();
                onClose();
              });

              externalApi.addEventListener("videoConferenceLeft", () => {
                if (onLeave) onLeave();
                onClose();
              });

              externalApi.addEventListener("videoConferenceJoined", () => {
                if (onJoin) onJoin();
              });
            }}
            getIFrameRef={(iframeRef) => {
              iframeRef.style.height = "100%";
              iframeRef.style.width = "100%";
            }}
          />
        </div>

        {/* Lobby sidebar approval panel */}
        {isModerator && !isOneToOne && showLobbyPanel && (
          <div className="w-80 border-l border-gray-800 bg-gray-900 text-white flex flex-col h-full shrink-0">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-semibold text-xs text-gray-200">
                  Lobby Waiting Room ({pendingRequests.filter((r) => r.status === "pending").length})
                </span>
              </div>
              {pendingRequests.filter((r) => r.status === "pending").length > 0 && (
                <button
                  onClick={() => approveAll.mutate({ classId })}
                  className="text-[10px] bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded font-medium text-white transition-colors"
                >
                  Accept All
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pendingRequests.filter((r) => r.status === "pending").length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2 text-gray-500 py-10">
                  <span className="text-2xl">⏳</span>
                  <p className="text-xs">No pending requests.</p>
                  <p className="text-[10px] text-gray-600 font-light px-4 leading-relaxed">
                    Enrolled students waiting for entry will show up here in real time.
                  </p>
                </div>
              ) : (
                pendingRequests
                  .filter((r) => r.status === "pending")
                  .map((req) => (
                    <div
                      key={req.studentId}
                      className="p-3 bg-gray-800/50 border border-gray-800 rounded-xl space-y-2.5"
                    >
                      <div>
                        <div className="font-medium text-xs text-gray-200 truncate">
                          {req.studentName}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {req.studentUnionId}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveRequest.mutate({ classId, studentId: req.studentId })}
                          disabled={approveRequest.isPending}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-[11px] py-1.5 rounded-lg transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => declineRequest.mutate({ classId, studentId: req.studentId })}
                          disabled={declineRequest.isPending}
                          className="flex-1 bg-gray-700 hover:bg-red-600 hover:text-white disabled:opacity-50 text-gray-300 font-semibold text-[11px] py-1.5 rounded-lg transition-all duration-300"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
