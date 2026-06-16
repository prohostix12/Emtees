import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Paperclip, Mic, X, Megaphone, ArrowLeft, Square, Play, Pause, Trash2, Wifi, WifiOff, FileText, Video, Download, MoreHorizontal } from "lucide-react";
import { socket } from "@/lib/socket";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Role-based voice recording limits ────────────────────────────────────────
const VOICE_LIMITS: Record<string, { maxDuration: number; maxSize: number }> = {
  student:       { maxDuration: 2 * 60,  maxSize: 10 * 1024 * 1024 },
  teacher:       { maxDuration: 5 * 60,  maxSize: 25 * 1024 * 1024 },
  super_admin:   { maxDuration: 10 * 60, maxSize: 50 * 1024 * 1024 },
  admin:         { maxDuration: 10 * 60, maxSize: 50 * 1024 * 1024 },
  academic_head: { maxDuration: 10 * 60, maxSize: 50 * 1024 * 1024 },
};

function getVoiceLimits(role: string) {
  return VOICE_LIMITS[role] ?? VOICE_LIMITS.student;
}

// ─── Role-based file attachment limits ──────────────────────────────────────────────
const FILE_LIMITS: Record<string, Record<"image" | "pdf" | "video", number>> = {
  student:       { image:  5 * 1024 * 1024, pdf: 10 * 1024 * 1024, video: 20 * 1024 * 1024 },
  teacher:       { image: 10 * 1024 * 1024, pdf: 25 * 1024 * 1024, video: 50 * 1024 * 1024 },
  admin:         { image: 20 * 1024 * 1024, pdf: 50 * 1024 * 1024, video: 80 * 1024 * 1024 },
};

function getFileLimit(role: string, type: "image" | "pdf" | "video"): number {
  const tier = ["super_admin", "admin", "academic_head"].includes(role) ? "admin"
             : role === "teacher" ? "teacher" : "student";
  return FILE_LIMITS[tier][type];
}

type AttachmentType = "image" | "pdf" | "video";

interface AttachedFile {
  file: File;
  previewUrl: string;
  fileType: AttachmentType;
}

type RecordingState = "idle" | "recording" | "previewing";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

// ─── VoicePlayer component ────────────────────────────────────────────────────
interface VoicePlayerProps {
  src: string;
  isSelf: boolean;
  /** True when this is the globally active (playing) player. */
  isActive: boolean;
  /** Called when the user wants to start playback — parent clears all others. */
  onPlayRequest: () => void;
  /** Called when audio finishes naturally so the parent can clear the active id. */
  onEnded: () => void;
}

function VoicePlayer({ src, isSelf, isActive, onPlayRequest, onEnded }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Wire up audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        if (audio.duration === Infinity) {
          // Large seek workaround to force browser to calculate WebM duration
          audio.currentTime = 1e101;
          const originalOnTimeUpdate = audio.ontimeupdate;
          audio.ontimeupdate = () => {
            audio.ontimeupdate = originalOnTimeUpdate;
            if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
              setDuration(audio.duration);
            }
            audio.currentTime = 0;
          };
        } else {
          setDuration(audio.duration);
        }
      }
    };

    const onLoaded = () => {
      updateDuration();
    };

    const onDurationChange = () => {
      updateDuration();
    };

    const onTimeUpdate = () => {
      if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
      } else {
        setProgress(0);
      }
    };

    const handleEnded = () => {
      setPlaying(false);
      setProgress(0);
      onEnded();
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    // Initial check in case it is already loaded
    if (audio.readyState >= 1) {
      updateDuration();
    }

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src, onEnded]);

  // Stop playback whenever another message becomes the active player
  useEffect(() => {
    if (!isActive && playing) {
      audioRef.current?.pause();
      setPlaying(false);
    }
  }, [isActive, playing]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      onPlayRequest();   // tells parent: "I am now the active player"
      audio.play().catch((err) => {
        console.error("Audio playback failed:", err);
        setPlaying(false);
      });
      setPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-[180px] max-w-[240px]" onClick={(e) => e.stopPropagation()}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isSelf
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
        }`}
      >
        {playing
          ? <Pause className="w-3.5 h-3.5 fill-current" />
          : <Play  className="w-3.5 h-3.5 fill-current ml-0.5" />
        }
      </button>
      <div className="flex-1 min-w-0 space-y-1">
        <div className={`h-1 rounded-full overflow-hidden ${isSelf ? "bg-white/30" : "bg-gray-300"}`}>
          <div
            className={`h-full rounded-full transition-all ${isSelf ? "bg-white" : "bg-emerald-500"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`text-[10px] ${isSelf ? "text-emerald-100" : "text-gray-400"}`}>
          {duration > 0 ? formatDuration(Math.floor(duration)) : "🎤 Voice"}
        </p>
      </div>
    </div>
  );
}

