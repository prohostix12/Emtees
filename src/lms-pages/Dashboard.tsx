import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  CreditCard,
  MessageCircle,
  ArrowRight,
  Play,
  Video,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
const JitsiMeet = dynamic(() => import("@/components/JitsiMeet"), { ssr: false });
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isTeacher = user?.role === "teacher";

  const statsQuery = trpc.admin.getDashboardStats.useQuery(undefined, { enabled: isAdmin });
  const myBatches = trpc.user.myBatches.useQuery(undefined, { enabled: !isAdmin });
  const myAttendance = trpc.class.myAttendance.useQuery(undefined, { enabled: user?.role === "student" });
  const notifications = trpc.student.myNotifications.useQuery(undefined, { enabled: user?.role === "student" });
  const teacherStatsQuery = trpc.user.getTeacherStats.useQuery(undefined, { enabled: isTeacher });
  const classesQuery = trpc.class.list.useQuery(undefined);
  const myProfile = trpc.user.myProfile.useQuery(undefined, { enabled: user?.role === "student" });

  const [alertsSearch, setAlertsSearch] = useState("");
  const [alertsBatchFilter, setAlertsBatchFilter] = useState<string>("all");

  const showAttendanceAlerts = ["super_admin", "admin", "teacher"].includes(user?.role || "");
  const attendanceAlertsQuery = trpc.class.listAttendanceAlerts.useQuery(
    { status: "active" },
    { enabled: showAttendanceAlerts }
  );

  // Jitsi Meeting states
  const [jitsiRoom, setJitsiRoom] = useState<string | null>(null);
  const [selectedClassForMeeting, setSelectedClassForMeeting] = useState<any>(null);

  const startClass = trpc.class.start.useMutation({
    onSuccess: () => {
      toast.success("Class started");
      classesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const recordJoinTime = trpc.class.recordJoinTime.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const recordLeaveTime = trpc.class.recordLeaveTime.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const handleStartClass = async (cls: any) => {
    try {
      await startClass.mutateAsync({ id: cls.id });
      setSelectedClassForMeeting(cls);
      setJitsiRoom(cls.meetingRoomId || `class-${cls.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start meeting");
    }
  };

  const handleJoinClass = (cls: any) => {
    setSelectedClassForMeeting(cls);
    setJitsiRoom(cls.meetingRoomId || `class-${cls.id}`);
  };

  const stats = statsQuery.data;

  if (!user) return null;

  const activeAlerts = attendanceAlertsQuery.data || [];
  const uniqueBatches = Array.from(
    new Map(
      activeAlerts
        .filter((alert: any) => alert.batch)
        .map((alert: any) => [alert.batch.id, alert.batch])
    ).values()
  ) as any[];

  const filteredAlerts = activeAlerts.filter((alert: any) => {
    if (alertsSearch) {
      const searchLower = alertsSearch.toLowerCase();
      const nameMatch = alert.student?.name?.toLowerCase().includes(searchLower);
      const unionIdMatch = alert.student?.unionId?.toLowerCase().includes(searchLower);
      if (!nameMatch && !unionIdMatch) {
        return false;
      }
    }
    if (alertsBatchFilter !== "all") {
      if (alert.batchId.toString() !== alertsBatchFilter) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {user.role === "student" && myProfile.data?.isRestricted && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 shadow-sm animate-pulse rounded-xl">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm text-red-800 dark:text-red-300">Access Restricted Due to Outstanding Fees</h4>
              <p className="text-xs text-red-700 dark:text-red-400">
                Your account access has been restricted due to outstanding dues. Please clear your outstanding balance to regain access to live classes, recorded sessions, group chats, and learning resources.
              </p>
              <Link href="/fees" className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 dark:text-red-300 mt-2 hover:underline">
                Pay Outstanding Fees <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {isAdmin && stats && (
          <>
            <StatCard icon={Users} label="Total Students" value={stats.totalStudents} color="bg-blue-50 text-blue-600" />
            <StatCard icon={GraduationCap} label="Teachers" value={stats.totalTeachers} color="bg-emerald-50 text-emerald-600" />
            <StatCard icon={BookOpen} label="Batches" value={stats.totalBatches} color="bg-purple-50 text-purple-600" />
            <StatCard icon={Calendar} label="Classes Held" value={stats.totalClasses} color="bg-orange-50 text-orange-600" />
          </>
        )}
        {isTeacher && (
          <>
            <StatCard icon={Calendar} label="My Classes" value={teacherStatsQuery.data?.classesCount ?? 0} color="bg-blue-50 text-blue-600" />
            <StatCard icon={Users} label="My Students" value={teacherStatsQuery.data?.studentCount ?? 0} color="bg-emerald-50 text-emerald-600" />
          </>
        )}
        {user.role === "student" && (
          <>
            <StatCard icon={BookOpen} label="My Batches" value={myBatches.data?.length || 0} color="bg-blue-50 text-blue-600" />
            <StatCard
              icon={Calendar}
              label="Attendance"
              value={`${myAttendance.data?.filter((a) => a.status === "present").length || 0}/${myAttendance.data?.length || 0}`}
              color="bg-emerald-50 text-emerald-600"
            />
            <StatCard icon={CreditCard} label="Fee Status" value="View" color="bg-purple-50 text-purple-600" />
            <StatCard icon={MessageCircle} label="Messages" value="-" color="bg-orange-50 text-orange-600" />
          </>
        )}
      </div>

      {user.role === "student" && myProfile.data?.profile && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">My Session Balance</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* One-to-One Sessions Card */}
            <Card className="border border-emerald-100 dark:border-emerald-950 bg-gradient-to-br from-emerald-50/20 to-white dark:from-emerald-950/10 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">One-to-One Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">Remaining</span>
                  <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {myProfile.data.profile.remainingOneToOneSessions}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Allocated</span>
                    <span className="font-semibold">{myProfile.data.profile.allocatedOneToOneSessions}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Attended</span>
                    <span className="font-semibold">{myProfile.data.profile.attendedOneToOneSessions}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Group Sessions Card */}
            <Card className="border border-blue-100 dark:border-blue-950 bg-gradient-to-br from-blue-50/20 to-white dark:from-blue-950/10 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-blue-800 dark:text-blue-400">Group Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">Remaining</span>
                  <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                    {myProfile.data.profile.remainingGroupSessions}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Allocated</span>
                    <span className="font-semibold">{myProfile.data.profile.allocatedGroupSessions}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Attended</span>
                    <span className="font-semibold">{myProfile.data.profile.attendedGroupSessions}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Sessions Card */}
            <Card className="border border-purple-100 dark:border-purple-950 bg-gradient-to-br from-purple-50/20 to-white dark:from-purple-950/10 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-purple-800 dark:text-purple-400">Total Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">Remaining</span>
                  <span className="text-3xl font-extrabold text-purple-600 dark:text-purple-400">
                    {myProfile.data.profile.totalRemainingSessions}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Allocated</span>
                    <span className="font-semibold">{myProfile.data.profile.totalAllocatedSessions}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Attended</span>
                    <span className="font-semibold">{myProfile.data.profile.totalAttendedSessions}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Jitsi fullscreen overlay */}
      {jitsiRoom && user && (
        <JitsiMeet
          classId={selectedClassForMeeting.classId || selectedClassForMeeting.id}
          isOneToOne={selectedClassForMeeting.title?.startsWith("1-on-1") || !!selectedClassForMeeting.isOneToOne}
          onJoin={() => {
            if (selectedClassForMeeting && user.role === "student" && !selectedClassForMeeting.title?.startsWith("1-on-1")) {
              recordJoinTime.mutate({ classId: selectedClassForMeeting.classId || selectedClassForMeeting.id });
            }
          }}
          onLeave={() => {
            if (selectedClassForMeeting && user.role === "student" && !selectedClassForMeeting.title?.startsWith("1-on-1")) {
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
            classesQuery.refetch();
          }}
        />
      )}

      {/* Live & Upcoming Classes Widget */}
      <Card className="border border-emerald-100/40 dark:border-emerald-950 bg-gradient-to-br from-emerald-50/10 via-white to-white dark:from-emerald-950/5 dark:via-gray-950 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-gray-50 dark:border-gray-900/50">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live & Upcoming Sessions
          </CardTitle>
          <Link href="/classes" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline flex items-center gap-1">
            View All Classes <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classesQuery.isLoading ? (
              <p className="text-xs text-gray-400 col-span-2 py-4 text-center">Loading classes...</p>
            ) : !classesQuery.data || classesQuery.data.filter(c => c.status === "ongoing" || c.status === "scheduled").length === 0 ? (
              <p className="text-xs text-gray-400 col-span-2 py-6 text-center">No active or scheduled live classes found.</p>
            ) : (
              classesQuery.data
                .filter(c => c.status === "ongoing" || c.status === "scheduled")
                .slice(0, 4)
                .map((cls) => (
                  <div key={cls.id} className="flex items-center justify-between p-3.5 rounded-xl border border-gray-100 dark:border-gray-900 bg-white dark:bg-gray-950 hover:shadow-md hover:border-emerald-200/50 dark:hover:border-emerald-900/50 transition-all duration-300">
                    <div className="space-y-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-gray-800 dark:text-gray-200 truncate max-w-[150px]">{cls.title}</span>
                        {cls.status === "ongoing" ? (
                          <Badge className="bg-red-500 hover:bg-red-600 text-white text-[9px] px-1 py-0 rounded animate-pulse">🔴 Live</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 rounded bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">Scheduled</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        Host: {cls.teacher?.name || "Not assigned"}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono">
                        Batch: {cls.batch?.name} | {cls.scheduledAt ? new Date(cls.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ""}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {cls.status === "ongoing" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] h-8 px-3 rounded-lg flex items-center gap-1"
                          onClick={() => handleJoinClass(cls)}
                          disabled={!!myProfile.data?.isRestricted}
                        >
                          <Video className="w-3.5 h-3.5" /> Join
                        </Button>
                      )}
                      {isTeacher && cls.teacherId === user.id && cls.status === "scheduled" && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white text-[11px] h-8 px-3 rounded-lg flex items-center gap-1"
                          onClick={() => handleStartClass(cls)}
                        >
                          <Play className="w-3.5 h-3.5" /> Start
                        </Button>
                      )}
                    </div>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {showAttendanceAlerts && (
        <Card className="border border-red-100/40 dark:border-red-950 bg-gradient-to-br from-red-50/10 via-white to-white dark:from-red-950/5 dark:via-gray-950 dark:to-gray-950 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-50 dark:border-gray-900/50">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-800 dark:text-red-400">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 animate-pulse" />
              At Risk Attendance Alerts (7+ Days Absent)
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
              <Input
                placeholder="Search student name or ID..."
                value={alertsSearch}
                onChange={(e) => setAlertsSearch(e.target.value)}
                className="h-8 text-xs w-full sm:w-48 bg-white dark:bg-gray-950"
              />
              <Select value={alertsBatchFilter} onValueChange={setAlertsBatchFilter}>
                <SelectTrigger className="h-8 text-xs w-full sm:w-48 bg-white dark:bg-gray-950">
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="all">All Batches</SelectItem>
                  {uniqueBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {attendanceAlertsQuery.isLoading ? (
              <p className="text-xs text-gray-400 py-4 text-center">Loading at-risk students...</p>
            ) : filteredAlerts.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">No at-risk students match the criteria.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-gray-100 dark:border-gray-900">
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Student Name</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Student ID</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Batch Name</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Assigned Teacher</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500 text-center">Consecutive Absences</TableHead>
                      <TableHead className="text-xs font-semibold h-8 text-gray-500">Last Attendance Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAlerts.map((alert: any) => (
                      <TableRow key={alert.id} className="border-gray-50 dark:border-gray-900/50 hover:bg-gray-50/50 dark:hover:bg-gray-900/10">
                        <TableCell className="py-2.5 font-medium text-xs text-gray-800 dark:text-gray-200">
                          {alert.student?.name}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {alert.student?.unionId}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-600 dark:text-gray-300">
                          {alert.batch?.name}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                          {alert.batch?.teacher?.name || "Not assigned"}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-center font-semibold text-red-600 dark:text-red-400">
                          <Badge variant="destructive" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-100 dark:border-red-900/30 font-semibold text-[11px] px-2 py-0.5 rounded">
                            {alert.consecutiveAbsences} days
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                          {alert.lastAttendanceDate
                            ? new Date(alert.lastAttendanceDate).toLocaleDateString([], { dateStyle: "medium" })
                            : "No classes attended"}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
            {isAdmin && (
              <>
                <QuickAction to="/users" label="Manage Users" desc="Add/edit students & teachers" />
                <QuickAction to="/batches" label="Manage Batches" desc="Create modules & batches" />
                <QuickAction to="/classes" label="Schedule Classes" desc="Plan live sessions" />
                {user.role !== "academic_head" && (
                  <QuickAction to="/fees" label="Fee Management" desc="Track payments & dues" />
                )}
              </>
            )}
            {isTeacher && (
              <>
                <QuickAction to="/classes" label="My Classes" desc="View & start sessions" />
                <QuickAction to="/chat" label="Group Chat" desc="Message your batches" />
                <QuickAction to="/reports" label="Reports" desc="View performance data" />
              </>
            )}
            {user.role === "student" && (
              <>
                <QuickAction to="/batches" label="My Batches" desc="View enrolled batches" />
                <QuickAction to="/chat" label="Group Chat" desc="Chat with batch members" />
                <QuickAction to="/classes" label="Upcoming Classes" desc="See scheduled sessions" />
                <QuickAction to="/fees" label="My Fees" desc="View payment status" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {user.role === "student" && notifications.data?.slice(0, 5).map((n) => (
              <div key={n.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-gray-500 text-xs">{n.message}</p>
                </div>
              </div>
            )) || (
              <p className="text-sm text-gray-500">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 truncate">{label}</p>
            <p className="text-xl md:text-2xl font-bold mt-0.5">{value}</p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ml-2 ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, label, desc }: { to: string; label: string; desc: string }) {
  return (
    <Link href={to} className="flex items-center justify-between p-4 rounded-lg border hover:border-emerald-300 hover:bg-emerald-50 transition-colors group">
      <div>
        <p className="font-medium text-gray-900 group-hover:text-emerald-700">{label}</p>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
    </Link>
  );
}
