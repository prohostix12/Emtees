import { useState, useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Play, Square, Video, Calendar, Clock, XCircle, ClipboardList, Edit3 } from "lucide-react";
import dynamic from "next/dynamic";
const JitsiMeet = dynamic(() => import("@/components/JitsiMeet"), { ssr: false });

function OngoingTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const update = () => {
      const now = new Date().getTime();
      setSeconds(Math.max(0, Math.floor((now - start) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (num: number) => String(num).padStart(2, "0");

  return (
    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
      {hrs > 0 ? `${pad(hrs)}:` : ""}{pad(mins)}:{pad(secs)}
    </span>
  );
}

export default function ClassesPage({ type }: { type?: "group" | "one-to-one" }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  
  const [attendanceClassId, setAttendanceClassId] = useState<number | null>(null);
  const [attendanceStudentId, setAttendanceStudentId] = useState("");
  const [attendanceChatCount, setAttendanceChatCount] = useState(0);
  const [otoOpen, setOtoOpen] = useState(false);
  const [otoEditOpen, setOtoEditOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [teacherRescheduleOpen, setTeacherRescheduleOpen] = useState(false);
  const [selectedOtoSession, setSelectedOtoSession] = useState<any>(null);
  const [otoForm, setOtoForm] = useState({ teacherId: 0, studentId: 0, sessionLength: 30, scheduledAt: "", title: "1-to-1 Session", remarks: "" });
  const [rescheduleForm, setRescheduleForm] = useState({ proposedScheduledAt: "", reason: "" });

  const [selectedEnrollmentForSchedule, setSelectedEnrollmentForSchedule] = useState<any>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const [endingSession, setEndingSession] = useState<any>(null);
  const [endRemarks, setEndRemarks] = useState("");
  const [endSessionOpen, setEndSessionOpen] = useState(false);

  const handleOpenTeacherReschedule = (s: any) => {
    setSelectedOtoSession(s);
    setRescheduleForm({ proposedScheduledAt: "", reason: "" });
    setTeacherRescheduleOpen(true);
  };

  // Jitsi state
  const [jitsiRoom, setJitsiRoom] = useState<string | null>(null);
  const [selectedClassForMeeting, setSelectedClassForMeeting] = useState<any>(null);

  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isSuperAdmin = user?.role === "super_admin";
  const isTeacher = user?.role === "teacher";
  const canManageClasses = isAdmin || isTeacher;

  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const handleClassUpdated = () => {
      classesQuery.refetch();
      myClasses.refetch();
      oneToOneQuery.refetch();
      allocationsQuery.refetch();
    };
    socket.on("class:updated", handleClassUpdated);
    return () => {
      socket.off("class:updated", handleClassUpdated);
    };
  }, [socket]);

  const classesQuery = trpc.class.list.useQuery(undefined, { enabled: isAdmin || isTeacher || isSuperAdmin });
  const myClasses = trpc.class.list.useQuery(undefined, { enabled: user?.role === "student" });
  const myProfile = trpc.user.myProfile.useQuery(undefined, { enabled: user?.role === "student" });
  const oneToOneQuery = trpc.class.listOneToOne.useQuery(undefined, { enabled: !!user });

  // Allocation flow queries & mutations
  const allocationsQuery = trpc.students.listAllocations.useQuery(
    user?.role === "teacher" ? { teacherId: user.id } : undefined,
    { enabled: !!user && (user.role === "teacher" || isAdmin || user.role === "student") }
  );

  const [selectedScheduleDuration, setSelectedScheduleDuration] = useState<number>(30);
  const [scheduleRemarks, setScheduleRemarks] = useState("");

  const scheduleSessionMutation = trpc.class.createOneToOne.useMutation({
    onSuccess: () => {
      toast.success("Session scheduled successfully");
      setScheduleOpen(false);
      setScheduleDate("");
      setSelectedEnrollmentForSchedule(null);
      setScheduleRemarks("");
      oneToOneQuery.refetch();
      allocationsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const attendanceQuery = trpc.class.getAttendance.useQuery(
    { classId: attendanceClassId || 0 },
    { enabled: !!attendanceClassId }
  );

  // Batches & Teachers lists for scheduling dropdowns
  const batchesQuery = trpc.learning.listBatches.useQuery(undefined, { enabled: canManageClasses });
  const teachersQuery = trpc.user.list.useQuery({ role: "teacher" }, { enabled: isAdmin });
  const studentsQuery = trpc.user.list.useQuery({ role: "student" }, { enabled: isAdmin });

  // Auto-complete/search states for 1-to-1 session creation/editing
  const [teacherSearch, setTeacherSearch] = useState("");
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false);
  const teacherDropdownRef = useRef<HTMLDivElement>(null);

  const [studentSearch, setStudentSearch] = useState("");
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const studentDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (teacherDropdownRef.current && !teacherDropdownRef.current.contains(event.target as Node)) {
        setShowTeacherDropdown(false);
      }
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(event.target as Node)) {
        setShowStudentDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredTeachers = teachersQuery.data?.filter((t) => {
    const search = teacherSearch.toLowerCase();
    return (
      t.name.toLowerCase().includes(search) ||
      t.unionId.toLowerCase().includes(search) ||
      String(t.id).includes(search)
    );
  }) || [];

  const filteredStudents = studentsQuery.data?.filter((std) => {
    const search = studentSearch.toLowerCase();
    return (
      std.name.toLowerCase().includes(search) ||
      (std.profile?.enrollmentId || std.unionId).toLowerCase().includes(search) ||
      String(std.id).includes(search)
    );
  }) || [];

  const createClass = trpc.class.create.useMutation({
    onSuccess: () => {
      toast.success("Class scheduled");
      setOpen(false);
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const editClass = trpc.class.edit.useMutation({
    onSuccess: () => {
      toast.success("Class details updated");
      setEditOpen(false);
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const startClass = trpc.class.start.useMutation({
    onSuccess: () => {
      toast.success("Class started");
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const endClass = trpc.class.end.useMutation({
    onSuccess: () => {
      toast.success("Class ended");
      setJitsiRoom(null);
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelClass = trpc.class.cancel.useMutation({
    onSuccess: () => {
      toast.success("Class cancelled");
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const recordAttendance = trpc.class.recordAttendance.useMutation({
    onSuccess: () => { toast.success("Attendance recorded"); },
    onError: (err) => toast.error(err.message),
  });

  const recordJoinTime = trpc.class.recordJoinTime.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const recordLeaveTime = trpc.class.recordLeaveTime.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const createOneToOne = trpc.class.createOneToOne.useMutation({
    onSuccess: () => { toast.success("Session created"); setOtoOpen(false); oneToOneQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const startOneToOne = trpc.class.startOneToOne.useMutation({
    onSuccess: () => {
      toast.success("1-to-1 Session started");
      oneToOneQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const joinOneToOne = trpc.class.joinOneToOne.useMutation({
    onSuccess: () => {
      oneToOneQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const endOneToOne = trpc.class.endOneToOne.useMutation({
    onSuccess: () => {
      toast.success("1-to-1 Session ended");
      setJitsiRoom(null);
      setSelectedClassForMeeting(null);
      oneToOneQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelOneToOne = trpc.class.cancelOneToOne.useMutation({
    onSuccess: () => {
      toast.success("1-to-1 Session cancelled");
      oneToOneQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const rescheduleOneToOne = trpc.class.rescheduleOneToOne.useMutation({
    onSuccess: () => {
      toast.success("1-to-1 Session rescheduled");
      setRescheduleOpen(false);
      oneToOneQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const requestReschedule = trpc.class.requestReschedule.useMutation({
    onSuccess: () => {
      toast.success("Reschedule request submitted successfully. Your request has been sent to the Admin for approval.");
      setTeacherRescheduleOpen(false);
      oneToOneQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const editOneToOne = trpc.class.editOneToOne.useMutation({
    onSuccess: () => {
      toast.success("1-to-1 Session updated");
      setOtoEditOpen(false);
      oneToOneQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Scheduling Form State
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    teacherId: 0,
    batchIds: [] as number[],
  });
  const [batchSearch, setBatchSearch] = useState("");

  const handleOpenCreate = () => {
    setForm({
      title: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      startTime: "10:00",
      endTime: "11:00",
      teacherId: isTeacher ? (user?.id || 0) : 0,
      batchIds: [],
    });
    setBatchSearch("");
    setOpen(true);
  };

  const handleOpenEdit = (cls: any) => {
    setEditingClassId(cls.id);
    const sDate = new Date(cls.scheduledAt);
    const dateStr = sDate.toISOString().split("T")[0];
    
    const startHours = String(sDate.getHours()).padStart(2, "0");
    const startMins = String(sDate.getMinutes()).padStart(2, "0");
    const startTimeStr = `${startHours}:${startMins}`;

    const eDate = new Date(sDate.getTime() + (cls.duration || 60) * 60000);
    const endHours = String(eDate.getHours()).padStart(2, "0");
    const endMins = String(eDate.getMinutes()).padStart(2, "0");
    const endTimeStr = `${endHours}:${endMins}`;

    setForm({
      title: cls.title,
      description: cls.description || "",
      date: dateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      teacherId: cls.teacherId,
      batchIds: cls.classBatches?.map((cb: any) => cb.batchId) || [cls.batchId],
    });
    setBatchSearch("");
    setEditOpen(true);
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.batchIds.length === 0) {
      toast.error("Please select at least one batch.");
      return;
    }
    if (form.teacherId === 0) {
      toast.error("Please assign a teacher.");
      return;
    }
    const start = new Date(`${form.date}T${form.startTime}`);
    const end = new Date(`${form.date}T${form.endTime}`);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    if (duration <= 0) {
      toast.error("End Time must be after Start Time.");
      return;
    }

    createClass.mutate({
      title: form.title,
      description: form.description,
      scheduledAt: start,
      duration,
      teacherId: form.teacherId,
      batchIds: form.batchIds,
    });
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClassId) return;
    if (form.batchIds.length === 0) {
      toast.error("Please select at least one batch.");
      return;
    }
    if (form.teacherId === 0) {
      toast.error("Please assign a teacher.");
      return;
    }
    const start = new Date(`${form.date}T${form.startTime}`);
    const end = new Date(`${form.date}T${form.endTime}`);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    if (duration <= 0) {
      toast.error("End Time must be after Start Time.");
      return;
    }

    editClass.mutate({
      id: editingClassId,
      title: form.title,
      description: form.description,
      scheduledAt: start,
      duration,
      teacherId: form.teacherId,
      batchIds: form.batchIds,
    });
  };

  const handleStartClass = async (cls: any) => {
    try {
      await startClass.mutateAsync({ id: cls.id });
      setSelectedClassForMeeting(cls);
      setJitsiRoom(cls.meetingRoomId || `class-${cls.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start live class session");
    }
  };

  const handleJoinClass = (cls: any) => {
    setSelectedClassForMeeting(cls);
    setJitsiRoom(cls.meetingRoomId || `class-${cls.id}`);
  };

  const handleOpenCreateOto = () => {
    setOtoForm({
      teacherId: 0,
      studentId: 0,
      sessionLength: 30,
      scheduledAt: new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 16),
      title: "1-to-1 Session",
      remarks: "",
    });
    setTeacherSearch("");
    setStudentSearch("");
    setOtoOpen(true);
  };

  const handleOpenEditOto = (session: any) => {
    setSelectedOtoSession(session);
    // Convert UTC/stored date to local timezone string format for input field (YYYY-MM-DDTHH:MM)
    const dateStr = session.scheduledAt ? new Date(new Date(session.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    setOtoForm({
      teacherId: session.teacherId,
      studentId: session.studentId,
      sessionLength: session.sessionLength,
      scheduledAt: dateStr,
      title: session.title || "1-to-1 Session",
      remarks: session.remarks || "",
    });
    
    // Format search string values based on existing session data
    const teacherName = session.teacher?.name || "";
    const teacherUnionId = session.teacher?.unionId || "";
    const studentName = session.student?.name || "";
    const studentUnionId = session.student?.profile?.enrollmentId || session.student?.unionId || "";
    
    setTeacherSearch(teacherName ? `${teacherName} (${teacherUnionId || `ID: ${session.teacherId}`})` : "");
    setStudentSearch(studentName ? `${studentName} (${studentUnionId || `ID: ${session.studentId}`})` : "");
    setOtoEditOpen(true);
  };

  const handleOpenRescheduleOto = (session: any) => {
    setSelectedOtoSession(session);
    const dateStr = session.scheduledAt ? new Date(new Date(session.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    setOtoForm({
      ...otoForm,
      sessionLength: session.sessionLength,
      scheduledAt: dateStr,
    });
    setRescheduleOpen(true);
  };

  const handleJoinOneToOne = async (session: any) => {
    try {
      const details = await joinOneToOne.mutateAsync({ sessionId: session.id });
      setSelectedClassForMeeting({
        id: session.id,
        title: details.title || `1-on-1 Session`,
        scheduledAt: details.scheduledAt,
        teacherName: details.teacherName,
        isOneToOne: true,
      });
      setJitsiRoom(details.roomName);
    } catch (err: any) {
      toast.error(err.message || "Failed to join 1-to-1 session");
    }
  };

  const handleStartOneToOne = async (session: any) => {
    try {
      await startOneToOne.mutateAsync({ sessionId: session.id });
      setSelectedClassForMeeting({
        id: session.id,
        title: session.title || `1-on-1 Session`,
        scheduledAt: session.scheduledAt,
        teacher: session.teacher,
        isOneToOne: true,
      });
      setJitsiRoom(session.meetingRoomId || `emtees-1on1-${session.id}`);
      toast.success("1-to-1 Session started");
    } catch (err: any) {
      toast.error(err.message || "Failed to start 1-to-1 session");
    }
  };

  const data = isAdmin || isTeacher || isSuperAdmin ? classesQuery.data : myClasses.data;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "scheduled": return <Badge variant="secondary">Scheduled</Badge>;
      case "ongoing": return <Badge className="bg-green-500 text-white animate-pulse">🔴 Live</Badge>;
      case "completed": return <Badge variant="outline">Completed</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const availableBatches = batchesQuery.data || [];
  const filteredBatches = isAdmin
    ? availableBatches
    : isTeacher
    ? availableBatches.filter(b => b.teacherId === user?.id)
    : [];

  const searchedBatches = filteredBatches.filter(b =>
    b.name.toLowerCase().includes(batchSearch.toLowerCase()) ||
    b.module?.name?.toLowerCase().includes(batchSearch.toLowerCase())
  );

  const [nowTime, setNowTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const renderStudentJoinButton = (cls: any) => {
    const isRestricted = !!myProfile.data?.isRestricted;

    if (cls.status === "cancelled") {
      return (
        <Button size="sm" variant="outline" disabled className="text-gray-400 bg-gray-50 border-gray-200 text-xs rounded-xl h-8">
          Cancelled
        </Button>
      );
    }
    if (cls.status === "completed") {
      return (
        <Button size="sm" variant="outline" disabled className="text-gray-400 bg-gray-50 border-gray-200 text-xs rounded-xl h-8">
          Completed
        </Button>
      );
    }
    if (cls.status === "live" || cls.status === "ongoing") {
      return (
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl h-8"
          onClick={() => {
            if (cls.classType === "one_to_one") {
              handleJoinOneToOne(cls);
            } else {
              handleJoinClass(cls);
            }
          }}
          disabled={isRestricted}
        >
          <Video className="w-3.5 h-3.5 mr-1" /> Join Session
        </Button>
      );
    }

    // Status is scheduled
    const now = nowTime;
    const scheduledTime = new Date(cls.scheduledAt);
    if (now < scheduledTime) {
      return (
        <Button size="sm" variant="outline" disabled className="text-gray-400 bg-gray-50 border-gray-200 text-xs rounded-xl h-8">
          Waiting for scheduled time
        </Button>
      );
    } else {
      return (
        <Button size="sm" variant="outline" disabled className="text-gray-400 bg-gray-50 border-gray-200 text-xs rounded-xl h-8">
          Waiting for teacher to start the session
        </Button>
      );
    }
  };

  const renderClassesList = (classesList: any[]) => {
    return (
      <div className="grid grid-cols-1 gap-4 mt-2">
        {classesList?.map((cls) => {
          const isAssignedTeacher = isTeacher && cls.teacherId === user?.id;
          const canConductThisClass = isAdmin || isAssignedTeacher;
          
          return (
            <Card key={cls.id} className="border border-gray-100 hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between flex-col md:flex-row gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-800 text-base">{cls.title}</h4>
                      {getStatusBadge(cls.status)}
                    </div>
                    {cls.description && <p className="text-sm text-gray-500">{cls.description}</p>}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100 w-full text-left">
                      <div>
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Course / Module</span>
                        <span className="font-medium text-slate-700">{cls.batch?.module?.name || cls.batches?.[0]?.module?.name || "-"}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Batch</span>
                        <span className="font-medium text-slate-700">{cls.batches?.map((b: any) => b.name).join(", ") || cls.batch?.name || "-"}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Session Type</span>
                        <span className="font-medium text-slate-700 capitalize">{cls.classType === "one_to_one" ? "1-on-1 Session" : "Group Session"}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Assigned Teacher</span>
                        <span className="font-medium text-slate-700">{cls.teacher?.name || "Unassigned"}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Date & Time</span>
                        <span className="font-medium text-slate-700">
                          {cls.scheduledAt ? (
                            <>
                              {new Date(cls.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                              <br />
                              {new Date(cls.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} - {(() => {
                                const d = new Date(cls.scheduledAt);
                                d.setMinutes(d.getMinutes() + (cls.duration || 60));
                                return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                              })()}
                            </>
                          ) : "-"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Duration</span>
                        <span className="font-medium text-slate-700">{cls.duration || 0} minutes</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Assigned Students</span>
                        <span className="font-medium text-slate-700">{cls.assignedStudentsCount ?? 0} student(s)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end shrink-0 w-full md:w-auto mt-2 md:mt-0">
                    {/* Join button for students */}
                    {user?.role === "student" && renderStudentJoinButton(cls)}

                    {/* Teacher / Admin controls */}
                    {canConductThisClass && cls.status === "scheduled" && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleStartClass(cls)}
                      >
                        <Play className="w-4 h-4 mr-1.5" /> Start & Join
                      </Button>
                    )}
                    {canConductThisClass && (cls.status === "ongoing" || cls.status === "live") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => endClass.mutate({ id: cls.id })}
                      >
                        <Square className="w-4 h-4 mr-1.5" /> End Class
                      </Button>
                    )}

                    {/* Edit Class Details */}
                    {canConductThisClass && cls.status === "scheduled" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(cls)}
                        className="border-gray-200 hover:bg-gray-50 text-gray-700"
                      >
                        <Edit3 className="w-4 h-4 mr-1.5 text-gray-500" /> Edit
                      </Button>
                    )}

                    {/* Cancel */}
                    {canConductThisClass && cls.status === "scheduled" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
                        onClick={() => cancelClass.mutate({ id: cls.id })}
                      >
                        <XCircle className="w-4 h-4 mr-1.5" /> Cancel
                      </Button>
                    )}

                    {/* Attendance Logs */}
                    {(isTeacher || isAdmin || isSuperAdmin) && (cls.status === "ongoing" || cls.status === "completed") && (
                      <Dialog open={attendanceClassId === cls.id} onOpenChange={(open) => setAttendanceClassId(open ? cls.id : null)}>
                        <Button size="sm" variant="outline" onClick={() => setAttendanceClassId(cls.id)}>
                          <ClipboardList className="w-4 h-4 mr-1.5" /> Attendance
                        </Button>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl">
                          <DialogHeader>
                            <DialogTitle>Attendance Log — {cls.title}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-6 mt-2">
                            <div className="space-y-2">
                              <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider">Live Join/Leave Records</h4>
                              {attendanceQuery.isLoading ? (
                                <p className="text-xs text-gray-400 animate-pulse">Loading log...</p>
                              ) : !attendanceQuery.data || attendanceQuery.data.length === 0 ? (
                                <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg text-center">No attendance logs recorded yet.</p>
                              ) : (
                                <div className="border rounded-lg overflow-hidden border-gray-100">
                                  <Table>
                                    <TableHeader className="bg-gray-50">
                                      <TableRow>
                                        <TableHead className="text-xs">Student</TableHead>
                                        <TableHead className="text-xs text-center">Status</TableHead>
                                        <TableHead className="text-xs">Joined At</TableHead>
                                        <TableHead className="text-xs">Left At</TableHead>
                                        <TableHead className="text-xs text-center">Duration</TableHead>
                                        <TableHead className="text-xs text-center">Chats</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {attendanceQuery.data.map((record) => (
                                        <TableRow key={record.id} className="hover:bg-gray-50/50">
                                          <TableCell className="py-2 text-xs">
                                            <div className="font-medium text-gray-800">{record.student?.name}</div>
                                            <div className="text-[10px] text-gray-400 font-mono">{record.student?.profile?.enrollmentId || record.student?.unionId}</div>
                                          </TableCell>
                                          <TableCell className="py-2 text-center text-xs">
                                            <Badge
                                              variant={record.status === "present" ? "default" : "secondary"}
                                              className={
                                                record.status === "present"
                                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50 text-[10px] px-1.5 py-0.5 font-normal capitalize"
                                                  : "bg-red-50 text-red-700 border-red-100 hover:bg-red-50 text-[10px] px-1.5 py-0.5 font-normal capitalize"
                                              }
                                            >
                                              {record.status}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="py-2 text-xs text-gray-600">
                                            {record.joinedAt ? new Date(record.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "-"}
                                          </TableCell>
                                          <TableCell className="py-2 text-xs text-gray-600">
                                            {record.leftAt ? new Date(record.leftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "-"}
                                          </TableCell>
                                          <TableCell className="py-2 text-center text-xs text-gray-600">
                                            {record.duration ? `${Math.round(record.duration / 60)} min` : "-"}
                                          </TableCell>
                                          <TableCell className="py-2 text-center text-xs text-gray-700 font-semibold">
                                            {record.chatCount}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>

                            {/* Manual entry override */}
                            <div className="border-t pt-4 space-y-3">
                              <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider">Manual Attendance Entry</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-gray-600">Student ID</label>
                                  <Input type="number" placeholder="Enter student database ID" value={attendanceStudentId} onChange={(e) => setAttendanceStudentId(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-gray-600">Chat Messages Count</label>
                                  <Input type="number" value={attendanceChatCount} onChange={(e) => setAttendanceChatCount(Number(e.target.value))} min={0} />
                                </div>
                              </div>
                              <p className="text-[10px] text-gray-400 font-light">
                                💡 Students with 4 or more chats are automatically marked present.
                              </p>
                              <Button
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs py-2 rounded-lg"
                                onClick={() => {
                                  if (!attendanceStudentId) return;
                                  recordAttendance.mutate({
                                    classId: cls.id,
                                    studentId: Number(attendanceStudentId),
                                    chatCount: attendanceChatCount,
                                  }, {
                                    onSuccess: () => {
                                      attendanceQuery.refetch();
                                    }
                                  });
                                }}
                                disabled={!attendanceStudentId || recordAttendance.isPending}
                              >
                                {recordAttendance.isPending ? "Recording..." : "Record & Sync Attendance"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {classesList.length === 0 && (
          <p className="text-center text-gray-400 py-10">No sessions found.</p>
        )}
      </div>
    );
  };

  const scheduleFormContent = (handleSubmit: (e: React.FormEvent) => void, submitLabel: string) => {
    return (
      <form onSubmit={handleSubmit} className="space-y-3 mt-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Class Title <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="Class title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Description</label>
          <Input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {/* Teacher Selection (Admins only) */}
        {isAdmin ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Assigned Teacher <span className="text-red-500">*</span>
            </label>
            <Select
              value={form.teacherId?.toString() || ""}
              onValueChange={(val) => setForm({ ...form, teacherId: Number(val) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a Teacher" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {teachersQuery.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.name} ({t.unionId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Assigned Teacher</label>
            <Input value={user?.name || ""} disabled className="bg-gray-50" />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1 col-span-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Date</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Start Time</label>
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">End Time</label>
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              required
            />
          </div>
        </div>

        {/* Multi Batch Checklist */}
        <div className="space-y-1.5 border-t pt-2.5">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Target Batches <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="Search batches..."
            value={batchSearch}
            onChange={(e) => setBatchSearch(e.target.value)}
            className="h-8 text-xs placeholder:text-gray-400"
          />
          <ScrollArea className="h-32 border rounded-lg p-2.5 bg-gray-50 dark:bg-slate-900 mt-1 border-gray-200/60">
            {searchedBatches.length === 0 ? (
              <p className="text-[11px] text-gray-400 py-4 text-center">No batches found.</p>
            ) : (
              <div className="space-y-2">
                {searchedBatches.map((batch) => (
                  <div key={batch.id} className="flex items-center space-x-2.5 py-0.5">
                    <Checkbox
                      id={`batch-${batch.id}`}
                      checked={form.batchIds.includes(batch.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setForm((prev) => ({ ...prev, batchIds: [...prev.batchIds, batch.id] }));
                        } else {
                          setForm((prev) => ({
                            ...prev,
                            batchIds: prev.batchIds.filter((id) => id !== batch.id),
                          }));
                        }
                      }}
                    />
                    <label
                      htmlFor={`batch-${batch.id}`}
                      className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer font-medium select-none truncate"
                    >
                      {batch.name} <span className="text-gray-400 font-normal">({batch.module?.name})</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          {form.batchIds.length > 0 && (
            <p className="text-[10px] text-emerald-600 font-semibold mt-1">
              ✓ {form.batchIds.length} batch(es) selected
            </p>
          )}
        </div>

        <p className="text-[11px] text-gray-400 pt-1 leading-normal">
          💡 Live classes automatically generate embedded Jitsi rooms. Reminder notifications are sent to students in all selected batches.
        </p>

        <Button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          disabled={createClass.isPending || editClass.isPending}
        >
          {createClass.isPending || editClass.isPending ? "Scheduling..." : submitLabel}
        </Button>
      </form>
    );
  };

  const renderOneToOneList = () => {
    return (
      <Card className="border border-gray-100">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session Details</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {oneToOneQuery.data?.map((s) => (
                <TableRow key={s.id} className="align-top hover:bg-gray-50/50">
                  <TableCell className="font-semibold text-gray-800 text-sm">
                    <div>{s.title || "1-to-1 Session"}</div>
                    {s.status === "completed" && (
                      <div className="text-[11px] text-gray-500 mt-2 space-y-1 border-t pt-2 max-w-xs leading-relaxed font-normal">
                        <div>⏱️ <b>Actual:</b> {s.startedAt ? new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"} - {s.endedAt ? new Date(s.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}</div>
                        <div>⏳ <b>Conducted:</b> {s.actualDuration !== null ? `${s.actualDuration} min` : "-"}</div>
                        <div className="flex gap-2.5 mt-1">
                          <span>👩‍🏫 Teacher: <Badge variant={s.teacherAttendance === "present" ? "default" : "destructive"} className="text-[9px] px-1 py-0 font-normal uppercase">{s.teacherAttendance || "absent"}</Badge></span>
                          <span>🎓 Student: <Badge variant={s.studentAttendance === "present" ? "default" : "destructive"} className="text-[9px] px-1 py-0 font-normal uppercase">{s.studentAttendance || "absent"}</Badge></span>
                        </div>
                        {s.remarks && <div className="text-gray-400 italic text-[10px] mt-1 font-serif">"{s.remarks}"</div>}
                      </div>
                    )}
                    {s.status !== "completed" && s.remarks && (
                      <div className="text-[11px] text-gray-400 font-light mt-1 max-w-xs truncate">Note: "{s.remarks}"</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{s.teacher?.name || "-"}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-semibold text-slate-800">{s.student?.name || "-"}</div>
                    {s.student?.profile && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        <b>Course:</b> {s.student.profile.course || "-"}<br/>
                        <b>Batch:</b> {s.student.profile.batch || "-"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{s.sessionLength} min</TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {s.scheduledAt ? (
                      <>
                        <div className="font-semibold">{new Date(s.scheduledAt).toLocaleDateString()}</div>
                        <div className="text-gray-400 mt-0.5">
                          {new Date(s.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} - {(() => {
                            const d = new Date(s.scheduledAt);
                            d.setMinutes(d.getMinutes() + (s.sessionLength || 30));
                            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                          })()}
                        </div>
                      </>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col gap-1">
                      {s.status === "live" ? (
                        <Badge className="bg-red-500 text-white animate-pulse w-fit">🔴 Live</Badge>
                      ) : s.status === "reschedule_request_pending" ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] w-fit font-medium">
                          Reschedule Request Pending
                        </Badge>
                      ) : (
                        <Badge variant={s.status === "completed" ? "default" : s.status === "rescheduled" ? "secondary" : "outline"} className="w-fit">
                          {s.status}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* JOIN BUTTON FOR STUDENT */}
                      {user?.role === "student" && renderStudentJoinButton({ ...s, classType: "one_to_one" })}

                      {/* TEACHER ACTIONS */}
                      {user?.role === "teacher" && (s.status === "scheduled" || s.status === "rescheduled" || s.status === "reschedule_request_pending") && (() => {
                        const pendingRequest = s.rescheduleRequests?.find((r: any) => r.status === "pending");
                        const isUpcoming = new Date() < new Date(s.scheduledAt);
                        const isReschedulePending = s.status === "reschedule_request_pending" || !!pendingRequest;
                        return (
                          <>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white text-xs"
                              onClick={() => handleStartOneToOne(s)}
                              disabled={startOneToOne.isPending}
                            >
                              <Play className="w-3.5 h-3.5 mr-1" /> Start
                            </Button>
                            {isUpcoming && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-gray-200"
                                onClick={() => handleOpenTeacherReschedule(s)}
                                disabled={isReschedulePending}
                              >
                                <Calendar className="w-3.5 h-3.5 mr-1 text-gray-500" />
                                {isReschedulePending ? "Reschedule Pending" : "Request Reschedule"}
                              </Button>
                            )}
                          </>
                        );
                      })()}
                      {user?.role === "teacher" && s.status === "live" && (
                        <>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                            onClick={() => handleJoinOneToOne(s)}
                            disabled={joinOneToOne.isPending}
                          >
                            <Video className="w-3.5 h-3.5 mr-1" /> Join
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-xs"
                            onClick={() => endOneToOne.mutate({ sessionId: s.id })}
                            disabled={endOneToOne.isPending}
                          >
                            <Square className="w-3.5 h-3.5 mr-1" /> End
                          </Button>
                        </>
                      )}

                      {/* ADMIN ACTIONS */}
                      {isAdmin && (
                        <>
                          {(s.status === "scheduled" || s.status === "rescheduled" || s.status === "reschedule_request_pending" || s.status === "live") && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                              onClick={() => handleJoinOneToOne(s)}
                              disabled={joinOneToOne.isPending}
                            >
                              <Video className="w-3.5 h-3.5 mr-1" /> Join
                            </Button>
                          )}
                          {s.status === "live" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs"
                              onClick={() => endOneToOne.mutate({ sessionId: s.id })}
                              disabled={endOneToOne.isPending}
                            >
                              <Square className="w-3.5 h-3.5 mr-1" /> End
                            </Button>
                          )}
                          {(s.status === "scheduled" || s.status === "rescheduled" || s.status === "reschedule_request_pending") && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-gray-200"
                                onClick={() => handleOpenEditOto(s)}
                              >
                                <Edit3 className="w-3.5 h-3.5 mr-1 text-gray-500" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-gray-200"
                                onClick={() => handleOpenRescheduleOto(s)}
                              >
                                <Calendar className="w-3.5 h-3.5 mr-1 text-gray-500" /> Reschedule
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100 text-xs"
                                onClick={() => cancelOneToOne.mutate({ sessionId: s.id })}
                                disabled={cancelOneToOne.isPending}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!oneToOneQuery.data || oneToOneQuery.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-10 text-xs">
                    No 1-to-1 sessions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  const renderBalancesTable = (sessionTypeFilter: "one_to_one" | "group") => {
    const list = allocationsQuery.data || [];
    const filtered = list.filter(item => {
      const alloc = item.allocation as any;
      if (sessionTypeFilter === "one_to_one") {
        return (alloc?.oneToOne?.sessions30 || 0) + (alloc?.oneToOne?.sessions45 || 0) + (alloc?.oneToOne?.sessions60 || 0) > 0;
      } else {
        return (alloc?.group?.sessions30 || 0) + (alloc?.group?.sessions45 || 0) + (alloc?.group?.sessions60 || 0) > 0;
      }
    });

    const isStudent = user?.role === "student";

    return (
      <Card className="border border-gray-100">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isStudent ? (sessionTypeFilter === "one_to_one" ? "Teacher" : "Batch") : "Student"}</TableHead>
                <TableHead className="text-center">30 Min Bal</TableHead>
                <TableHead className="text-center">45 Min Bal</TableHead>
                <TableHead className="text-center">60 Min Bal</TableHead>
                {!isStudent && sessionTypeFilter === "one_to_one" && <TableHead>Teacher</TableHead>}
                {!isStudent && sessionTypeFilter === "group" && <TableHead>Batch / Teacher</TableHead>}
                {!isStudent && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const alloc = item.allocation as any;
                const target = sessionTypeFilter === "one_to_one" ? alloc?.oneToOne : alloc?.group;
                
                const displayName = isStudent
                  ? (sessionTypeFilter === "one_to_one" ? item.o2oTeacher?.name : item.groupBatch?.name)
                  : `${item.student?.name} (${item.student?.profile?.enrollmentId || item.student?.unionId})`;

                const totalRemaining = (target?.remaining30 || 0) + (target?.remaining45 || 0) + (target?.remaining60 || 0);

                return (
                  <TableRow key={item.id} className="hover:bg-gray-50/50">
                    <TableCell className="font-semibold text-slate-700 py-3">{displayName}</TableCell>
                    <TableCell className="text-center font-mono">
                      <span className="text-emerald-700 font-bold">{target?.remaining30 || 0}</span>
                      <span className="text-gray-400 text-[10px]"> / {target?.sessions30 || 0}</span>
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      <span className="text-emerald-700 font-bold">{target?.remaining45 || 0}</span>
                      <span className="text-gray-400 text-[10px]"> / {target?.sessions45 || 0}</span>
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      <span className="text-emerald-700 font-bold">{target?.remaining60 || 0}</span>
                      <span className="text-gray-400 text-[10px]"> / {target?.sessions60 || 0}</span>
                    </TableCell>
                    {!isStudent && sessionTypeFilter === "one_to_one" && (
                      <TableCell className="text-xs text-slate-600">
                        {item.o2oTeacher?.name || "Unassigned"}
                      </TableCell>
                    )}
                    {!isStudent && sessionTypeFilter === "group" && (
                      <TableCell className="text-xs text-slate-600">
                        <div><b>Batch:</b> {item.groupBatch?.name || "N/A"}</div>
                        <div><b>Teacher:</b> {item.groupTeacher?.name || "Unassigned"}</div>
                      </TableCell>
                    )}
                    {!isStudent && (
                      <TableCell className="text-right py-2">
                        {sessionTypeFilter === "one_to_one" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs rounded-xl"
                            onClick={() => {
                              setSelectedEnrollmentForSchedule(item);
                              const d = (target?.remaining30 || 0) > 0 ? 30 : ((target?.remaining45 || 0) > 0 ? 45 : 60);
                              setSelectedScheduleDuration(d);
                              setScheduleDate(new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 16));
                              setScheduleOpen(true);
                            }}
                            disabled={totalRemaining <= 0}
                          >
                            <Calendar className="w-3.5 h-3.5 mr-1" /> Schedule
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-10 text-xs">
                    No allocated class balances found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };


  return (
    <>
      {/* Jitsi fullscreen overlay */}
      {jitsiRoom && user && (
        <JitsiMeet
          classId={selectedClassForMeeting.classId || selectedClassForMeeting.id}
          isOneToOne={selectedClassForMeeting.roomName?.includes("1on1") || selectedClassForMeeting.title?.startsWith("1-on-1") || !!selectedClassForMeeting.isOneToOne}
          onJoin={() => {
            if (selectedClassForMeeting && user.role === "student" && !selectedClassForMeeting.roomName?.includes("1on1") && !selectedClassForMeeting.title?.startsWith("1-on-1")) {
              recordJoinTime.mutate({ classId: selectedClassForMeeting.classId || selectedClassForMeeting.id });
            }
          }}
          onLeave={() => {
            if (selectedClassForMeeting && user.role === "student" && !selectedClassForMeeting.roomName?.includes("1on1") && !selectedClassForMeeting.title?.startsWith("1-on-1")) {
              recordLeaveTime.mutate({ classId: selectedClassForMeeting.classId || selectedClassForMeeting.id });
            }
          }}
          classInfo={selectedClassForMeeting ? {
            title: selectedClassForMeeting.title,
            scheduledAt: selectedClassForMeeting.scheduledAt,
            teacherName: selectedClassForMeeting.teacherName || selectedClassForMeeting.teacher?.name,
          } : undefined}
          onClose={() => {
            setJitsiRoom(null);
            setSelectedClassForMeeting(null);
            if (classesQuery.isSuccess) classesQuery.refetch();
            if (myClasses.isSuccess) myClasses.refetch();
            if (oneToOneQuery.isSuccess) oneToOneQuery.refetch();
            if (allocationsQuery.isSuccess) allocationsQuery.refetch();
          }}
        />
      )}

      {/* Ongoing Class Banner */}
      {(() => {
        const ongoingSession = oneToOneQuery.data?.find(
          (s) => s.status === "live" && (isAdmin || s.teacherId === user?.id || s.studentId === user?.id)
        );
        if (!ongoingSession) return null;
        
        const isConducting = isAdmin || ongoingSession.teacherId === user?.id;
        
        return (
          <Card className="border-2 border-rose-500 bg-rose-50/10 shadow-lg rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Clock className="w-5 h-5 animate-pulse text-rose-600" />
              </div>
              <div className="text-left">
                <h4 className="font-bold text-slate-800 text-sm">
                  Live Class Ongoing: {ongoingSession.student?.name}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Type: 1-to-1 Session
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Elapsed Time</span>
                <OngoingTimer startedAt={ongoingSession.startedAt ? (ongoingSession.startedAt instanceof Date ? ongoingSession.startedAt.toISOString() : String(ongoingSession.startedAt)) : ""} />
              </div>
              {isConducting ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl"
                  onClick={() => {
                    endOneToOne.mutate({ sessionId: ongoingSession.id });
                  }}
                  disabled={endOneToOne.isPending}
                >
                  <Square className="w-3.5 h-3.5 mr-1.5 fill-current" /> End Class
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
                  onClick={() => {
                    setSelectedClassForMeeting({
                      id: ongoingSession.id,
                      title: "1-to-1 Session",
                      scheduledAt: ongoingSession.startedAt ? (ongoingSession.startedAt instanceof Date ? ongoingSession.startedAt.toISOString() : String(ongoingSession.startedAt)) : new Date().toISOString(),
                      isOneToOne: true,
                    });
                    setJitsiRoom(`emtees-session-${ongoingSession.id}`);
                  }}
                >
                  <Video className="w-3.5 h-3.5 mr-1.5" /> Join Class
                </Button>
              )}
            </div>
          </Card>
        );
      })()}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">
            {type === "group" ? "Group Sessions" : type === "one-to-one" ? "1-on-1 Sessions" : "Classes & Sessions"}
          </h3>
          {/* Header Action Button */}
          {(!type || type === "group") && canManageClasses && (
            <Dialog open={open} onOpenChange={setOpen}>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleOpenCreate}>
                <Plus className="w-4 h-4 mr-2" /> Schedule Class
              </Button>
              <DialogContent className="max-w-md bg-white rounded-xl shadow-xl border border-gray-100">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-gray-800">Schedule New Class</DialogTitle>
                </DialogHeader>
                {scheduleFormContent(handleSubmitCreate, "Schedule Live Class")}
              </DialogContent>
            </Dialog>
          )}
          {type === "one-to-one" && isAdmin && (
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleOpenCreateOto}>
              <Plus className="w-4 h-4 mr-2" /> New Session
            </Button>
          )}
        </div>

        {/* Edit Dialog (Group Class) */}
        {(!type || type === "group") && (
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-md bg-white rounded-xl shadow-xl border border-gray-100">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-gray-800">Edit Class Details</DialogTitle>
              </DialogHeader>
              {scheduleFormContent(handleSubmitEdit, "Update Live Class")}
            </DialogContent>
          </Dialog>
        )}

        {/* 1-on-1 Dialogs (Only rendered if type is not group) */}
        {(!type || type === "one-to-one") && (
          <>
            {/* Create 1-on-1 Modal */}
            <Dialog open={otoOpen} onOpenChange={setOtoOpen}>
              <DialogContent className="max-w-md bg-white rounded-xl shadow-xl border border-gray-100">
                <DialogHeader><DialogTitle className="text-base font-bold text-gray-800">Create 1-on-1 Session</DialogTitle></DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (otoForm.teacherId === 0 || otoForm.studentId === 0) {
                    toast.error("Please select a student and teacher.");
                    return;
                  }
                  createOneToOne.mutate({
                    ...otoForm,
                    scheduledAt: new Date(otoForm.scheduledAt),
                  });
                }} className="space-y-3 mt-2 text-left">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Session Title</label>
                    <Input placeholder="Session Title" value={otoForm.title} onChange={(e) => setOtoForm({ ...otoForm, title: e.target.value })} required />
                  </div>
                  {/* SEARCHABLE TEACHER DROPDOWN */}
                  <div className="space-y-1 relative" ref={teacherDropdownRef}>
                    <label className="text-xs font-medium text-gray-700">Select Teacher</label>
                    <Input
                      placeholder="Search teacher by name or ID..."
                      value={teacherSearch}
                      onChange={(e) => {
                        setTeacherSearch(e.target.value);
                        setShowTeacherDropdown(true);
                        setOtoForm(prev => ({ ...prev, teacherId: 0 }));
                      }}
                      onFocus={() => setShowTeacherDropdown(true)}
                      className="w-full bg-white border"
                    />
                    {showTeacherDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredTeachers.length === 0 ? (
                          <div className="p-2.5 text-xs text-gray-400">No teachers found</div>
                        ) : (
                          filteredTeachers.map((t) => (
                            <div
                              key={t.id}
                              onClick={() => {
                                setOtoForm(prev => ({ ...prev, teacherId: t.id }));
                                setTeacherSearch(`${t.name} (${t.unionId || `ID: ${t.id}`})`);
                                setShowTeacherDropdown(false);
                              }}
                              className="p-2.5 text-xs hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer border-b last:border-b-0 text-left"
                            >
                              <div className="font-semibold text-gray-800">{t.name}</div>
                              <div className="text-[10px] text-gray-500 font-mono">ID: {t.id} | Union ID: {t.unionId || "-"}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* SEARCHABLE STUDENT DROPDOWN */}
                  <div className="space-y-1 relative" ref={studentDropdownRef}>
                    <label className="text-xs font-medium text-gray-700">Select Student</label>
                    <Input
                      placeholder="Search student by name or ID..."
                      value={studentSearch}
                      onChange={(e) => {
                        setStudentSearch(e.target.value);
                        setShowStudentDropdown(true);
                        setOtoForm(prev => ({ ...prev, studentId: 0 }));
                      }}
                      onFocus={() => setShowStudentDropdown(true)}
                      className="w-full bg-white border"
                    />
                    {showStudentDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredStudents.length === 0 ? (
                          <div className="p-2.5 text-xs text-gray-400">No students found</div>
                        ) : (
                          filteredStudents.map((std) => (
                            <div
                              key={std.id}
                              onClick={() => {
                                setOtoForm(prev => ({ ...prev, studentId: std.id }));
                                setStudentSearch(`${std.name} (${std.profile?.enrollmentId || std.unionId || `ID: ${std.id}`})`);
                                setShowStudentDropdown(false);
                              }}
                              className="p-2.5 text-xs hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer border-b last:border-b-0 text-left"
                            >
                              <div className="font-semibold text-gray-800">{std.name}</div>
                              <div className="text-[10px] text-gray-500 font-mono">ID: {std.id} | Student ID: {std.profile?.enrollmentId || std.unionId || "-"}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Expected Duration (minutes)</label>
                    <Input type="number" placeholder="Expected Duration (min)" value={otoForm.sessionLength} onChange={(e) => setOtoForm({ ...otoForm, sessionLength: Number(e.target.value) })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Class Start Date & Time</label>
                    <Input type="datetime-local" value={otoForm.scheduledAt} onChange={(e) => setOtoForm({ ...otoForm, scheduledAt: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Session Notes (optional)</label>
                    <Input placeholder="Session notes..." value={otoForm.remarks} onChange={(e) => setOtoForm({ ...otoForm, remarks: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 text-white font-medium" disabled={createOneToOne.isPending}>
                    {createOneToOne.isPending ? "Creating..." : "Create Session"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Edit 1-on-1 Modal */}
            <Dialog open={otoEditOpen} onOpenChange={setOtoEditOpen}>
              <DialogContent className="max-w-md bg-white rounded-xl shadow-xl border border-gray-100">
                <DialogHeader><DialogTitle className="text-base font-bold text-gray-800">Edit 1-on-1 Session</DialogTitle></DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedOtoSession) return;
                  editOneToOne.mutate({
                    sessionId: selectedOtoSession.id,
                    teacherId: otoForm.teacherId,
                    studentId: otoForm.studentId,
                    title: otoForm.title,
                    sessionLength: otoForm.sessionLength,
                    scheduledAt: new Date(otoForm.scheduledAt),
                    remarks: otoForm.remarks,
                  });
                }} className="space-y-3 mt-2 text-left">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Session Title</label>
                    <Input placeholder="Session Title" value={otoForm.title} onChange={(e) => setOtoForm({ ...otoForm, title: e.target.value })} required />
                  </div>
                  {/* SEARCHABLE TEACHER DROPDOWN */}
                  <div className="space-y-1 relative" ref={teacherDropdownRef}>
                    <label className="text-xs font-medium text-gray-700">Select Teacher</label>
                    <Input
                      placeholder="Search teacher by name or ID..."
                      value={teacherSearch}
                      onChange={(e) => {
                        setTeacherSearch(e.target.value);
                        setShowTeacherDropdown(true);
                        setOtoForm(prev => ({ ...prev, teacherId: 0 }));
                      }}
                      onFocus={() => setShowTeacherDropdown(true)}
                      className="w-full bg-white border"
                    />
                    {showTeacherDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredTeachers.length === 0 ? (
                          <div className="p-2.5 text-xs text-gray-400">No teachers found</div>
                        ) : (
                          filteredTeachers.map((t) => (
                            <div
                              key={t.id}
                              onClick={() => {
                                setOtoForm(prev => ({ ...prev, teacherId: t.id }));
                                setTeacherSearch(`${t.name} (${t.unionId || `ID: ${t.id}`})`);
                                setShowTeacherDropdown(false);
                              }}
                              className="p-2.5 text-xs hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer border-b last:border-b-0 text-left"
                            >
                              <div className="font-semibold text-gray-800">{t.name}</div>
                              <div className="text-[10px] text-gray-500 font-mono">ID: {t.id} | Union ID: {t.unionId || "-"}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* SEARCHABLE STUDENT DROPDOWN */}
                  <div className="space-y-1 relative" ref={studentDropdownRef}>
                    <label className="text-xs font-medium text-gray-700">Select Student</label>
                    <Input
                      placeholder="Search student by name or ID..."
                      value={studentSearch}
                      onChange={(e) => {
                        setStudentSearch(e.target.value);
                        setShowStudentDropdown(true);
                        setOtoForm(prev => ({ ...prev, studentId: 0 }));
                      }}
                      onFocus={() => setShowStudentDropdown(true)}
                      className="w-full bg-white border"
                    />
                    {showStudentDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredStudents.length === 0 ? (
                          <div className="p-2.5 text-xs text-gray-400">No students found</div>
                        ) : (
                          filteredStudents.map((std) => (
                            <div
                              key={std.id}
                              onClick={() => {
                                setOtoForm(prev => ({ ...prev, studentId: std.id }));
                                setStudentSearch(`${std.name} (${std.profile?.enrollmentId || std.unionId || `ID: ${std.id}`})`);
                                setShowStudentDropdown(false);
                              }}
                              className="p-2.5 text-xs hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer border-b last:border-b-0 text-left"
                            >
                              <div className="font-semibold text-gray-800">{std.name}</div>
                              <div className="text-[10px] text-gray-500 font-mono">ID: {std.id} | Student ID: {std.profile?.enrollmentId || std.unionId || "-"}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Expected Duration (minutes)</label>
                    <Input type="number" placeholder="Expected Duration (min)" value={otoForm.sessionLength} onChange={(e) => setOtoForm({ ...otoForm, sessionLength: Number(e.target.value) })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Class Start Date & Time</label>
                    <Input type="datetime-local" value={otoForm.scheduledAt} onChange={(e) => setOtoForm({ ...otoForm, scheduledAt: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Session Notes (optional)</label>
                    <Input placeholder="Session notes..." value={otoForm.remarks} onChange={(e) => setOtoForm({ ...otoForm, remarks: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 text-white font-medium" disabled={editOneToOne.isPending}>
                    {editOneToOne.isPending ? "Updating..." : "Update Session"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Reschedule Modal */}
            <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
              <DialogContent className="max-w-md bg-white rounded-xl shadow-xl border border-gray-100">
                <DialogHeader><DialogTitle className="text-base font-bold text-gray-800">Reschedule 1-on-1 Session</DialogTitle></DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedOtoSession) return;
                  rescheduleOneToOne.mutate({
                    sessionId: selectedOtoSession.id,
                    scheduledAt: new Date(otoForm.scheduledAt),
                    sessionLength: otoForm.sessionLength,
                  });
                }} className="space-y-3 mt-2 text-left">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">New Start Date & Time</label>
                    <Input type="datetime-local" value={otoForm.scheduledAt} onChange={(e) => setOtoForm({ ...otoForm, scheduledAt: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Expected Duration (minutes)</label>
                    <Input type="number" placeholder="Expected Duration (min)" value={otoForm.sessionLength} onChange={(e) => setOtoForm({ ...otoForm, sessionLength: Number(e.target.value) })} required />
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 text-white font-medium" disabled={rescheduleOneToOne.isPending}>
                    {rescheduleOneToOne.isPending ? "Rescheduling..." : "Reschedule Session"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Teacher Request Reschedule Modal */}
            <Dialog open={teacherRescheduleOpen} onOpenChange={setTeacherRescheduleOpen}>
              <DialogContent className="max-w-md bg-white rounded-xl shadow-xl border border-gray-100">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-gray-800">Request 1-on-1 Reschedule</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedOtoSession) return;
                  requestReschedule.mutate({
                    sessionId: selectedOtoSession.id,
                    proposedScheduledAt: new Date(rescheduleForm.proposedScheduledAt),
                    reason: rescheduleForm.reason,
                  });
                }} className="space-y-3 mt-2 text-left">
                  <div>
                    <p className="text-xs text-gray-500 mb-2 font-light">
                      Proposed reschedule request for <b>"{selectedOtoSession?.title || "1-to-1 Session"}"</b>.
                      Your request will be submitted to the Super Admin for approval.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Proposed New Date & Time *</label>
                    <Input
                      type="datetime-local"
                      value={rescheduleForm.proposedScheduledAt}
                      onChange={(e) => setRescheduleForm({ ...rescheduleForm, proposedScheduledAt: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Reason for Rescheduling *</label>
                    <textarea
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white border-gray-200 text-gray-850 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                      placeholder="Please explain why you need to reschedule this class..."
                      value={rescheduleForm.reason}
                      onChange={(e) => setRescheduleForm({ ...rescheduleForm, reason: e.target.value })}
                      required
                      rows={3}
                    />
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 text-white font-medium mt-2" disabled={requestReschedule.isPending}>
                    {requestReschedule.isPending ? "Submitting Request..." : "Submit Reschedule Request"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Views (Direct or Tabbed) */}
        {type ? (
          type === "group" ? (
            <Tabs defaultValue="classes" className="w-full">
              <TabsList className="bg-slate-100 p-1 rounded-lg border max-w-md mb-4">
                <TabsTrigger value="classes" className="text-xs py-1.5 px-3">Group Classes</TabsTrigger>
                {(isAdmin || isTeacher || user?.role === "student") && (
                  <TabsTrigger value="balances" className="text-xs py-1.5 px-3">Group Balances</TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="classes">
                <Tabs defaultValue="active" className="w-full">
                  <TabsList className="bg-slate-50 p-1 rounded-lg border max-w-md mb-4 mt-2">
                    <TabsTrigger value="active" className="text-xs py-1.5 px-3">Active & Scheduled</TabsTrigger>
                    <TabsTrigger value="history" className="text-xs py-1.5 px-3">Session History</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="active" className="space-y-4">
                    {(() => {
                      const activeList = data?.filter((cls) => cls.status === "scheduled" || cls.status === "live") || [];
                      return renderClassesList(activeList);
                    })()}
                  </TabsContent>
                  
                  <TabsContent value="history" className="space-y-4">
                    {(() => {
                      const historyList = data?.filter((cls) => cls.status === "completed" || cls.status === "cancelled") || [];
                      return renderClassesList(historyList);
                    })()}
                  </TabsContent>
                </Tabs>
              </TabsContent>
              <TabsContent value="balances" className="space-y-4">
                {renderBalancesTable("group")}
              </TabsContent>
            </Tabs>
          ) : (
            <Tabs defaultValue="sessions" className="w-full">
              <TabsList className="bg-slate-100 p-1 rounded-lg border max-w-md mb-4">
                <TabsTrigger value="sessions" className="text-xs py-1.5 px-3">1-on-1 Sessions</TabsTrigger>
                {(isAdmin || isTeacher || user?.role === "student") && (
                  <TabsTrigger value="balances" className="text-xs py-1.5 px-3">Students & Balances</TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="sessions" className="space-y-4">
                {isAdmin && (
                  <div className="flex justify-end gap-2">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleOpenCreateOto}>
                      <Plus className="w-4 h-4 mr-2" /> New Session
                    </Button>
                  </div>
                )}
                {renderOneToOneList()}
              </TabsContent>
              <TabsContent value="balances" className="space-y-4">
                {renderBalancesTable("one_to_one")}
              </TabsContent>
            </Tabs>
          )
        ) : (
          <Tabs defaultValue="classes">
            <TabsList className="bg-gray-100 dark:bg-slate-900 border p-1 rounded-lg">
              <TabsTrigger value="classes">Classes</TabsTrigger>
              {(isAdmin || isTeacher || isSuperAdmin || user?.role === "student") && <TabsTrigger value="one-to-one">1-on-1 Sessions</TabsTrigger>}
            </TabsList>

            <TabsContent value="classes">
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="bg-slate-50 p-1 rounded-lg border max-w-md mb-4 mt-2">
                  <TabsTrigger value="active" className="text-xs py-1.5 px-3">Active & Scheduled</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs py-1.5 px-3">Session History</TabsTrigger>
                </TabsList>
                
                <TabsContent value="active" className="space-y-4">
                  {(() => {
                    const activeList = data?.filter((cls) => cls.status === "scheduled" || cls.status === "live") || [];
                    return renderClassesList(activeList);
                  })()}
                </TabsContent>
                
                <TabsContent value="history" className="space-y-4">
                  {(() => {
                    const historyList = data?.filter((cls) => cls.status === "completed" || cls.status === "cancelled") || [];
                    return renderClassesList(historyList);
                  })()}
                </TabsContent>
              </Tabs>
            </TabsContent>

          {(isAdmin || isTeacher || isSuperAdmin || user?.role === "student") && (
            <TabsContent value="one-to-one">
              <div className="space-y-4 mt-4">
                {isAdmin && (
                  <div className="flex justify-end gap-2">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleOpenCreateOto}>
                      <Plus className="w-4 h-4 mr-2" /> New Session
                    </Button>
                  </div>
                )}
                {renderOneToOneList()}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>

    {/* Schedule Session Dialog */}
    <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
      <DialogContent className="max-w-md bg-white rounded-2xl p-6 border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider">Schedule Class Session</DialogTitle>
        </DialogHeader>
        {selectedEnrollmentForSchedule && (() => {
          const target = selectedEnrollmentForSchedule.allocation?.oneToOne;
          const availableDurations = [];
          if ((target?.remaining30 || 0) > 0) availableDurations.push(30);
          if ((target?.remaining45 || 0) > 0) availableDurations.push(45);
          if ((target?.remaining60 || 0) > 0) availableDurations.push(60);

          return (
            <div className="space-y-4 py-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border text-slate-600">
                <p className="mb-1"><strong>Student:</strong> {selectedEnrollmentForSchedule.student?.name}</p>
                <p className="mb-1"><strong>Assigned Teacher:</strong> {selectedEnrollmentForSchedule.o2oTeacher?.name || "Unassigned"}</p>
                <p className="mt-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Remaining Balance</p>
                <div className="grid grid-cols-3 gap-2 mt-1 text-center font-mono">
                  <div className="bg-white p-1 border rounded">30 Min: {target?.remaining30 || 0}</div>
                  <div className="bg-white p-1 border rounded">45 Min: {target?.remaining45 || 0}</div>
                  <div className="bg-white p-1 border rounded">60 Min: {target?.remaining60 || 0}</div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-500">Select Duration</label>
                <select
                  value={selectedScheduleDuration}
                  onChange={(e) => setSelectedScheduleDuration(Number(e.target.value))}
                  className="w-full border rounded-lg p-2 bg-white text-xs outline-none"
                >
                  {availableDurations.map(d => (
                    <option key={d} value={d}>{d} Minutes</option>
                  ))}
                  {availableDurations.length === 0 && (
                    <option value={30}>30 Minutes (No Balance)</option>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-500">Scheduled Date & Time</label>
                <Input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-500">Remarks / Notes</label>
                <Input
                  type="text"
                  value={scheduleRemarks}
                  onChange={(e) => setScheduleRemarks(e.target.value)}
                  placeholder="Optional session notes"
                  className="w-full text-xs bg-white"
                />
              </div>
            </div>
          );
        })()}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl text-xs" onClick={() => setScheduleOpen(false)}>Cancel</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
            disabled={!scheduleDate || scheduleSessionMutation.isPending}
            onClick={() => {
              if (!selectedEnrollmentForSchedule || !scheduleDate) return;
              const teacherId = selectedEnrollmentForSchedule.allocation?.oneToOne?.teacherId || user?.id;
              if (!teacherId) {
                toast.error("No teacher assigned for this One-to-One allocation.");
                return;
              }
              scheduleSessionMutation.mutate({
                studentId: selectedEnrollmentForSchedule.studentId,
                teacherId: Number(teacherId),
                sessionLength: selectedScheduleDuration,
                scheduledAt: new Date(scheduleDate),
                remarks: scheduleRemarks || undefined,
              });
            }}
          >
            {scheduleSessionMutation.isPending ? "Scheduling..." : "Schedule Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