// ─── Main Chat Page ───────────────────────────────────────────────────────────
export default function ChatPage() {
  const { user } = useAuth();

  // Batch / message state
  const [selectedBatch, setSelectedBatch]   = useState<number | null>(null);
  const [message, setMessage]               = useState("");
  const [replyToId, setReplyToId]           = useState<number | null>(null);
  const [replyToContent, setReplyToContent] = useState<string>("");
  const [isAnnouncement, setIsAnnouncement] = useState(false);

  // Socket state
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [typingUsers, setTypingUsers]         = useState<Record<number, string>>({}); // userId → name

  // Single-player enforcement: only one voice message plays at a time
  const [activeVoiceId, setActiveVoiceId] = useState<number | null>(null);
  const clearActiveVoice = useCallback(() => setActiveVoiceId(null), []);

  // File attachment state
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [recordingState, setRecordingState]     = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob]               = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl]   = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // Message deletion state
  const [deleteTargetMessage, setDeleteTargetMessage] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isWithinOneMinute, setIsWithinOneMinute] = useState(false);

  const isAdmin          = ["super_admin", "admin", "academic_head"].includes(user?.role ?? "");
  const isTeacherOrAdmin = isAdmin || user?.role === "teacher";
  const voiceLimits      = getVoiceLimits(user?.role ?? "student");

  const deleteMessageMutation = trpc.learning.deleteMessage.useMutation({
    onSuccess: () => {
      toast.success("Message deleted successfully");
      setIsDeleteModalOpen(false);
      setDeleteTargetMessage(null);
      messagesQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleDelete = (deleteType: "everyone" | "me") => {
    if (!deleteTargetMessage) return;
    deleteMessageMutation.mutate({
      messageId: deleteTargetMessage.id,
      deleteType,
    });
  };

  useEffect(() => {
    if (!isDeleteModalOpen || !deleteTargetMessage) return;

    const checkTime = () => {
      if (isTeacherOrAdmin) {
        setIsWithinOneMinute(true);
        return;
      }
      const diff = Date.now() - new Date(deleteTargetMessage.createdAt).getTime();
      setIsWithinOneMinute(diff < 60_000);
    };

    checkTime();
    const interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, [isDeleteModalOpen, deleteTargetMessage, isTeacherOrAdmin]);

  // Refs
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<Blob[]>([]);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef         = useRef<MediaStream | null>(null);
  const previewAudioRef   = useRef<HTMLAudioElement | null>(null);
  const elapsedRef        = useRef(0);
  const typingTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef       = useRef(false);


  // ─── tRPC queries ─────────────────────────────────────────────────────────────
  const myBatches  = trpc.user.myBatches.useQuery(undefined, { enabled: !isAdmin });
  const allBatches = trpc.learning.listBatches.useQuery(undefined, { enabled: isAdmin });

  const batchList = isAdmin
    ? allBatches.data?.map((b) => ({ batchId: b.id, batch: b }))
    : myBatches.data;

  const messagesQuery = trpc.learning.listMessages.useQuery(
    { batchId: selectedBatch ?? 0, limit: 50, offset: 0 },
    {
      enabled: !!selectedBatch,
      // Keep polling at 30 s as a safety net; socket events trigger immediate refetch
      refetchInterval: 30_000,
      staleTime: 5_000,
    }
  );

  const sendMessageMutation = trpc.learning.sendMessage.useMutation({
    onSuccess: () => {
      setMessage("");
      setReplyToId(null);
      setReplyToContent("");
      setIsAnnouncement(false);
      messagesQuery.refetch();
      setShouldAutoScroll(true);
      setTimeout(() => scrollToBottom("smooth"), 100);
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Scroll-to-bottom handling ───────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
      setShouldAutoScroll(isNearBottom);
    }
  };

  const messagesCount = messagesQuery.data?.length ?? 0;
  const prevMessagesCountRef = useRef(messagesCount);

  useEffect(() => {
    if (selectedBatch) {
      setShouldAutoScroll(true);
      setTimeout(() => scrollToBottom("auto"), 50);
    }
  }, [selectedBatch, scrollToBottom]);

  useEffect(() => {
    if (messagesCount > prevMessagesCountRef.current) {
      if (shouldAutoScroll) {
        setTimeout(() => scrollToBottom("smooth"), 100);
      }
    }
    prevMessagesCountRef.current = messagesCount;
  }, [messagesCount, shouldAutoScroll, scrollToBottom]);

  // Lock parent page layout scrolling while Chat is active
  useEffect(() => {
    const parent = document.querySelector("main > div.overflow-y-auto") as HTMLElement;
    if (parent) {
      const originalOverflow = parent.style.overflow;
      parent.style.overflow = "hidden";
      return () => {
        parent.style.overflow = originalOverflow;
      };
    }
  }, []);

  // ─── Socket.io: connection status ────────────────────────────────────────────
  useEffect(() => {
    function onConnect()    { setSocketConnected(true); }
    function onDisconnect() { setSocketConnected(false); }
    socket.on("connect",    onConnect);
    socket.on("disconnect", onDisconnect);
    setSocketConnected(socket.connected);
    return () => {
      socket.off("connect",    onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  // ─── Socket.io: join / leave batch rooms ─────────────────────────────────────
  useEffect(() => {
    if (!selectedBatch) return;
    socket.emit("batch:join", { batchId: selectedBatch });

    // Immediately refetch messages when joining
    messagesQuery.refetch();

    return () => {
      socket.emit("batch:leave", { batchId: selectedBatch });
      setTypingUsers({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatch]);

  // ─── Socket.io: real-time message events ─────────────────────────────────────
  useEffect(() => {
    if (!selectedBatch) return;

    function onMessageNew({ batchId }: { batchId: number }) {
      if (batchId === selectedBatch) {
        messagesQuery.refetch();
      }
    }

    function onTyping({ batchId, userId, name, isTyping }: {
      batchId: number; userId: number; name: string; isTyping: boolean;
    }) {
      if (batchId !== selectedBatch || userId === user?.id) return;
      setTypingUsers((prev) => {
        if (isTyping) return { ...prev, [userId]: name };
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }

    socket.on("message:new", onMessageNew);
    socket.on("typing",      onTyping);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("typing",      onTyping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatch, user?.id]);

  // ─── Typing indicator emission ───────────────────────────────────────────────
  const emitTypingStop = useCallback(() => {
    if (!selectedBatch || !isTypingRef.current) return;
    socket.emit("typing:stop", { batchId: selectedBatch });
    isTypingRef.current = false;
  }, [selectedBatch]);

  const handleMessageChange = (value: string) => {
    setMessage(value);
    if (!selectedBatch) return;

    if (value.trim() && !isTypingRef.current) {
      socket.emit("typing:start", { batchId: selectedBatch });
      isTypingRef.current = true;
    }
    if (!value.trim()) {
      emitTypingStop();
    }

    // Auto-stop typing indicator after 3 s of no keystrokes
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(emitTypingStop, 3000);
  };

  // ─── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      emitTypingStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Timer helpers ────────────────────────────────────────────────────────────
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ─── Reset recording state ────────────────────────────────────────────────────
  const resetRecording = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    previewAudioRef.current?.pause();
    audioChunksRef.current = [];
    elapsedRef.current = 0;
    setRecordingState("idle");
    setRecordingSeconds(0);
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    setIsPlayingPreview(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Stop recording ───────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
  }, []);

  // ─── Start recording ──────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice recording is not supported in your browser.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        toast.error("Microphone access denied. Please enable it in your browser settings.");
      } else {
        toast.error("Could not access microphone. Please check your device.");
      }
      return;
    }

    streamRef.current = stream;
    const mimeType = getSupportedMimeType();
    const recorder  = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;
    audioChunksRef.current   = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
      if (blob.size > voiceLimits.maxSize) {
        toast.error(`Recording exceeds the ${formatBytes(voiceLimits.maxSize)} limit for your role.`);
        resetRecording();
        return;
      }
      if (blob.size < 1000) { resetRecording(); return; }
      const url = URL.createObjectURL(blob);
      setAudioBlob(blob);
      setAudioPreviewUrl(url);
      setRecordingState("previewing");
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    recorder.start(250);
    setRecordingState("recording");
    elapsedRef.current = 0;
    setRecordingSeconds(0);

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setRecordingSeconds(elapsedRef.current);
      if (elapsedRef.current >= voiceLimits.maxDuration) {
        toast.info("Maximum recording duration reached. Saving your message…");
        stopRecording();
      }
    }, 1000);
  }, [voiceLimits, resetRecording, stopRecording]);

  const handleMicClick = () => {
    if (recordingState === "idle")           startRecording();
    else if (recordingState === "recording") stopRecording();
  };

  // ─── File attachment handlers ────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be reselected
    e.target.value = "";

    // Determine attachment type from MIME
    let fileType: AttachmentType;
    if (file.type.startsWith("image/"))        fileType = "image";
    else if (file.type === "application/pdf") fileType = "pdf";
    else if (file.type.startsWith("video/"))  fileType = "video";
    else {
      toast.error("Unsupported file type. Please attach an image, PDF, or video.");
      return;
    }

    // Role-based size check
    const limit = getFileLimit(user?.role ?? "student", fileType);
    if (file.size > limit) {
      toast.error(`File is too large. Your limit for ${fileType}s is ${formatBytes(limit)}.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAttachedFile({ file, previewUrl, fileType });
  };

  const resetAttachment = () => {
    if (attachedFile) URL.revokeObjectURL(attachedFile.previewUrl);
    setAttachedFile(null);
  };

  const sendAttachment = () => {
    if (!attachedFile || !selectedBatch) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      sendMessageMutation.mutate({
        batchId:   selectedBatch,
        content:   base64,
        type:      attachedFile.fileType,
        mediaUrl:  attachedFile.file.name, // store original filename
        replyToId: replyToId ?? undefined,
      });
      URL.revokeObjectURL(attachedFile.previewUrl);
      setAttachedFile(null);
    };
    reader.readAsDataURL(attachedFile.file);
  };


  // ─── Send voice message ───────────────────────────────────────────────────────
  const sendVoiceMessage = () => {
    if (!audioBlob || !selectedBatch) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      sendMessageMutation.mutate({
        batchId: selectedBatch,
        content: base64,
        type: "voice",
        replyToId: replyToId ?? undefined,
      });
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      setAudioBlob(null);
      setAudioPreviewUrl(null);
      setRecordingState("idle");
      setRecordingSeconds(0);
      elapsedRef.current = 0;
    };
    reader.readAsDataURL(audioBlob);
  };

  const togglePreview = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (isPlayingPreview) { audio.pause(); setIsPlayingPreview(false); }
    else                  { audio.play();  setIsPlayingPreview(true); }
  };

  // ─── Send text message ────────────────────────────────────────────────────────
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch || !message.trim()) return;
    // Stop typing indicator before sending
    emitTypingStop();
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendMessageMutation.mutate({
      batchId: selectedBatch,
      content: message,
      type: "text",
      replyToId: replyToId ?? undefined,
      isAnnouncement,
    });
  };

  const handleReply = (msg: any) => {
    setReplyToId(msg.id);
    setReplyToContent(msg.type === "voice" ? "🎤 Voice message" : msg.content);
  };

  const selectedBatchName = isAdmin
    ? allBatches.data?.find((b) => b.id === selectedBatch)?.name
    : myBatches.data?.find((e) => e.batchId === selectedBatch)?.batch?.name;

  const showBatchList = !selectedBatch;

  // Typing indicator text
  const typingNames = Object.values(typingUsers);
  const typingText = typingNames.length === 1
    ? `${typingNames[0]} is typing…`
    : typingNames.length === 2
    ? `${typingNames[0]} and ${typingNames[1]} are typing…`
    : typingNames.length > 2
    ? "Several people are typing…"
    : null;

  return (
    <div className="flex h-[calc(100%+2rem)] md:h-[calc(100%+3rem)] w-full gap-0 md:gap-4 -mx-4 md:-mx-6 -mt-4 md:-mt-6 -mb-4 md:-mb-6 overflow-hidden">

      {/* ── Batch sidebar ────────────────────────────────────────────────────── */}
      <div className={`
        ${showBatchList ? "flex" : "hidden"} md:flex
        flex-col bg-white border-r
        w-full md:w-64 shrink-0
      `}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">{isAdmin ? "All Batches" : "My Batches"}</p>
          {/* Socket connection indicator */}
          <span title={socketConnected ? "Real-time connected" : "Connecting…"}>
            {socketConnected
              ? <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              : <WifiOff className="w-3.5 h-3.5 text-gray-400 animate-pulse" />
            }
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {batchList?.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No batches found</p>
          )}
          {batchList?.map((enrollment) => (
            <button
              key={enrollment.batchId}
              onClick={() => setSelectedBatch(enrollment.batchId)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
                selectedBatch === enrollment.batchId
                  ? "bg-emerald-50 border-l-4 border-l-emerald-500"
                  : ""
              }`}
            >
              <p className="font-medium text-sm">{enrollment.batch?.name}</p>
              <p className="text-xs text-gray-500">{(enrollment.batch as any)?.module?.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────────────────────────── */}
      <div className={`
        ${!showBatchList ? "flex" : "hidden"} md:flex
        flex-col flex-1 bg-white min-w-0
      `}>
        {selectedBatch ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
              <button
                className="md:hidden p-1 rounded hover:bg-gray-100"
                onClick={() => setSelectedBatch(null)}
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{selectedBatchName}</p>
                {/* Typing indicator in header on mobile */}
                {typingText && (
                  <p className="text-xs text-emerald-600 italic truncate">{typingText}</p>
                )}
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {messagesQuery.data?.length ?? 0}
              </Badge>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-3 space-y-2 scroll-smooth"
            >
                {messagesQuery.data?.slice().reverse().map((msg) => {
                  const isSelf  = msg.senderId === user?.id;
                  const isDeleted = msg.deletedAt != null;

                  if (isDeleted) {
                    return (
                      <div key={msg.id} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-3 py-2 text-sm italic text-gray-400 border bg-gray-50/50 ${
                            isSelf ? "rounded-br-sm" : "rounded-bl-sm"
                          }`}
                        >
                          {isSelf ? "You deleted this message" : "This message was deleted"}
                        </div>
                      </div>
                    );
                  }

                  const canDelete = msg.senderId === user?.id || isTeacherOrAdmin;

                  return (
                    <div key={msg.id} className={`flex items-center gap-1.5 group ${isSelf ? "justify-end" : "justify-start"}`}>
                      {isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full opacity-100 md:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleReply(msg)}>
                              Reply
                            </DropdownMenuItem>
                            {canDelete && (
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                onClick={() => {
                                  setDeleteTargetMessage(msg);
                                  setIsDeleteModalOpen(true);
                                }}
                              >
                                Delete Message
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}

                      <div
                        className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-3 py-2 text-sm transition-colors duration-150 ${
                          isSelf
                            ? "bg-emerald-600 text-white rounded-br-sm"
                            : "bg-gray-100 text-gray-800 rounded-bl-sm"
                        } ${(msg as any).isAnnouncement ? "border-2 border-yellow-400" : ""}`}
                      >
                        {!isSelf && (
                          <p className="text-xs font-semibold mb-1 opacity-80">{msg.sender?.name}</p>
                        )}
                        {(msg as any).isAnnouncement && <span className="text-xs mr-1">📢</span>}
                        {(msg as any).replyToId && (
                          <div className={`text-xs mb-1 px-2 py-1 rounded opacity-70 ${
                            isSelf ? "bg-emerald-700" : "bg-gray-200"
                          }`}>
                            ↩ Replying to a message
                          </div>
                        )}

                        {/* ─ Message content: voice / image / pdf / video / text ─ */}
                        {(msg as any).type === "voice" ? (
                          <VoicePlayer
                            src={msg.content}
                            isSelf={isSelf}
                            isActive={activeVoiceId === msg.id}
                            onPlayRequest={() => setActiveVoiceId(msg.id)}
                            onEnded={clearActiveVoice}
                          />
                        ) : (msg as any).type === "image" ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <img
                              src={msg.content}
                              alt={(msg as any).mediaUrl || "Image"}
                              className="rounded-lg max-w-full max-h-52 object-cover cursor-pointer"
                              onClick={() => window.open(msg.content, "_blank")}
                            />
                          </div>
                        ) : (msg as any).type === "pdf" ? (
                          <a
                            href={msg.content}
                            download={(msg as any).mediaUrl || "document.pdf"}
                            onClick={(e) => e.stopPropagation()}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                              isSelf
                                ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                                : "bg-gray-200 hover:bg-gray-300 text-gray-800"
                            }`}
                          >
                            <FileText className="w-5 h-5 shrink-0" />
                            <span className="text-xs font-medium truncate max-w-[160px]">
                              {(msg as any).mediaUrl || "PDF Document"}
                            </span>
                            <Download className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          </a>
                        ) : (msg as any).type === "video" ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <video
                              src={msg.content}
                              controls
                              className="rounded-lg max-w-full max-h-48"
                            />
                          </div>
                        ) : (
                          <p className="break-words">{msg.content}</p>
                        )}

                        {/* Reactions */}
                        {(msg as any).reactions && Object.keys((msg as any).reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries((msg as any).reactions as Record<string, number[]>).map(([emoji, u]) => (
                              <span key={emoji} className="text-xs bg-white/20 rounded-full px-1.5 py-0.5">
                                {emoji} {u.length}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className={`text-[10px] mt-0.5 ${isSelf ? "text-emerald-100" : "text-gray-400"}`}>
                          {msg.createdAt
                            ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : ""}
                        </p>
                      </div>

                      {!isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full opacity-100 md:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => handleReply(msg)}>
                              Reply
                            </DropdownMenuItem>
                            {canDelete && (
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                onClick={() => {
                                  setDeleteTargetMessage(msg);
                                  setIsDeleteModalOpen(true);
                                }}
                              >
                                Delete Message
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
                {messagesQuery.data?.length === 0 && (
                  <p className="text-center text-gray-400 py-10 text-sm">
                    No messages yet. Start the conversation!
                  </p>
                )}

                {/* Typing indicator bubble */}
                {typingText && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-gray-500 italic flex items-center gap-1.5">
                      <span className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </span>
                      {typingText}
                    </div>
                  </div>
                )}
            </div>

            {/* ── Input area ─────────────────────────────────────────────────── */}
            <div className="p-3 border-t shrink-0">

              {/* Reply banner */}
              {replyToId && (
                <div className="flex items-center justify-between bg-gray-100 rounded-lg px-3 py-1.5 mb-2">
                  <span className="text-gray-600 truncate text-xs">↩ {replyToContent}</span>
                  <button
                    onClick={() => { setReplyToId(null); setReplyToContent(""); }}
                    className="ml-2 shrink-0"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              )}

              {/* ── File preview bar ───────────────────────────────────────────────────── */}
              {attachedFile && recordingState === "idle" && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-2">
                  {/* Thumbnail / icon */}
                  {attachedFile.fileType === "image" ? (
                    <img
                      src={attachedFile.previewUrl}
                      alt="preview"
                      className="w-10 h-10 rounded object-cover shrink-0 border border-blue-200"
                    />
                  ) : attachedFile.fileType === "pdf" ? (
                    <div className="w-10 h-10 rounded bg-red-100 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-red-500" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded bg-purple-100 flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5 text-purple-500" />
                    </div>
                  )}
                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{attachedFile.file.name}</p>
                    <p className="text-[10px] text-gray-500">
                      {attachedFile.fileType.toUpperCase()} · {formatBytes(attachedFile.file.size)}
                    </p>
                  </div>
                  {/* Discard */}
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="w-7 h-7 text-gray-500 hover:bg-blue-100 shrink-0"
                    onClick={resetAttachment} title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {/* Send */}
                  <Button
                    type="button" size="icon"
                    className="bg-emerald-600 hover:bg-emerald-700 w-8 h-8 shrink-0"
                    onClick={sendAttachment}
                    disabled={sendMessageMutation.isPending}
                    title="Send file"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* ── Recording indicator ──────────────────────────────────────── */}
              {recordingState === "recording" && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-2">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <span className="text-red-600 font-mono text-sm font-semibold flex-1">
                    {formatDuration(recordingSeconds)}
                  </span>
                  <span className="text-xs text-red-400 shrink-0">/ {formatDuration(voiceLimits.maxDuration)}</span>
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="w-7 h-7 text-red-600 hover:bg-red-100 shrink-0"
                    onClick={stopRecording} title="Stop recording"
                  >
                    <Square className="w-3.5 h-3.5 fill-red-600 text-red-600" />
                  </Button>
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="w-7 h-7 text-gray-500 hover:bg-red-100 shrink-0"
                    onClick={resetRecording} title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* ── Preview bar ──────────────────────────────────────────────── */}
              {recordingState === "previewing" && audioPreviewUrl && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2">
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="w-8 h-8 text-emerald-700 hover:bg-emerald-100 shrink-0"
                    onClick={togglePreview}
                  >
                    {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <audio
                    ref={previewAudioRef}
                    src={audioPreviewUrl}
                    onEnded={() => setIsPlayingPreview(false)}
                    className="hidden"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Mic className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-xs text-emerald-700 font-medium">
                        Voice · {formatDuration(recordingSeconds)}
                      </span>
                      {audioBlob && (
                        <span className="text-xs text-emerald-500">({formatBytes(audioBlob.size)})</span>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="w-7 h-7 text-gray-500 hover:bg-gray-100 shrink-0"
                    onClick={resetRecording} title="Discard"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button" size="icon"
                    className="bg-emerald-600 hover:bg-emerald-700 w-8 h-8 shrink-0"
                    onClick={sendVoiceMessage}
                    disabled={sendMessageMutation.isPending}
                    title="Send voice message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* ── Normal text input ─────────────────────────────────────────── */}
              {recordingState === "idle" && (
                <form onSubmit={handleSend} className="flex items-center gap-1.5">
                  {/* Hidden file input — triggered by the Paperclip button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf,video/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {/* Paperclip — now functional */}
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="w-8 h-8 shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image, PDF or video"
                  >
                    <Paperclip className={`w-4 h-4 ${attachedFile ? "text-blue-500" : ""}`} />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="w-8 h-8 shrink-0"
                    onClick={handleMicClick}
                    title={`Record voice (max ${formatDuration(voiceLimits.maxDuration)} / ${formatBytes(voiceLimits.maxSize)})`}
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                  <Input
                    value={message}
                    onChange={(e) => handleMessageChange(e.target.value)}
                    placeholder={attachedFile ? "Add a caption (optional)…" : "Type a message…"}
                    className="flex-1 text-sm"
                  />
                  {isTeacherOrAdmin && (
                    <Button
                      type="button" size="icon"
                      variant={isAnnouncement ? "default" : "outline"}
                      className={`w-8 h-8 shrink-0 ${
                        isAnnouncement ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500" : ""
                      }`}
                      onClick={() => setIsAnnouncement(!isAnnouncement)}
                      title="Toggle announcement"
                    >
                      <Megaphone className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    type="submit" size="icon"
                    className="bg-emerald-600 hover:bg-emerald-700 w-9 h-9 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p className="text-sm">Select a batch to start chatting</p>
          </div>
        )}
      </div>

      <Dialog open={isDeleteModalOpen} onOpenChange={(open) => {
        setIsDeleteModalOpen(open);
        if (!open) setDeleteTargetMessage(null);
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Message</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this message?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Button
              variant="destructive"
              className="w-full justify-start text-left font-medium"
              onClick={() => handleDelete("me")}
              disabled={deleteMessageMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2 shrink-0" />
              Delete for Me
            </Button>
            <div className="flex flex-col gap-1 w-full">
              <Button
                variant="outline"
                className="w-full justify-start text-left border-red-200 hover:bg-red-50 hover:text-red-600 text-red-500 font-medium"
                onClick={() => handleDelete("everyone")}
                disabled={!isWithinOneMinute || deleteMessageMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                Delete for Everyone
              </Button>
              {!isWithinOneMinute && (
                <p className="text-[11px] text-gray-500 pl-2">
                  Delete for everyone is only available within 1 minute of sending.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteTargetMessage(null);
              }}
              disabled={deleteMessageMutation.isPending}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
