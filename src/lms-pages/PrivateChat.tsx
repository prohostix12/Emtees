import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  Mic,
  X,
  ArrowLeft,
  Square,
  Play,
  Pause,
  Wifi,
  WifiOff,
  FileText,
  Video,
  Download,
  Search,
  Plus,
} from "lucide-react";
import { socket } from "@/lib/socket";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Voice Recording Limits ──────────────────────────────────────────────────
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

// ─── File Attachment Limits ──────────────────────────────────────────────────
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

// ─── VoicePlayer Component ───────────────────────────────────────────────────
interface VoicePlayerProps {
  src: string;
  isSelf: boolean;
  isActive: boolean;
  onPlayRequest: () => void;
  onEnded: () => void;
}

function VoicePlayer({ src, isSelf, isActive, onPlayRequest, onEnded }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        if (audio.duration === Infinity) {
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

    const onLoaded = () => updateDuration();
    const onDurationChange = () => updateDuration();
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
      onPlayRequest();
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
        {playing ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
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

// ─── Private Chat Page ────────────────────────────────────────────────────────
export default function PrivateChatPage() {
  const { user } = useAuth();

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Chat State
  const [selectedUser, setSelectedUser] = useState<{
    id: number;
    name: string;
    role: string;
    avatar: string | null;
    senderId?: number;
    receiverId?: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [searchContact, setSearchContact] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  // Socket State
  const [socketConnected, setSocketConnected] = useState(socket.connected);

  // Single Player Voice State
  const [activeVoiceId, setActiveVoiceId] = useState<number | null>(null);
  const clearActiveVoice = useCallback(() => setActiveVoiceId(null), []);

  // File Attachment State
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Recording State
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const voiceLimits = getVoiceLimits(user?.role ?? "student");

  // Media Recording Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const elapsedRef = useRef(0);

  // tRPC Hooks
  const conversationsQuery = trpc.privateMessage.listConversations.useQuery();
  const contactsQuery = trpc.privateMessage.listAvailableContacts.useQuery({ search: searchContact || undefined });
  const messagesQuery = trpc.privateMessage.getConversation.useQuery(
    {
      otherUserId: selectedUser?.senderId !== undefined ? (selectedUser.receiverId ?? 0) : (selectedUser?.id ?? 0),
      senderId: selectedUser?.senderId,
    },
    { enabled: !!selectedUser }
  );

  const sendMessageMutation = trpc.privateMessage.sendMessage.useMutation({
    onSuccess: () => {
      setMessage("");
      messagesQuery.refetch();
      conversationsQuery.refetch();
      setTimeout(() => scrollToBottom("smooth"), 100);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMessageMutation = trpc.privateMessage.deleteMessage.useMutation({
    onSuccess: () => {
      toast.success("Message deleted");
      messagesQuery.refetch();
      conversationsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const editMessageMutation = trpc.privateMessage.editMessage.useMutation({
    onSuccess: () => {
      toast.success("Message updated");
      setEditingMessageId(null);
      setEditingText("");
      messagesQuery.refetch();
      conversationsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedConversationId = selectedUser
    ? (selectedUser.senderId !== undefined
      ? [selectedUser.senderId, selectedUser.receiverId].sort((a: any, b: any) => a - b).join("-")
      : [user?.id, selectedUser.id].sort((a: any, b: any) => a - b).join("-"))
    : null;

  const conversations = conversationsQuery.data || [];
  const displayConversations: typeof conversations = [];
  const seenIds = new Set<string>();

  // Add the placeholder first if it doesn't exist in conversations
  if (selectedUser) {
    const isMonitored = selectedUser.senderId !== undefined;
    const expectedId = isMonitored
      ? [selectedUser.senderId, selectedUser.receiverId].sort((a: any, b: any) => a - b).join("-")
      : [user?.id, selectedUser.id].sort((a: any, b: any) => a - b).join("-");

    const exists = conversations.some((c) => c.id === expectedId);
    if (!exists) {
      displayConversations.push({
        id: expectedId,
        otherUser: {
          id: selectedUser.id,
          name: selectedUser.name,
          role: selectedUser.role,
          avatar: selectedUser.avatar ?? null,
        },
        sender: isMonitored ? { id: selectedUser.senderId!, name: "", role: "", avatar: null } : null,
        receiver: isMonitored ? { id: selectedUser.receiverId!, name: "", role: "", avatar: null } : null,
        lastMessage: "No messages yet",
        lastMessageType: "text",
        lastMessageTime: new Date(),
        unreadCount: 0,
      });
      seenIds.add(expectedId);
    }
  }

  // Add the rest of the conversations, ensuring uniqueness
  for (const conv of conversations) {
    if (!seenIds.has(conv.id)) {
      displayConversations.push(conv);
      seenIds.add(conv.id);
    } else {
      console.warn(`Duplicate conversation detected and filtered: ID=${conv.id}, name=${conv.otherUser.name}`);
    }
  }

  // Scroll Helpers
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  useEffect(() => {
    if (selectedUser) {
      setTimeout(() => scrollToBottom("auto"), 50);
    }
  }, [selectedUser, scrollToBottom]);

  // Keep scroll locked or layout contained
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

  // Sync Socket Status
  useEffect(() => {
    function onConnect() { setSocketConnected(true); }
    function onDisconnect() { setSocketConnected(false); }
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setSocketConnected(socket.connected);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  // Real-time listener for incoming, edited, and deleted private messages
  useEffect(() => {
    function onPrivateMessageNew(payload: any) {
      // Refresh conversation lists
      conversationsQuery.refetch();

      // If payload is from or to the currently opened user conversation
      if (selectedUser) {
        const isMonitored = selectedUser.senderId !== undefined;
        const matches = isMonitored
          ? (payload.senderId === selectedUser.senderId && payload.receiverId === selectedUser.receiverId) ||
            (payload.senderId === selectedUser.receiverId && payload.receiverId === selectedUser.senderId)
          : (payload.senderId === selectedUser.id && payload.receiverId === user?.id) ||
            (payload.senderId === user?.id && payload.receiverId === selectedUser.id);

        if (matches) {
          messagesQuery.refetch();
          setTimeout(() => scrollToBottom("smooth"), 100);
        }
      }
    }

    function onPrivateMessageDelete(payload: any) {
      conversationsQuery.refetch();
      if (selectedUser && messagesQuery.data?.some((m) => m.id === payload.messageId)) {
        messagesQuery.refetch();
      }
    }

    function onPrivateMessageEdit(payload: any) {
      conversationsQuery.refetch();
      if (selectedUser && messagesQuery.data?.some((m) => m.id === payload.messageId)) {
        messagesQuery.refetch();
      }
    }

    socket.on("private_message:new", onPrivateMessageNew);
    socket.on("private_message:delete", onPrivateMessageDelete);
    socket.on("private_message:edit", onPrivateMessageEdit);
    return () => {
      socket.off("private_message:new", onPrivateMessageNew);
      socket.off("private_message:delete", onPrivateMessageDelete);
      socket.off("private_message:edit", onPrivateMessageEdit);
    };
  }, [selectedUser, user, conversationsQuery, messagesQuery, scrollToBottom]);

  // Voice recording helpers
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

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
  }, [audioPreviewUrl]);

  const stopRecording = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice recording is not supported in this browser.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      toast.error("Could not access microphone.");
      return;
    }

    streamRef.current = stream;
    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
      if (blob.size > voiceLimits.maxSize) {
        toast.error(`Recording exceeds size limits.`);
        resetRecording();
        return;
      }
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
        toast.info("Maximum duration reached.");
        stopRecording();
      }
    }, 1000);
  }, [voiceLimits, resetRecording, stopRecording]);

  const handleMicClick = () => {
    if (recordingState === "idle") startRecording();
    else if (recordingState === "recording") stopRecording();
  };

  // Attachment Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    let fileType: AttachmentType;
    if (file.type.startsWith("image/")) fileType = "image";
    else if (file.type === "application/pdf") fileType = "pdf";
    else if (file.type.startsWith("video/")) fileType = "video";
    else {
      toast.error("Attach an image, PDF, or video.");
      return;
    }

    const limit = getFileLimit(user?.role ?? "student", fileType);
    if (file.size > limit) {
      toast.error("File is too large.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAttachedFile({ file, previewUrl, fileType });
  };

  const sendAttachment = () => {
    if (!attachedFile || !selectedUser) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      sendMessageMutation.mutate({
        receiverId: selectedUser.id,
        content: base64,
        type: attachedFile.fileType,
        mediaUrl: attachedFile.file.name,
      });
      URL.revokeObjectURL(attachedFile.previewUrl);
      setAttachedFile(null);
    };
    reader.readAsDataURL(attachedFile.file);
  };

  const sendVoiceMessage = () => {
    if (!audioBlob || !selectedUser) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      sendMessageMutation.mutate({
        receiverId: selectedUser.id,
        content: base64,
        type: "voice",
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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !message.trim()) return;
    sendMessageMutation.mutate({
      receiverId: selectedUser.id,
      content: message,
      type: "text",
    });
  };

  const togglePreview = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (isPlayingPreview) { audio.pause(); setIsPlayingPreview(false); }
    else { audio.play(); setIsPlayingPreview(true); }
  };

  const startChatWith = (contact: any) => {
    const isMonitoringRole = ["super_admin", "academic_head"].includes(user?.role || "");
    const existing = conversations.find((c) => {
      if (isMonitoringRole) {
        return (c.sender?.id === user?.id && c.receiver?.id === contact.id) ||
               (c.sender?.id === contact.id && c.receiver?.id === user?.id);
      } else {
        return c.otherUser.id === contact.id;
      }
    });

    if (existing) {
      setSelectedUser({
        ...existing.otherUser,
        senderId: existing.sender?.id,
        receiverId: existing.receiver?.id,
      });
    } else {
      setSelectedUser(contact);
    }
    setNewChatOpen(false);
    setSearchContact("");
  };

  return (
    <div className="flex h-[calc(100%+2rem)] md:h-[calc(100%+3rem)] w-full gap-0 md:gap-4 -mx-4 md:-mx-6 -mt-4 md:-mt-6 -mb-4 md:-mb-6 overflow-hidden">
      
      {/* ── Conversational Sidebar ── */}
      <div
        className={`flex-col bg-white border-r shrink-0 ${
          isMobile ? "w-full" : "w-80"
        } ${isMobile && selectedUser ? "hidden" : "flex"}`}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-base font-semibold text-gray-700">Messages</p>
          <div className="flex items-center gap-2">
            <span title={socketConnected ? "Connected" : "Connecting…"}>
              {socketConnected ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-gray-400 animate-pulse" />}
            </span>
            {user?.role !== "academic_head" && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                onClick={() => setNewChatOpen(true)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayConversations.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">No conversations yet</p>
              {user?.role !== "academic_head" && (
                <Button
                  variant="link"
                  className="text-emerald-600 hover:text-emerald-700 mt-2 text-xs font-semibold"
                  onClick={() => setNewChatOpen(true)}
                >
                  Start a conversation
                </Button>
              )}
            </div>
          )}
          {displayConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() =>
                setSelectedUser({
                  ...conv.otherUser,
                  senderId: (conv as any).sender?.id,
                  receiverId: (conv as any).receiver?.id,
                })
              }
              className={`w-full text-left px-4 py-3.5 border-b hover:bg-gray-50 transition-colors flex items-center gap-3 relative ${
                selectedConversationId === conv.id ? "bg-emerald-50/50" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 uppercase shrink-0">
                {conv.otherUser.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <p className="font-semibold text-sm text-gray-800 truncate">{conv.otherUser.name}</p>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {new Date(conv.lastMessageTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {conv.lastMessageType === "voice"
                    ? "🎤 Voice message"
                    : conv.lastMessageType === "image"
                    ? "🖼️ Photo attachment"
                    : conv.lastMessageType === "pdf"
                    ? "📄 PDF document"
                    : conv.lastMessageType === "video"
                    ? "🎥 Video file"
                    : conv.lastMessage}
                </p>
              </div>
              {conv.unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 min-w-[18px] text-center">
                  {conv.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Active Conversation Panel ── */}
      <div
        className={`flex-col flex-1 bg-white min-w-0 ${
          isMobile && !selectedUser ? "hidden" : "flex"
        }`}
      >
        {selectedUser ? (
          <>
            {/* Active Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0 bg-white">
              <button
                className="md:hidden p-1 rounded hover:bg-gray-100"
                onClick={() => setSelectedUser(null)}
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 uppercase shrink-0">
                {selectedUser.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 truncate">{selectedUser.name}</p>
                <p className="text-[10px] text-gray-400 capitalize">{selectedUser.role.replace(/_/g, " ")}</p>
              </div>
            </div>

            {/* Message History */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 scroll-smooth"
            >
              {messagesQuery.data?.map((msg) => {
                const isSelf = msg.senderId === user?.id;
                const showActions = user?.role === "super_admin" && editingMessageId !== msg.id;

                return (
                  <div key={msg.id} className={`flex ${isSelf ? "justify-end" : "justify-start"} items-center gap-2 group`}>
                    {showActions && isSelf && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {msg.type === "text" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-gray-400 hover:text-gray-600 rounded-full"
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditingText(msg.content);
                            }}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-400 hover:text-red-600 rounded-full"
                          onClick={() => {
                            if (confirm("Delete this message?")) {
                              deleteMessageMutation.mutate({ messageId: msg.id });
                            }
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}

                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm transition-colors duration-150 ${
                        isSelf
                          ? "bg-emerald-600 text-white rounded-br-sm"
                          : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"
                      }`}
                    >
                      {editingMessageId === msg.id ? (
                        <div className="space-y-2 py-1 min-w-[150px]">
                          <Input
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="bg-white text-gray-800 text-xs h-7 rounded border-emerald-300 focus-visible:ring-emerald-500"
                          />
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 text-[9px] text-gray-400 hover:text-gray-600 py-0 px-1.5"
                              onClick={() => {
                                setEditingMessageId(null);
                                setEditingText("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-5 text-[9px] bg-emerald-600 hover:bg-emerald-700 text-white py-0 px-1.5"
                              onClick={() => editMessageMutation.mutate({ messageId: msg.id, content: editingText })}
                              disabled={!editingText.trim() || editMessageMutation.isPending}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Render different message types */}
                          {msg.type === "voice" ? (
                            <VoicePlayer
                              src={msg.content}
                              isSelf={isSelf}
                              isActive={activeVoiceId === msg.id}
                              onPlayRequest={() => setActiveVoiceId(msg.id)}
                              onEnded={clearActiveVoice}
                            />
                          ) : msg.type === "image" ? (
                            <img
                              src={msg.content}
                              alt="Attachment"
                              className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer"
                              onClick={() => window.open(msg.content, "_blank")}
                            />
                          ) : msg.type === "pdf" ? (
                            <a
                              href={msg.content}
                              download={msg.mediaUrl || "document.pdf"}
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                                isSelf ? "bg-emerald-700 hover:bg-emerald-800 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                              }`}
                            >
                              <FileText className="w-5 h-5 shrink-0" />
                              <span className="text-xs font-medium truncate max-w-[150px]">{msg.mediaUrl || "PDF File"}</span>
                              <Download className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            </a>
                          ) : msg.type === "video" ? (
                            <video src={msg.content} controls className="rounded-lg max-w-full max-h-40" />
                          ) : (
                            <p className="break-words leading-relaxed">{msg.content}</p>
                          )}
                        </>
                      )}

                      <p className={`text-[9px] mt-1 text-right ${isSelf ? "text-emerald-100" : "text-gray-400"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    {showActions && !isSelf && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {msg.type === "text" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-gray-400 hover:text-gray-600 rounded-full"
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditingText(msg.content);
                            }}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-400 hover:text-red-600 rounded-full"
                          onClick={() => {
                            if (confirm("Delete this message?")) {
                              deleteMessageMutation.mutate({ messageId: msg.id });
                            }
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {messagesQuery.data?.length === 0 && (
                <p className="text-center text-gray-400 py-12 text-xs">No messages yet</p>
              )}
            </div>

            {/* Input Action Bar */}
            <div className="p-3 border-t bg-white shrink-0">
              {user?.role === "academic_head" ? (
                <div className="text-center py-2 text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-100 rounded-lg">
                  Read-Only Access: Academic Head cannot participate in conversations.
                </div>
              ) : (
                <>
                  {attachedFile && (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-100 p-2 rounded-lg mb-2 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        {attachedFile.fileType === "image" ? (
                          <img src={attachedFile.previewUrl} className="w-8 h-8 rounded object-cover" />
                        ) : attachedFile.fileType === "video" ? (
                          <Video className="w-5 h-5 text-gray-400" />
                        ) : (
                          <FileText className="w-5 h-5 text-red-500" />
                        )}
                        <span className="font-medium truncate">{attachedFile.file.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => setAttachedFile(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7" onClick={sendAttachment}>
                          Send File
                        </Button>
                      </div>
                    </div>
                  )}

                  {recordingState !== "idle" && (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 px-3 py-2.5 rounded-lg mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                        <span className="text-xs font-semibold text-emerald-800">
                          {recordingState === "recording" ? `Recording (${formatDuration(recordingSeconds)})` : "Voice Message Preview"}
                        </span>
                      </div>
                      {recordingState === "previewing" && audioPreviewUrl && (
                        <div className="flex items-center gap-2">
                          <audio ref={previewAudioRef} src={audioPreviewUrl} onEnded={() => setIsPlayingPreview(false)} className="hidden" />
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-700" onClick={togglePreview}>
                            {isPlayingPreview ? <Pause className="w-4.5 h-4.5" /> : <Play className="w-4.5 h-4.5 ml-0.5" />}
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={resetRecording}>
                          <X className="w-4.5 h-4.5" />
                        </Button>
                        {recordingState === "recording" ? (
                          <Button size="icon" className="bg-red-500 hover:bg-red-600 h-7 w-7 rounded-full" onClick={stopRecording}>
                            <Square className="w-3.5 h-3.5 fill-current" />
                          </Button>
                        ) : (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7" onClick={sendVoiceMessage}>
                            Send Voice
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSend} className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*,application/pdf,video/*"
                      onChange={handleFileSelect}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-gray-500 hover:text-gray-700 rounded-full"
                      disabled={recordingState !== "idle" || !!attachedFile}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="w-4.5 h-4.5" />
                    </Button>

                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={`h-9 w-9 rounded-full ${
                        recordingState === "recording" ? "bg-red-50 text-red-500 hover:bg-red-100" : "text-gray-500 hover:text-gray-700"
                      }`}
                      disabled={!!attachedFile}
                      onClick={handleMicClick}
                    >
                      <Mic className="w-4.5 h-4.5" />
                    </Button>

                    <Input
                      className="flex-1 rounded-full border-gray-200 focus-visible:ring-emerald-500 h-9.5 text-sm"
                      placeholder="Type a message…"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      disabled={recordingState !== "idle" || !!attachedFile}
                    />

                    <Button
                      type="submit"
                      size="icon"
                      className="h-9 w-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shrink-0"
                      disabled={!message.trim() || recordingState !== "idle" || !!attachedFile}
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </Button>
                  </form>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 p-6 text-center">
            <p className="text-sm text-gray-400">Select a chat conversation or start a new one to begin messaging.</p>
            {user?.role !== "academic_head" && (
              <Button
                className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold"
                onClick={() => setNewChatOpen(true)}
              >
                Start New Chat
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Contact Search Dialog ── */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9 h-9.5 text-sm"
                placeholder="Search students/teachers…"
                value={searchContact}
                onChange={(e) => setSearchContact(e.target.value)}
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {contactsQuery.data?.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => startChatWith(contact)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 uppercase shrink-0 text-sm">
                    {contact.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 truncate">{contact.name}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{contact.role.replace(/_/g, " ")}</p>
                  </div>
                </button>
              ))}
              {contactsQuery.data?.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-6">No matching contacts found</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
