import { useState, useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Download,
  Eye,
  BookOpen,
  Video,
  FileText,
  Upload,
  Play,
  CheckCircle,
  Clock,
  ExternalLink,
  Calendar,
  User,
  GraduationCap,
  Sparkles,
  Maximize,
  Gauge
} from "lucide-react";

type ActiveTab = "notes" | "videos" | "assignments";
type VideoSubTab = "one_to_one" | "group";

export default function LearningPage() {
  const { user } = useAuth();
  const isStudent = user?.role === "student";
  const isTeacher = user?.role === "teacher";
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isStaff = isTeacher || isAdmin;

  // Tabs state
  const [activeTab, setActiveTab] = useState<ActiveTab>("notes");
  const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>("group");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("all");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("all");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("all");

  // Modules & Batches query
  const { data: modules } = trpc.learning.listModules.useQuery();
  const { data: batches } = trpc.learning.listBatches.useQuery();
  
  // Staff filters queries
  const { data: students } = trpc.user.list.useQuery({ role: "student", limit: 200 }, { enabled: isStaff });
  const { data: teachers } = trpc.user.list.useQuery({ role: "teacher", limit: 100 }, { enabled: isStaff });

  // 1. Course Notes state
  const notesQuery = trpc.learning.listNotes.useQuery({
    moduleId: selectedModuleId !== "all" ? Number(selectedModuleId) : undefined,
    batchId: selectedBatchId !== "all" ? Number(selectedBatchId) : undefined,
    search: searchQuery || undefined
  });
  
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [noteForm, setNoteForm] = useState({
    title: "",
    description: "",
    moduleId: "",
    batchId: "",
    fileType: "pdf",
    fileUrl: "",
    fileName: ""
  });

  const createNoteMutation = trpc.learning.createNote.useMutation({
    onSuccess: () => {
      toast.success("Course note uploaded successfully");
      setNoteModalOpen(false);
      notesQuery.refetch();
      resetNoteForm();
    },
    onError: (err) => toast.error(err.message)
  });

  const updateNoteMutation = trpc.learning.updateNote.useMutation({
    onSuccess: () => {
      toast.success("Course note updated successfully");
      setNoteModalOpen(false);
      setEditingNote(null);
      notesQuery.refetch();
      resetNoteForm();
    },
    onError: (err) => toast.error(err.message)
  });

  const deleteNoteMutation = trpc.learning.deleteNote.useMutation({
    onSuccess: () => {
      toast.success("Course note deleted successfully");
      notesQuery.refetch();
    },
    onError: (err) => toast.error(err.message)
  });

  // 2. Recorded Videos state
  const videosQuery = trpc.learning.listVideos.useQuery({
    sessionType: videoSubTab,
    moduleId: selectedModuleId !== "all" ? Number(selectedModuleId) : undefined,
    batchId: selectedBatchId !== "all" ? Number(selectedBatchId) : undefined,
    studentId: selectedStudentId !== "all" ? Number(selectedStudentId) : undefined,
    teacherId: selectedTeacherId !== "all" ? Number(selectedTeacherId) : undefined
  }, {
    enabled: activeTab === "videos"
  });

  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoForm, setVideoForm] = useState({
    sessionType: "group",
    studentId: "",
    batchId: "",
    teacherId: "",
    moduleId: "",
    sessionDate: "",
    duration: 30,
    videoUrl: "",
    thumbnailUrl: ""
  });

  const createVideoMutation = trpc.learning.createVideo.useMutation({
    onSuccess: () => {
      toast.success("Video recording added successfully");
      setVideoModalOpen(false);
      videosQuery.refetch();
      resetVideoForm();
    },
    onError: (err) => toast.error(err.message)
  });

  const deleteVideoMutation = trpc.learning.deleteVideo.useMutation({
    onSuccess: () => {
      toast.success("Video recording deleted successfully");
      videosQuery.refetch();
    },
    onError: (err) => toast.error(err.message)
  });

  // Custom Video Player states
  const [activeVideo, setActiveVideo] = useState<any>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoProgress, setVideoProgress] = useState<Record<number, number>>({}); // videoId -> seconds watched
  const videoRef = useRef<HTMLVideoElement>(null);

  // 3. Assignments state
  const assignmentsQuery = trpc.learning.listAssignments.useQuery({
    moduleId: selectedModuleId !== "all" ? Number(selectedModuleId) : undefined,
    batchId: selectedBatchId !== "all" ? Number(selectedBatchId) : undefined,
    search: searchQuery || undefined
  }, {
    enabled: activeTab === "assignments"
  });

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [assignmentForm, setAssignmentForm] = useState({
    title: "",
    description: "",
    moduleId: "",
    batchId: "",
    dueDate: "",
    attachmentUrl: "",
    attachmentName: ""
  });

  const createAssignmentMutation = trpc.learning.createAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment created successfully");
      setAssignmentModalOpen(false);
      assignmentsQuery.refetch();
      resetAssignmentForm();
    },
    onError: (err) => toast.error(err.message)
  });

  const updateAssignmentMutation = trpc.learning.updateAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment updated successfully");
      setAssignmentModalOpen(false);
      setEditingAssignment(null);
      assignmentsQuery.refetch();
      resetAssignmentForm();
    },
    onError: (err) => toast.error(err.message)
  });

  const deleteAssignmentMutation = trpc.learning.deleteAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment deleted successfully");
      assignmentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message)
  });

  // Student assignment submissions state
  const submissionsQuery = trpc.learning.listSubmissions.useQuery(undefined, {
    enabled: activeTab === "assignments"
  });

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<number | null>(null);
  const [submitForm, setSubmitForm] = useState({
    submissionFileUrl: "",
    submissionFileName: ""
  });

  const submitAssignmentMutation = trpc.learning.submitAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment submitted successfully!");
      setSubmitModalOpen(false);
      setSubmittingAssignmentId(null);
      submissionsQuery.refetch();
      setSubmitForm({ submissionFileUrl: "", submissionFileName: "" });
    },
    onError: (err) => toast.error(err.message)
  });

  // Teacher submissions list and review state
  const [submissionsListModalOpen, setSubmissionsListModalOpen] = useState(false);
  const [selectedAssignmentForSubmissions, setSelectedAssignmentForSubmissions] = useState<any>(null);
  const assignmentSubmissionsQuery = trpc.learning.listSubmissions.useQuery(
    { assignmentId: selectedAssignmentForSubmissions?.id },
    { enabled: !!selectedAssignmentForSubmissions }
  );

  const [gradingSubmission, setGradingSubmission] = useState<any>(null);
  const [gradingForm, setGradingForm] = useState({
    marks: "",
    feedback: "",
    status: "Reviewed"
  });

  const reviewSubmissionMutation = trpc.learning.reviewSubmission.useMutation({
    onSuccess: () => {
      toast.success("Submission graded and reviewed!");
      setGradingSubmission(null);
      assignmentSubmissionsQuery.refetch();
      submissionsQuery.refetch();
    },
    onError: (err) => toast.error(err.message)
  });

  // Load progress tracking from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("emtees_video_progress");
      if (stored) {
        try {
          setVideoProgress(JSON.parse(stored));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Sync video progress to localStorage
  const updateVideoProgress = (videoId: number, time: number) => {
    const updated = { ...videoProgress, [videoId]: time };
    setVideoProgress(updated);
    localStorage.setItem("emtees_video_progress", JSON.stringify(updated));
  };

  // Helper file converts
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: "note" | "assignment" | "submission") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large. Max limit is 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      if (type === "note") {
        setNoteForm((prev) => ({
          ...prev,
          fileUrl: base64,
          fileName: file.name
        }));
      } else if (type === "assignment") {
        setAssignmentForm((prev) => ({
          ...prev,
          attachmentUrl: base64,
          attachmentName: file.name
        }));
      } else if (type === "submission") {
        setSubmitForm((prev) => ({
          ...prev,
          submissionFileUrl: base64,
          submissionFileName: file.name
        }));
      }
      toast.success(`Loaded file: ${file.name}`);
    };
    reader.onerror = () => toast.error("Error reading file");
    reader.readAsDataURL(file);
  };

  // Resets
  const resetNoteForm = () => {
    setNoteForm({
      title: "",
      description: "",
      moduleId: "",
      batchId: "",
      fileType: "pdf",
      fileUrl: "",
      fileName: ""
    });
  };

  const resetVideoForm = () => {
    setVideoForm({
      sessionType: "group",
      studentId: "",
      batchId: "",
      teacherId: "",
      moduleId: "",
      sessionDate: "",
      duration: 30,
      videoUrl: "",
      thumbnailUrl: ""
    });
  };

  const resetAssignmentForm = () => {
    setAssignmentForm({
      title: "",
      description: "",
      moduleId: "",
      batchId: "",
      dueDate: "",
      attachmentUrl: "",
      attachmentName: ""
    });
  };

  const downloadBase64 = (base64Data: string, filename: string) => {
    const link = document.createElement("a");
    link.href = base64Data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger editing note modal
  const openEditNote = (note: any) => {
    setEditingNote(note);
    setNoteForm({
      title: note.title,
      description: note.description || "",
      moduleId: String(note.moduleId),
      batchId: String(note.batchId),
      fileType: note.fileType,
      fileUrl: note.fileUrl,
      fileName: "Existing File"
    });
    setNoteModalOpen(true);
  };

  // Trigger editing assignment modal
  const openEditAssignment = (ass: any) => {
    setEditingAssignment(ass);
    setAssignmentForm({
      title: ass.title,
      description: ass.description || "",
      moduleId: String(ass.moduleId),
      batchId: String(ass.batchId),
      dueDate: new Date(ass.dueDate).toISOString().slice(0, 16),
      attachmentUrl: ass.attachmentUrl || "",
      attachmentName: ass.attachmentName || ""
    });
    setAssignmentModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Premium Breadcrumb Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-emerald-700">Learning</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mt-1 flex items-center gap-2">
            <GraduationCap className="w-7 h-7 text-emerald-600 shrink-0" />
            Learning Management
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Access class notes, video recordings, and assignments.</p>
        </div>

        {/* Global actions based on active tab and roles */}
        <div className="flex items-center gap-2">
          {isStaff && activeTab === "notes" && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm text-sm"
              onClick={() => { setEditingNote(null); resetNoteForm(); setNoteModalOpen(true); }}
            >
              <Plus className="w-4 h-4 mr-2" /> Upload Note
            </Button>
          )}

          {isStaff && activeTab === "videos" && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm text-sm"
              onClick={() => { resetVideoForm(); setVideoForm(prev => ({ ...prev, sessionType: videoSubTab })); setVideoModalOpen(true); }}
            >
              <Plus className="w-4 h-4 mr-2" /> Upload Recording
            </Button>
          )}

          {isStaff && activeTab === "assignments" && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm text-sm"
              onClick={() => { setEditingAssignment(null); resetAssignmentForm(); setAssignmentModalOpen(true); }}
            >
              <Plus className="w-4 h-4 mr-2" /> Create Assignment
            </Button>
          )}
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex border-b border-gray-200 bg-white p-1 rounded-2xl border shadow-sm max-w-md">
        <button
          onClick={() => setActiveTab("notes")}
          className={`flex-1 py-2 text-center text-sm font-semibold rounded-xl transition-all ${
            activeTab === "notes"
              ? "bg-emerald-50 text-emerald-700 shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            Course Notes
          </div>
        </button>
        <button
          onClick={() => setActiveTab("videos")}
          className={`flex-1 py-2 text-center text-sm font-semibold rounded-xl transition-all ${
            activeTab === "videos"
              ? "bg-emerald-50 text-emerald-700 shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Video className="w-4 h-4" />
            Recorded Videos
          </div>
        </button>
        <button
          onClick={() => setActiveTab("assignments")}
          className={`flex-1 py-2 text-center text-sm font-semibold rounded-xl transition-all ${
            activeTab === "assignments"
              ? "bg-emerald-50 text-emerald-700 shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <BookOpen className="w-4 h-4" />
            Assignments
          </div>
        </button>
      </div>

      {/* Filters Panel */}
      <div className="bg-white p-4 rounded-2xl border shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Search bar (notes/assignments only) */}
        {activeTab !== "videos" ? (
          <div className="relative col-span-1 sm:col-span-2">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder={`Search ${activeTab === "notes" ? "notes" : "assignments"}…`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl border-gray-200 text-sm"
            />
          </div>
        ) : (
          <div className="flex border border-gray-200 rounded-xl p-0.5 bg-gray-50 text-xs font-semibold col-span-1 sm:col-span-2">
            <button
              onClick={() => setVideoSubTab("group")}
              className={`flex-1 py-2 text-center rounded-lg transition-all ${
                videoSubTab === "group"
                  ? "bg-white text-emerald-700 shadow-sm border"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Group Sessions
            </button>
            <button
              onClick={() => setVideoSubTab("one_to_one")}
              className={`flex-1 py-2 text-center rounded-lg transition-all ${
                videoSubTab === "one_to_one"
                  ? "bg-white text-emerald-700 shadow-sm border"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              1-to-1 Sessions
            </button>
          </div>
        )}

        {/* Module Filter */}
        <div>
          <select
            value={selectedModuleId}
            onChange={(e) => setSelectedModuleId(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Modules</option>
            {modules?.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Batch Filter */}
        <div>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Batches</option>
            {batches?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Additional staff filters for recorded videos */}
        {isStaff && activeTab === "videos" && videoSubTab === "one_to_one" && (
          <>
            <div>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Students</option>
                {students?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.profile?.enrollmentId || s.unionId})</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Teachers</option>
                {teachers?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* ────────────────── NOTES TAB VIEW ────────────────── */}
      {activeTab === "notes" && (
        <Card className="rounded-2xl border shadow-sm bg-white overflow-hidden">
          <CardContent className="p-0">
            {notesQuery.isLoading ? (
              <div className="p-12 text-center text-gray-500">Loading notes…</div>
            ) : !notesQuery.data || notesQuery.data.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <FileText className="w-12 h-12 mx-auto text-gray-200 mb-2" />
                No course notes found matching filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold text-gray-600">Title</TableHead>
                      <TableHead className="font-semibold text-gray-600">Module</TableHead>
                      <TableHead className="font-semibold text-gray-600">Batch</TableHead>
                      <TableHead className="font-semibold text-gray-600">Type</TableHead>
                      <TableHead className="font-semibold text-gray-600">Upload Date</TableHead>
                      <TableHead className="font-semibold text-gray-600 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notesQuery.data.map((note) => (
                      <TableRow key={note.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="font-medium text-gray-800">
                          <div>
                            <p className="text-sm font-semibold">{note.title}</p>
                            {note.description && <p className="text-xs text-gray-500 line-clamp-1">{note.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">{note.module?.name}</TableCell>
                        <TableCell className="text-xs text-gray-600">
                          <Badge variant="outline" className="bg-emerald-50/50 text-emerald-800 border-emerald-100">{note.batch?.name}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-50" variant="outline">
                            {note.fileType.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {new Date(note.uploadDate).toLocaleDateString(undefined, { dateStyle: "medium" })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-emerald-700 border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50"
                              onClick={() => window.open(note.fileUrl, "_blank")}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" /> View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-gray-700 hover:bg-gray-100"
                              onClick={() => downloadBase64(note.fileUrl, `${note.title}.${note.fileType}`)}
                            >
                              <Download className="w-3.5 h-3.5 mr-1" /> Download
                            </Button>
                            {isStaff && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-gray-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => openEditNote(note)}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this course note?")) {
                                      deleteNoteMutation.mutate({ id: note.id });
                                    }
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ────────────────── RECORDED VIDEOS TAB VIEW ────────────────── */}
      {activeTab === "videos" && (
        <div className="space-y-6">
          {videosQuery.isLoading ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border shadow-sm">Loading video recordings…</div>
          ) : !videosQuery.data || videosQuery.data.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border shadow-sm">
              <Video className="w-12 h-12 mx-auto text-gray-200 mb-2" />
              No video sessions found matching filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {videosQuery.data.map((video) => {
                const watchedTime = videoProgress[video.id] || 0;
                const watchedPercent = Math.min(Math.round((watchedTime / (video.duration * 60)) * 100), 100);

                return (
                  <Card key={video.id} className="rounded-2xl border shadow-sm bg-white overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
                    {/* Video Thumbnail Area */}
                    <div className="relative aspect-video bg-gray-900 flex items-center justify-center cursor-pointer group" onClick={() => { setPlaybackRate(1); setActiveVideo(video); }}>
                      {video.thumbnailUrl ? (
                        <img src={video.thumbnailUrl} alt={video.module?.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-950 to-emerald-700 flex items-center justify-center">
                          <Video className="w-12 h-12 text-white/20" />
                        </div>
                      )}
                      
                      {/* Play Button Overlay */}
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <div className="w-12 h-12 bg-white/95 rounded-full flex items-center justify-center text-emerald-600 shadow-md transform scale-90 group-hover:scale-100 transition-transform">
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </div>
                      </div>

                      {/* Duration Tag */}
                      <span className="absolute bottom-2 right-2 bg-black/75 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {video.duration} min
                      </span>
                    </div>

                    {/* Video Meta Info */}
                    <CardContent className="p-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {video.module?.name}
                          </span>
                          <span className="text-[10px] text-gray-500 font-medium">
                            {new Date(video.sessionDate).toLocaleDateString()}
                          </span>
                        </div>

                        {video.sessionType === "one_to_one" ? (
                          <h3 className="font-bold text-gray-800 text-sm line-clamp-1">
                            1-to-1 Session: {video.student?.name}
                          </h3>
                        ) : (
                          <h3 className="font-bold text-gray-800 text-sm line-clamp-1">
                            Batch Group Session: {video.batch?.name}
                          </h3>
                        )}

                        <div className="text-[11px] text-gray-500 space-y-0.5">
                          <p className="flex items-center gap-1"><User className="w-3 h-3" /> Teacher: {video.teacher?.name}</p>
                          {video.sessionType === "one_to_one" && (
                            <p className="flex items-center gap-1 text-emerald-700"><User className="w-3 h-3" /> Student: {video.student?.name}</p>
                          )}
                        </div>
                      </div>

                      {/* Progress tracking display */}
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold mb-1">
                          <span>Progress</span>
                          <span>{watchedPercent}% watched</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${watchedPercent}%` }} />
                        </div>
                      </div>

                      {/* Trash action for admins/teachers */}
                      {isStaff && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 h-auto rounded-lg"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this recorded session?")) {
                                deleteVideoMutation.mutate({ id: video.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── ASSIGNMENTS TAB VIEW ────────────────── */}
      {activeTab === "assignments" && (
        <Card className="rounded-2xl border shadow-sm bg-white overflow-hidden">
          <CardContent className="p-0">
            {assignmentsQuery.isLoading ? (
              <div className="p-12 text-center text-gray-500">Loading assignments…</div>
            ) : !assignmentsQuery.data || assignmentsQuery.data.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <BookOpen className="w-12 h-12 mx-auto text-gray-200 mb-2" />
                No assignments found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold text-gray-600">Assignment Details</TableHead>
                      <TableHead className="font-semibold text-gray-600">Module / Batch</TableHead>
                      <TableHead className="font-semibold text-gray-600">Due Date</TableHead>
                      <TableHead className="font-semibold text-gray-600">Status / Grade</TableHead>
                      <TableHead className="font-semibold text-gray-600 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignmentsQuery.data.map((ass) => {
                      // Find student submission if logged in as student
                      const studentSubmission = isStudent
                        ? submissionsQuery.data?.find((s) => s.assignmentId === ass.id)
                        : null;

                      let submissionStatus = "Pending";
                      let marksText = "-";
                      if (studentSubmission) {
                        submissionStatus = studentSubmission.status;
                        if (studentSubmission.marks !== null) {
                          marksText = `${studentSubmission.marks} marks`;
                        }
                      }

                      return (
                        <TableRow key={ass.id} className="hover:bg-gray-50/50 transition-colors">
                          <TableCell className="font-medium text-gray-800">
                            <div>
                              <p className="text-sm font-semibold">{ass.title}</p>
                              {ass.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ass.description}</p>}
                              {ass.attachmentUrl && (
                                <button
                                  onClick={() => downloadBase64(ass.attachmentUrl!, ass.attachmentName || "attachment")}
                                  className="mt-1.5 flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-bold hover:underline"
                                >
                                  <Download className="w-3 h-3" /> {ass.attachmentName || "Download Reference Material"}
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="text-xs text-gray-600">{ass.module?.name}</p>
                              <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">{ass.batch?.name}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>
                                {new Date(ass.dueDate).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </div>
                          </TableCell>
                          
                          {/* Student submission state column */}
                          <TableCell>
                            {isStudent ? (
                              <div className="space-y-1">
                                <Badge
                                  className={
                                    submissionStatus === "Pending"
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : submissionStatus === "Submitted"
                                      ? "bg-blue-50 text-blue-800 border-blue-200"
                                      : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  }
                                  variant="outline"
                                >
                                  {submissionStatus}
                                </Badge>
                                {studentSubmission?.marks !== null && (
                                  <p className="text-xs font-semibold text-emerald-700">{marksText}</p>
                                )}
                                {studentSubmission?.feedback && (
                                  <p className="text-[10px] text-gray-500 italic max-w-xs line-clamp-1">"{studentSubmission.feedback}"</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">
                                {ass.submissions?.length || 0} Submissions
                              </span>
                            )}
                          </TableCell>

                          {/* Action links */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isStudent && (
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
                                  onClick={() => { setSubmittingAssignmentId(ass.id); setSubmitModalOpen(true); }}
                                >
                                  <Upload className="w-3.5 h-3.5 mr-1" /> Submit
                                </Button>
                              )}

                              {isStaff && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-emerald-700 border-emerald-100 hover:bg-emerald-50 rounded-lg"
                                  onClick={() => { setSelectedAssignmentForSubmissions(ass); setSubmissionsListModalOpen(true); }}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" /> Submissions ({ass.submissions?.length || 0})
                                </Button>
                              )}

                              {isStaff && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-gray-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => openEditAssignment(ass)}
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => {
                                      if (confirm("Are you sure you want to delete this assignment?")) {
                                        deleteAssignmentMutation.mutate({ id: ass.id });
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ────────────────── DIALOG MODALS ────────────────── */}

      {/* 1. Upload/Edit Note Modal */}
      <Dialog open={noteModalOpen} onOpenChange={setNoteModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              {editingNote ? "Edit Course Note" : "Upload Course Note"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!noteForm.title || !noteForm.moduleId || !noteForm.batchId || !noteForm.fileUrl) {
                toast.error("Please fill in all required fields and upload a file");
                return;
              }
              if (editingNote) {
                updateNoteMutation.mutate({
                  id: editingNote.id,
                  title: noteForm.title,
                  description: noteForm.description || undefined,
                  moduleId: Number(noteForm.moduleId),
                  batchId: Number(noteForm.batchId),
                  fileType: noteForm.fileType,
                  fileUrl: noteForm.fileUrl
                });
              } else {
                createNoteMutation.mutate({
                  title: noteForm.title,
                  description: noteForm.description || undefined,
                  moduleId: Number(noteForm.moduleId),
                  batchId: Number(noteForm.batchId),
                  fileType: noteForm.fileType,
                  fileUrl: noteForm.fileUrl
                });
              }
            }}
            className="space-y-4 mt-2"
          >
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Title *</label>
              <Input
                placeholder="E.g., Module 1 Grammar Notes"
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Description</label>
              <Textarea
                placeholder="Provide a brief summary of the study materials…"
                value={noteForm.description}
                onChange={(e) => setNoteForm({ ...noteForm, description: e.target.value })}
                className="rounded-xl resize-none h-20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Module *</label>
                <select
                  value={noteForm.moduleId}
                  onChange={(e) => setNoteForm({ ...noteForm, moduleId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Module</option>
                  {modules?.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Batch *</label>
                <select
                  value={noteForm.batchId}
                  onChange={(e) => setNoteForm({ ...noteForm, batchId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Batch</option>
                  {batches?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="text-xs font-bold text-gray-600 block mb-1">File Type *</label>
                <select
                  value={noteForm.fileType}
                  onChange={(e) => setNoteForm({ ...noteForm, fileType: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="ppt">PPT</option>
                  <option value="pptx">PPTX</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1">File Attachment *</label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,.docx,.ppt,.pptx"
                    onChange={(e) => handleFileChange(e, "note")}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button type="button" variant="outline" className="w-full text-xs rounded-xl flex items-center justify-start gap-2 h-10 truncate border-dashed">
                    <Upload className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="truncate">{noteForm.fileName || "Choose document…"}</span>
                  </Button>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm mt-2"
              disabled={createNoteMutation.isPending || updateNoteMutation.isPending}
            >
              {editingNote ? "Save Changes" : "Upload Document"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Upload Video Modal */}
      <Dialog open={videoModalOpen} onOpenChange={setVideoModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              Upload Video Recording
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!videoForm.videoUrl || !videoForm.moduleId || !videoForm.teacherId || !videoForm.sessionDate) {
                toast.error("Please fill in all required fields");
                return;
              }
              createVideoMutation.mutate({
                sessionType: videoForm.sessionType as any,
                studentId: videoForm.sessionType === "one_to_one" && videoForm.studentId ? Number(videoForm.studentId) : null,
                batchId: videoForm.sessionType === "group" && videoForm.batchId ? Number(videoForm.batchId) : null,
                teacherId: Number(videoForm.teacherId),
                moduleId: Number(videoForm.moduleId),
                sessionDate: new Date(videoForm.sessionDate),
                duration: Number(videoForm.duration),
                videoUrl: videoForm.videoUrl,
                thumbnailUrl: videoForm.thumbnailUrl || null
              });
            }}
            className="space-y-4 mt-2"
          >
            <div className="flex border border-gray-200 rounded-xl p-0.5 bg-gray-50 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setVideoForm({ ...videoForm, sessionType: "group" })}
                className={`flex-1 py-1.5 text-center rounded-lg transition-all ${
                  videoForm.sessionType === "group"
                    ? "bg-white text-emerald-700 shadow-sm border"
                    : "text-gray-500"
                }`}
              >
                Group Session
              </button>
              <button
                type="button"
                onClick={() => setVideoForm({ ...videoForm, sessionType: "one_to_one" })}
                className={`flex-1 py-1.5 text-center rounded-lg transition-all ${
                  videoForm.sessionType === "one_to_one"
                    ? "bg-white text-emerald-700 shadow-sm border"
                    : "text-gray-500"
                }`}
              >
                1-to-1 Session
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Module *</label>
                <select
                  value={videoForm.moduleId}
                  onChange={(e) => setVideoForm({ ...videoForm, moduleId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Module</option>
                  {modules?.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Teacher *</label>
                <select
                  value={videoForm.teacherId}
                  onChange={(e) => setVideoForm({ ...videoForm, teacherId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Teacher</option>
                  {teachers?.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {videoForm.sessionType === "group" ? (
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Batch *</label>
                <select
                  value={videoForm.batchId}
                  onChange={(e) => setVideoForm({ ...videoForm, batchId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Batch</option>
                  {batches?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Student *</label>
                <select
                  value={videoForm.studentId}
                  onChange={(e) => setVideoForm({ ...videoForm, studentId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Student</option>
                  {students?.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.profile?.enrollmentId || s.unionId})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Session Date *</label>
                <Input
                  type="date"
                  value={videoForm.sessionDate}
                  onChange={(e) => setVideoForm({ ...videoForm, sessionDate: e.target.value })}
                  className="rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Duration (minutes) *</label>
                <Input
                  type="number"
                  value={videoForm.duration}
                  onChange={(e) => setVideoForm({ ...videoForm, duration: Number(e.target.value) })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Streaming Video URL *</label>
              <Input
                placeholder="E.g., https://example.com/recording.mp4"
                value={videoForm.videoUrl}
                onChange={(e) => setVideoForm({ ...videoForm, videoUrl: e.target.value })}
                className="rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Thumbnail Image URL (Optional)</label>
              <Input
                placeholder="E.g., https://example.com/thumbnail.png"
                value={videoForm.thumbnailUrl}
                onChange={(e) => setVideoForm({ ...videoForm, thumbnailUrl: e.target.value })}
                className="rounded-xl text-sm"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm mt-2"
              disabled={createVideoMutation.isPending}
            >
              Upload Recording Info
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Custom Streaming Video Player Dialog */}
      <Dialog open={!!activeVideo} onOpenChange={(open) => { if (!open) { setActiveVideo(null); } }}>
        <DialogContent className="sm:max-w-3xl rounded-2xl bg-black p-0 border-none overflow-hidden">
          {activeVideo && (
            <div className="flex flex-col">
              {/* Custom Header in black/white */}
              <div className="bg-neutral-900 px-5 py-4 text-white flex items-center justify-between border-b border-neutral-800">
                <div>
                  <h3 className="font-bold text-sm">
                    {activeVideo.sessionType === "group" ? `Group Session: ${activeVideo.batch?.name}` : `1-to-1 Session: ${activeVideo.student?.name}`}
                  </h3>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Module: {activeVideo.module?.name} | Teacher: {activeVideo.teacher?.name}</p>
                </div>
              </div>

              {/* Streaming Video Container */}
              <div className="relative aspect-video bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={activeVideo.videoUrl}
                  controls
                  autoPlay
                  className="w-full max-h-[460px] object-contain"
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      updateVideoProgress(activeVideo.id, videoRef.current.currentTime);
                    }
                  }}
                />
              </div>

              {/* Custom Controls Bar */}
              <div className="bg-neutral-900 p-4 border-t border-neutral-800 text-white flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
                  <span className="text-[10px] text-neutral-400 font-bold px-2 uppercase flex items-center gap-1"><Gauge className="w-3 h-3" /> Playback Speed</span>
                  {[1, 1.25, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => {
                        setPlaybackRate(speed);
                        if (videoRef.current) videoRef.current.playbackRate = speed;
                      }}
                      className={`text-xs font-bold px-2.5 py-1 rounded ${
                        playbackRate === speed
                          ? "bg-emerald-600 text-white"
                          : "text-neutral-300 hover:bg-neutral-700"
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700 hover:text-white"
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.requestFullscreen();
                      }
                    }}
                  >
                    <Maximize className="w-4 h-4 mr-1.5" /> Full Screen
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 4. Create/Edit Assignment Modal */}
      <Dialog open={assignmentModalOpen} onOpenChange={setAssignmentModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              {editingAssignment ? "Edit Assignment" : "Create Assignment"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!assignmentForm.title || !assignmentForm.moduleId || !assignmentForm.batchId || !assignmentForm.dueDate) {
                toast.error("Please fill in all required fields");
                return;
              }
              if (editingAssignment) {
                updateAssignmentMutation.mutate({
                  id: editingAssignment.id,
                  title: assignmentForm.title,
                  description: assignmentForm.description || undefined,
                  moduleId: Number(assignmentForm.moduleId),
                  batchId: Number(assignmentForm.batchId),
                  dueDate: new Date(assignmentForm.dueDate),
                  attachmentUrl: assignmentForm.attachmentUrl || null,
                  attachmentName: assignmentForm.attachmentName || null
                });
              } else {
                createAssignmentMutation.mutate({
                  title: assignmentForm.title,
                  description: assignmentForm.description || undefined,
                  moduleId: Number(assignmentForm.moduleId),
                  batchId: Number(assignmentForm.batchId),
                  dueDate: new Date(assignmentForm.dueDate),
                  attachmentUrl: assignmentForm.attachmentUrl || null,
                  attachmentName: assignmentForm.attachmentName || null
                });
              }
            }}
            className="space-y-4 mt-2"
          >
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Title *</label>
              <Input
                placeholder="E.g., Essay Submission or Lab Exercise"
                value={assignmentForm.title}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Description / Guidelines</label>
              <Textarea
                placeholder="Detail assignment instructions, formatting guidelines, etc…"
                value={assignmentForm.description}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                className="rounded-xl resize-none h-20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Module *</label>
                <select
                  value={assignmentForm.moduleId}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, moduleId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Module</option>
                  {modules?.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Batch *</label>
                <select
                  value={assignmentForm.batchId}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, batchId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Batch</option>
                  {batches?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Due Date & Time *</label>
              <Input
                type="datetime-local"
                value={assignmentForm.dueDate}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Attachment (Reference PDF/Image)</label>
              <div className="relative">
                <input
                  type="file"
                  onChange={(e) => handleFileChange(e, "assignment")}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button type="button" variant="outline" className="w-full text-xs rounded-xl flex items-center justify-start gap-2 h-10 truncate border-dashed">
                  <Upload className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{assignmentForm.attachmentName || "Upload instruction file…"}</span>
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm mt-2"
              disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}
            >
              {editingAssignment ? "Save Changes" : "Publish Assignment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Student Submit Assignment Modal */}
      <Dialog open={submitModalOpen} onOpenChange={setSubmitModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-600" />
              Submit Assignment Solution
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!submitForm.submissionFileUrl || !submittingAssignmentId) {
                toast.error("Please select a file to submit");
                return;
              }
              submitAssignmentMutation.mutate({
                assignmentId: submittingAssignmentId,
                submissionFileUrl: submitForm.submissionFileUrl,
                submissionFileName: submitForm.submissionFileName
              });
            }}
            className="space-y-4 mt-2"
          >
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Upload Work (Max 10MB PDF/DOCX/Image)</label>
              <div className="relative">
                <input
                  type="file"
                  onChange={(e) => handleFileChange(e, "submission")}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button type="button" variant="outline" className="w-full text-sm rounded-xl flex items-center justify-start gap-2 h-12 truncate border-dashed border-2 border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/50">
                  <Upload className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="truncate font-semibold text-emerald-800">
                    {submitForm.submissionFileName || "Choose solution file…"}
                  </span>
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm mt-2 h-10 font-bold"
              disabled={submitAssignmentMutation.isPending}
            >
              Submit Solution
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 6. Teacher view assignment submissions list modal */}
      <Dialog open={submissionsListModalOpen} onOpenChange={setSubmissionsListModalOpen}>
        <DialogContent className="sm:max-w-4xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              Submissions: {selectedAssignmentForSubmissions?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {assignmentSubmissionsQuery.isLoading ? (
              <p className="text-center py-6 text-gray-500">Loading submissions…</p>
            ) : !assignmentSubmissionsQuery.data || assignmentSubmissionsQuery.data.length === 0 ? (
              <p className="text-center py-6 text-gray-400">No submissions uploaded yet.</p>
            ) : (
              <div className="overflow-x-auto border rounded-xl">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Submitted Date</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Status / Grade</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignmentSubmissionsQuery.data.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-semibold text-gray-800">{sub.student?.name} ({sub.student?.profile?.enrollmentId || sub.student?.unionId})</TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {new Date(sub.submittedDate).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => downloadBase64(sub.submissionFileUrl, sub.submissionFileName || "work")}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-bold"
                          >
                            <Download className="w-3.5 h-3.5" /> {sub.submissionFileName || "Download Work"}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge
                              className={
                                sub.status === "Submitted"
                                  ? "bg-blue-50 text-blue-800 border-blue-100"
                                  : "bg-emerald-50 text-emerald-800 border-emerald-100"
                              }
                              variant="outline"
                            >
                              {sub.status}
                            </Badge>
                            {sub.marks !== null && (
                              <p className="text-xs font-bold text-emerald-700">{sub.marks} marks</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-700 border-emerald-100 bg-emerald-50/20 hover:bg-emerald-50 rounded-lg text-xs"
                            onClick={() => {
                              setGradingSubmission(sub);
                              setGradingForm({
                                marks: sub.marks !== null ? String(sub.marks) : "",
                                feedback: sub.feedback || "",
                                status: sub.status
                              });
                            }}
                          >
                            Grade / Feedback
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Grading Inner Dialog Block */}
            {gradingSubmission && (
              <div className="border border-emerald-100 bg-emerald-50/20 p-5 rounded-2xl space-y-3 mt-4">
                <h4 className="font-bold text-sm text-emerald-800">Review Submission: {gradingSubmission.student?.name}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Marks (Numeric)</label>
                    <Input
                      type="number"
                      placeholder="E.g., 85"
                      value={gradingForm.marks}
                      onChange={(e) => setGradingForm({ ...gradingForm, marks: e.target.value })}
                      className="bg-white rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Submission Status</label>
                    <select
                      value={gradingForm.status}
                      onChange={(e) => setGradingForm({ ...gradingForm, status: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="Submitted">Submitted</option>
                      <option value="Reviewed">Reviewed</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Teacher Feedback</label>
                  <Textarea
                    placeholder="E.g., Great formatting! Work on spelling in section 2…"
                    value={gradingForm.feedback}
                    onChange={(e) => setGradingForm({ ...gradingForm, feedback: e.target.value })}
                    className="bg-white rounded-xl resize-none h-16"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
                    onClick={() => {
                      reviewSubmissionMutation.mutate({
                        submissionId: gradingSubmission.id,
                        marks: gradingForm.marks ? Number(gradingForm.marks) : null,
                        feedback: gradingForm.feedback || null,
                        status: gradingForm.status
                      });
                    }}
                  >
                    Submit Grade & Review
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-gray-500 hover:bg-gray-100 rounded-xl text-xs"
                    onClick={() => setGradingSubmission(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
