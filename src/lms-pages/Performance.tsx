import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Award,
  Filter,
  Plus,
  History,
  Settings,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ChevronRight,
  TrendingUp,
  User,
  BookOpen,
  Clock,
  Star,
  MessageSquare,
  Sparkles,
  BookMarked
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function Performance() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";

  if (!user) return null;

  return (
    <div className="space-y-6">
      {isAdmin && <AcademicHeadPerformanceView />}
      {isStudent && <StudentPerformanceView studentId={user.id} />}
      {isTeacher && <TeacherPerformanceView teacherId={user.id} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACADEMIC HEAD / ADMIN VIEW
// ─────────────────────────────────────────────────────────────────────────────
function AcademicHeadPerformanceView() {
  const [activeTab, setActiveTab] = useState("reports");
  
  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Selected Report States
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  // Filters State
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterBatch, setFilterBatch] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Queries
  const filtersDataQuery = trpc.performance.getFiltersData.useQuery();
  const reportsQuery = trpc.performance.listReports.useQuery({
    type: filterType !== "all" ? (filterType as any) : undefined,
    assessmentPeriod: filterPeriod !== "all" ? filterPeriod : undefined,
    status: filterStatus !== "all" ? (filterStatus as any) : undefined,
    batchId: filterBatch !== "all" ? Number(filterBatch) : undefined,
  });

  const historyQuery = trpc.performance.getReportHistory.useQuery(
    { reportId: selectedReportId || 0 },
    { enabled: !!selectedReportId }
  );

  const archiveMutation = trpc.performance.archiveReport.useMutation({
    onSuccess: () => {
      toast.success("Report archived successfully");
      reportsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Filtered reports locally for search term
  const filteredReports = reportsQuery.data?.filter((r) => {
    if (!searchTerm) return true;
    return r.targetUser?.name.toLowerCase().includes(searchTerm.toLowerCase());
  }) || [];

  const handleOpenDetails = (report: any) => {
    setSelectedReport(report);
    setIsDetailsOpen(true);
  };

  const handleOpenHistory = (reportId: number) => {
    setSelectedReportId(reportId);
    setIsHistoryOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-emerald-950 flex items-center gap-2">
            <Award className="w-7 h-7 text-emerald-600" />
            Performance Assessment
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Conduct student and teacher evaluations, track key metrics, and configure academic grading systems.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-100 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Report
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-gray-100 p-1 rounded-xl">
          <TabsTrigger value="reports" className="px-5 py-2 text-sm font-semibold rounded-lg">
            Evaluation Reports
          </TabsTrigger>
          <TabsTrigger value="configs" className="px-5 py-2 text-sm font-semibold rounded-lg">
            Criteria & Weights
          </TabsTrigger>
        </TabsList>

        {/* REPORTS TAB */}
        <TabsContent value="reports" className="space-y-4">
          {/* FILTER BAR */}
          <Card className="border shadow-sm">
            <CardContent className="p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="search" className="text-xs font-semibold text-gray-500 uppercase">Search User</Label>
                <Input
                  id="search"
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="w-[130px]">
                <Label className="text-xs font-semibold text-gray-500 uppercase">Role</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-[150px]">
                <Label className="text-xs font-semibold text-gray-500 uppercase">Period</Label>
                <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Periods</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semester">Semester</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-[160px]">
                <Label className="text-xs font-semibold text-gray-500 uppercase">Batch / Course</Label>
                <Select value={filterBatch} onValueChange={setFilterBatch}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Batches</SelectItem>
                    {filtersDataQuery.data?.batches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-[130px]">
                <Label className="text-xs font-semibold text-gray-500 uppercase">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* REPORTS LIST TABLE */}
          <Card className="border shadow-sm overflow-hidden">
            {reportsQuery.isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading reports...</div>
            ) : filteredReports.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                No performance reports found matching criteria.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="font-semibold text-gray-700">Target User</TableHead>
                    <TableHead className="font-semibold text-gray-700">Role</TableHead>
                    <TableHead className="font-semibold text-gray-700">Course / Batch</TableHead>
                    <TableHead className="font-semibold text-gray-700">Period</TableHead>
                    <TableHead className="font-semibold text-gray-700">Dates</TableHead>
                    <TableHead className="font-semibold text-gray-700">Score</TableHead>
                    <TableHead className="font-semibold text-gray-700">Grade</TableHead>
                    <TableHead className="font-semibold text-gray-700">Status</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report.id} className="hover:bg-gray-50/50">
                      <TableCell className="font-medium text-emerald-950">{report.targetUser?.name}</TableCell>
                      <TableCell className="capitalize text-gray-600">{report.type}</TableCell>
                      <TableCell className="text-gray-600">
                        {report.targetUser?.profile?.course || report.targetUser?.profile?.batch || "N/A"}
                      </TableCell>
                      <TableCell className="capitalize text-gray-600">{report.assessmentPeriod}</TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(report.startDate).toLocaleDateString()} - {new Date(report.endDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-bold text-gray-800">{report.totalScore}%</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          report.grade === "A+" || report.grade === "A"
                            ? "bg-green-100 text-green-800"
                            : report.grade === "B"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {report.grade}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          report.status === "published"
                            ? "bg-emerald-100 text-emerald-800"
                            : report.status === "draft"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {report.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDetails(report)}>
                          View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenHistory(report.id)}>
                          History
                        </Button>
                        {report.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                            onClick={() => {
                              setSelectedReport(report);
                              setIsEditOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {report.status === "published" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50"
                            onClick={() => {
                              setSelectedReport(report);
                              setIsEditOpen(true);
                            }}
                          >
                            Update
                          </Button>
                        )}
                        {report.status !== "archived" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (confirm("Are you sure you want to archive this performance report?")) {
                                archiveMutation.mutate({ id: report.id });
                              }
                            }}
                          >
                            Archive
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* CONFIGS TAB */}
        <TabsContent value="configs">
          <EvaluationConfigsView />
        </TabsContent>
      </Tabs>

      {/* CREATE REPORT DIALOG */}
      <CreateReportDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} refetchReports={() => reportsQuery.refetch()} />

      {/* EDIT/UPDATE DIALOG */}
      <EditReportDialog isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} report={selectedReport} refetchReports={() => reportsQuery.refetch()} />

      {/* DETAILS DIALOG */}
      <ReportDetailsDialog isOpen={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} report={selectedReport} />

      {/* HISTORY DIALOG */}
      <ReportHistoryDialog isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={historyQuery.data || []} isLoading={historyQuery.isLoading} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGS SUB-VIEW
// ─────────────────────────────────────────────────────────────────────────────
function EvaluationConfigsView() {
  const [configType, setConfigType] = useState<"student" | "teacher">("student");
  
  // Student Criteria Config Form
  const [studentConfigName, setStudentConfigName] = useState("Default Student Evaluation Criteria");
  const [studentAttW, setStudentAttW] = useState(30);
  const [studentOtoW, setStudentOtoW] = useState(25);
  const [studentAssW, setStudentAssW] = useState(25);
  const [studentEngW, setStudentEngW] = useState(20);

  // Teacher Criteria Config Form
  const [teacherConfigName, setTeacherConfigName] = useState("Default Teacher Evaluation Criteria");
  const [teacherCompW, setTeacherCompW] = useState(40);
  const [teacherPuncW, setTeacherPuncW] = useState(30);
  const [teacherFeedW, setTeacherFeedW] = useState(30);

  // Load existing configs
  const activeStudentConfig = trpc.performance.getDefaultConfig.useQuery({ type: "student" });
  const activeTeacherConfig = trpc.performance.getDefaultConfig.useQuery({ type: "teacher" });

  useEffect(() => {
    if (activeStudentConfig.data && activeStudentConfig.data.id !== 0) {
      setStudentConfigName(activeStudentConfig.data.name);
      const c = activeStudentConfig.data.criteria as any;
      if (c) {
        setStudentAttW(c.attendanceWeight ?? 30);
        setStudentOtoW(c.oneToOneWeight ?? 25);
        setStudentAssW(c.assignmentsWeight ?? 25);
        setStudentEngW(c.engagementWeight ?? 20);
      }
    }
  }, [activeStudentConfig.data]);

  useEffect(() => {
    if (activeTeacherConfig.data && activeTeacherConfig.data.id !== 0) {
      setTeacherConfigName(activeTeacherConfig.data.name);
      const c = activeTeacherConfig.data.criteria as any;
      if (c) {
        setTeacherCompW(c.classCompletionWeight ?? 40);
        setTeacherPuncW(c.punctualityWeight ?? 30);
        setTeacherFeedW(c.feedbackWeight ?? 30);
      }
    }
  }, [activeTeacherConfig.data]);

  const saveConfigMutation = trpc.performance.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Criteria configuration saved successfully!");
      activeStudentConfig.refetch();
      activeTeacherConfig.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSaveStudentConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const sum = studentAttW + studentOtoW + studentAssW + studentEngW;
    if (sum !== 100) {
      toast.error(`Weights must sum to 100%. Current sum: ${sum}%`);
      return;
    }

    saveConfigMutation.mutate({
      type: "student",
      name: studentConfigName,
      criteria: {
        attendanceWeight: studentAttW,
        oneToOneWeight: studentOtoW,
        assignmentsWeight: studentAssW,
        engagementWeight: studentEngW,
      },
      isDefault: true,
    });
  };

  const handleSaveTeacherConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const sum = teacherCompW + teacherPuncW + teacherFeedW;
    if (sum !== 100) {
      toast.error(`Weights must sum to 100%. Current sum: ${sum}%`);
      return;
    }

    saveConfigMutation.mutate({
      type: "teacher",
      name: teacherConfigName,
      criteria: {
        classCompletionWeight: teacherCompW,
        punctualityWeight: teacherPuncW,
        feedbackWeight: teacherFeedW,
      },
      isDefault: true,
    });
  };

  return (
    <Card className="border shadow-sm max-w-3xl">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-emerald-950 flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-600" />
          Evaluation Criteria & Weightage
        </CardTitle>
        <CardDescription>
          Define categories and weight distribution used for automatic scoring. Values must total exactly 100%.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 border-b pb-4 mb-6">
          <Button
            type="button"
            variant={configType === "student" ? "default" : "outline"}
            onClick={() => setConfigType("student")}
            className={configType === "student" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            Student Criteria
          </Button>
          <Button
            type="button"
            variant={configType === "teacher" ? "default" : "outline"}
            onClick={() => setConfigType("teacher")}
            className={configType === "teacher" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            Teacher Criteria
          </Button>
        </div>

        {configType === "student" ? (
          <form onSubmit={handleSaveStudentConfig} className="space-y-4">
            <div>
              <Label htmlFor="studConfigName">Configuration Template Name</Label>
              <Input
                id="studConfigName"
                value={studentConfigName}
                onChange={(e) => setStudentConfigName(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="studAttW">Group Class Attendance Weight (%)</Label>
                <Input
                  id="studAttW"
                  type="number"
                  min="0"
                  max="100"
                  value={studentAttW}
                  onChange={(e) => setStudentAttW(Number(e.target.value))}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="studOtoW">1-to-1 Session Attendance Weight (%)</Label>
                <Input
                  id="studOtoW"
                  type="number"
                  min="0"
                  max="100"
                  value={studentOtoW}
                  onChange={(e) => setStudentOtoW(Number(e.target.value))}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="studAssW">Assignment Submission Weight (%)</Label>
                <Input
                  id="studAssW"
                  type="number"
                  min="0"
                  max="100"
                  value={studentAssW}
                  onChange={(e) => setStudentAssW(Number(e.target.value))}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="studEngW">Student Engagement (Chat Messages) Weight (%)</Label>
                <Input
                  id="studEngW"
                  type="number"
                  min="0"
                  max="100"
                  value={studentEngW}
                  onChange={(e) => setStudentEngW(Number(e.target.value))}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm font-semibold flex justify-between items-center">
              <span>Total Weight Accumulation:</span>
              <span>{studentAttW + studentOtoW + studentAssW + studentEngW}%</span>
            </div>

            <Button type="submit" disabled={saveConfigMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Save Student Configuration
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSaveTeacherConfig} className="space-y-4">
            <div>
              <Label htmlFor="teachConfigName">Configuration Template Name</Label>
              <Input
                id="teachConfigName"
                value={teacherConfigName}
                onChange={(e) => setTeacherConfigName(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="teachCompW">Class Completion Weight (%)</Label>
                <Input
                  id="teachCompW"
                  type="number"
                  min="0"
                  max="100"
                  value={teacherCompW}
                  onChange={(e) => setTeacherCompW(Number(e.target.value))}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="teachPuncW">Class Start Punctuality Weight (%)</Label>
                <Input
                  id="teachPuncW"
                  type="number"
                  min="0"
                  max="100"
                  value={teacherPuncW}
                  onChange={(e) => setTeacherPuncW(Number(e.target.value))}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="teachFeedW">Student Feedback Weight (%)</Label>
                <Input
                  id="teachFeedW"
                  type="number"
                  min="0"
                  max="100"
                  value={teacherFeedW}
                  onChange={(e) => setTeacherFeedW(Number(e.target.value))}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm font-semibold flex justify-between items-center">
              <span>Total Weight Accumulation:</span>
              <span>{teacherCompW + teacherPuncW + teacherFeedW}%</span>
            </div>

            <Button type="submit" disabled={saveConfigMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Save Teacher Configuration
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIALOGS
// ─────────────────────────────────────────────────────────────────────────────

// CREATE REPORT DIALOG
function CreateReportDialog({ isOpen, onClose, refetchReports }: { isOpen: boolean; onClose: () => void; refetchReports: () => void }) {
  const [roleType, setRoleType] = useState<"student" | "teacher">("student");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [period, setPeriod] = useState("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [draftData, setDraftData] = useState<any>(null);

  // Queries
  const usersQuery = trpc.performance.listTargetUsers.useQuery({ type: roleType }, { enabled: isOpen });
  const draftMutation = trpc.performance.generateDraftReport.useMutation({
    onSuccess: (data) => {
      setDraftData(data);
      toast.success("Auto-metrics derived successfully!");
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = trpc.performance.createReport.useMutation({
    onSuccess: () => {
      toast.success("Performance report saved successfully!");
      refetchReports();
      handleClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleClose = () => {
    setTargetUserId("");
    setStartDate("");
    setEndDate("");
    setRemarks("");
    setDraftData(null);
    onClose();
  };

  const handleGenerateDraft = () => {
    if (!targetUserId || !startDate || !endDate) {
      toast.error("Please fill in target user and date ranges");
      return;
    }
    draftMutation.mutate({
      targetUserId: Number(targetUserId),
      type: roleType,
      assessmentPeriod: period,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
    });
  };

  const handleSave = (status: "draft" | "published") => {
    if (!draftData) return;
    createMutation.mutate({
      targetUserId: Number(targetUserId),
      type: roleType,
      configId: draftData.configId,
      assessmentPeriod: period,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      status,
      autoMetrics: draftData.autoMetrics,
      totalScore: draftData.totalScore,
      grade: draftData.grade,
      remarks,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-emerald-950 font-bold flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-600" />
            Create Performance Assessment Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Target User Role</Label>
              <Select
                value={roleType}
                onValueChange={(val: any) => {
                  setRoleType(val);
                  setTargetUserId("");
                  setDraftData(null);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Target User</Label>
              {usersQuery.isLoading ? (
                <div className="text-sm text-gray-500 py-2">Loading users...</div>
              ) : (
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {usersQuery.data?.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label>Assessment Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semester">Semester</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="start">Start Date</Label>
                <Input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="end">End Date</Label>
                <Input
                  id="end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerateDraft}
            disabled={draftMutation.isPending || !targetUserId || !startDate || !endDate}
            className="w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold"
          >
            {draftMutation.isPending ? "Deriving metrics..." : "Retrieve & Calculate Auto Metrics"}
          </Button>

          {draftData && (
            <div className="space-y-4 border-t pt-4">
              <div className="bg-gray-50 p-4 rounded-xl border space-y-3">
                <h3 className="font-bold text-sm text-emerald-950 uppercase tracking-wide">
                  Derived Performance Metrics
                </h3>
                
                {roleType === "student" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 bg-white border rounded-lg shadow-sm">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase">Class Attendance</p>
                      <p className="text-lg font-bold text-gray-800">{draftData.autoMetrics.attendanceRate}%</p>
                      <p className="text-[10px] text-gray-400">
                        {draftData.autoMetrics.attendedClasses}/{draftData.autoMetrics.totalClasses} classes
                      </p>
                    </div>
                    <div className="p-3 bg-white border rounded-lg shadow-sm">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase">1-on-1 Sessions</p>
                      <p className="text-lg font-bold text-gray-800">{draftData.autoMetrics.oneToOneRate}%</p>
                      <p className="text-[10px] text-gray-400">
                        {draftData.autoMetrics.attendedOto}/{draftData.autoMetrics.totalOto} sessions
                      </p>
                    </div>
                    <div className="p-3 bg-white border rounded-lg shadow-sm">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase">Assignments</p>
                      <p className="text-lg font-bold text-gray-800">{draftData.autoMetrics.assignmentSubmissionRate}%</p>
                      <p className="text-[10px] text-gray-400">
                        {draftData.autoMetrics.submittedAssignments}/{draftData.autoMetrics.totalAssignments} sub
                      </p>
                    </div>
                    <div className="p-3 bg-white border rounded-lg shadow-sm">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase">Avg Marks / Chat</p>
                      <p className="text-lg font-bold text-gray-800">{draftData.autoMetrics.assignmentAvgMarks}%</p>
                      <p className="text-[10px] text-gray-400">{draftData.autoMetrics.messageCount} chat messages</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 bg-white border rounded-lg shadow-sm">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase">Class Completion</p>
                      <p className="text-lg font-bold text-gray-800">{draftData.autoMetrics.classCompletionRate}%</p>
                      <p className="text-[10px] text-gray-400">
                        {draftData.autoMetrics.completedClasses}/{draftData.autoMetrics.totalClasses} classes
                      </p>
                    </div>
                    <div className="p-3 bg-white border rounded-lg shadow-sm">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase">Class Punctuality</p>
                      <p className="text-lg font-bold text-gray-800">{draftData.autoMetrics.classPunctualityRate}%</p>
                      <p className="text-[10px] text-gray-400">Avg delay: {draftData.autoMetrics.avgDelayMins}m</p>
                    </div>
                    <div className="p-3 bg-white border rounded-lg shadow-sm">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase">1-on-1 Completion</p>
                      <p className="text-lg font-bold text-gray-800">{draftData.autoMetrics.oneToOneCompletionRate}%</p>
                      <p className="text-[10px] text-gray-400">
                        {draftData.autoMetrics.completedOto}/{draftData.autoMetrics.totalOto} sessions
                      </p>
                    </div>
                    <div className="p-3 bg-white border rounded-lg shadow-sm">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase">Student Feedback</p>
                      <p className="text-lg font-bold text-gray-800">{draftData.autoMetrics.avgRating} / 5</p>
                      <p className="text-[10px] text-gray-400">{draftData.autoMetrics.feedbackCount} ratings</p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center border-t pt-3 mt-2 bg-emerald-50 -mx-4 -mb-4 p-4 rounded-b-xl border-emerald-100">
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] text-emerald-800 font-semibold uppercase">Total Weighted Score</p>
                      <p className="text-2xl font-black text-emerald-950">{draftData.totalScore}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-800 font-semibold uppercase">Grading Grade</p>
                      <p className="text-2xl font-black text-emerald-950">{draftData.grade}</p>
                    </div>
                  </div>
                  <Sparkles className="w-6 h-6 text-emerald-600 animate-pulse" />
                </div>
              </div>

              <div>
                <Label htmlFor="rem">Manual Evaluation & Academic Remarks</Label>
                <Textarea
                  id="rem"
                  placeholder="Enter notes, observations, advice, feedback..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="mt-1 min-h-[80px]"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 border-t pt-3 gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {draftData && (
            <>
              <Button
                variant="secondary"
                disabled={createMutation.isPending}
                onClick={() => handleSave("draft")}
              >
                Save as Draft
              </Button>
              <Button
                disabled={createMutation.isPending}
                onClick={() => handleSave("published")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Publish report
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// EDIT/UPDATE REPORT DIALOG
function EditReportDialog({
  isOpen,
  onClose,
  report,
  refetchReports,
}: {
  isOpen: boolean;
  onClose: () => void;
  report: any;
  refetchReports: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [overrideScore, setOverrideScore] = useState<number>(0);
  const [overrideGrade, setOverrideGrade] = useState("");

  // Populate when report loads
  useState(() => {
    if (report) {
      setRemarks(report.remarks || "");
      setOverrideScore(Number(report.totalScore));
      setOverrideGrade(report.grade || "");
    }
  });

  // Keep state synced on report changes
  const handleOpen = () => {
    if (report) {
      setRemarks(report.remarks || "");
      setOverrideScore(Number(report.totalScore));
      setOverrideGrade(report.grade || "");
    }
  };

  const updateMutation = trpc.performance.updateReport.useMutation({
    onSuccess: () => {
      toast.success("Report updated successfully!");
      refetchReports();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpdate = (status: "draft" | "published") => {
    if (!report) return;
    updateMutation.mutate({
      id: report.id,
      status,
      totalScore: overrideScore,
      grade: overrideGrade,
      remarks,
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={() => {
        onClose();
      }}
    >
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle className="text-emerald-950 font-bold flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-600" />
            Update Assessment Report: {report?.targetUser?.name}
          </DialogTitle>
        </DialogHeader>

        {report && (
          <div className="space-y-4 my-2">
            <div className="bg-gray-50 p-3 rounded-lg border text-sm text-gray-700 grid grid-cols-2 gap-2">
              <div>
                <strong>Evaluation Period:</strong> <span className="capitalize">{report.assessmentPeriod}</span>
              </div>
              <div>
                <strong>Current Score/Grade:</strong> {report.totalScore}% ({report.grade})
              </div>
              <div className="col-span-2">
                <strong>Date Range:</strong> {new Date(report.startDate).toLocaleDateString()} - {new Date(report.endDate).toLocaleDateString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ovScore">Adjust Score (%)</Label>
                <Input
                  id="ovScore"
                  type="number"
                  min="0"
                  max="100"
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ovGrade">Adjust Grade</Label>
                <Input
                  id="ovGrade"
                  value={overrideGrade}
                  onChange={(e) => setOverrideGrade(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="editRemarks">Academic Remarks</Label>
              <Textarea
                id="editRemarks"
                placeholder="Enter notes, observations, advice, feedback..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="mt-1 min-h-[100px]"
              />
            </div>

            {report.status === "published" && (
              <div className="bg-amber-50 text-amber-800 p-2.5 rounded text-xs border border-amber-200">
                <strong>Notice:</strong> This report is already published. Saving updates will create a new version (v{report.version + 1}) to preserve published history.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t pt-3 gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={updateMutation.isPending}
            onClick={() => handleUpdate("draft")}
          >
            Save as Draft
          </Button>
          <Button
            disabled={updateMutation.isPending}
            onClick={() => handleUpdate("published")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Publish update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// DETAILS DIALOG
function ReportDetailsDialog({ isOpen, onClose, report }: { isOpen: boolean; onClose: () => void; report: any }) {
  if (!report) return null;
  const metrics = report.autoMetrics || {};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-emerald-950 font-bold flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-600" />
            Performance Assessment Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 my-2">
          {/* Main User Block */}
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-xl font-bold text-emerald-950">{report.targetUser?.name}</h2>
              <p className="text-sm text-gray-500 capitalize">{report.type} • Version {report.version}</p>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Period: {report.assessmentPeriod} ({new Date(report.startDate).toLocaleDateString()} - {new Date(report.endDate).toLocaleDateString()})
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase font-semibold">Final Assessment</p>
              <p className="text-3xl font-black text-emerald-700">{report.totalScore}%</p>
              <span className="inline-block px-2 py-0.5 mt-1 bg-emerald-100 text-emerald-800 font-bold rounded text-xs">
                Grade: {report.grade}
              </span>
            </div>
          </div>

          {/* Derived Metrics Grid */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-emerald-950 uppercase tracking-wide">
              Automatic Derived Analytics
            </h3>

            {report.type === "student" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border rounded-xl bg-white shadow-sm flex items-center gap-3">
                  <BookOpen className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Class Attendance</p>
                    <p className="text-lg font-bold text-gray-800">{metrics.attendanceRate}%</p>
                    <p className="text-[10px] text-gray-400">
                      Attended {metrics.attendedClasses} of {metrics.totalClasses} classes
                    </p>
                  </div>
                </div>

                <div className="p-3 border rounded-xl bg-white shadow-sm flex items-center gap-3">
                  <Clock className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">1-on-1 Sessions</p>
                    <p className="text-lg font-bold text-gray-800">{metrics.oneToOneRate}%</p>
                    <p className="text-[10px] text-gray-400">
                      Attended {metrics.attendedOto} of {metrics.totalOto} sessions
                    </p>
                  </div>
                </div>

                <div className="p-3 border rounded-xl bg-white shadow-sm flex items-center gap-3">
                  <BookMarked className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Assignment Submissions</p>
                    <p className="text-lg font-bold text-gray-800">{metrics.assignmentSubmissionRate}%</p>
                    <p className="text-[10px] text-gray-400">
                      Submitted {metrics.submittedAssignments} of {metrics.totalAssignments} tasks
                    </p>
                  </div>
                </div>

                <div className="p-3 border rounded-xl bg-white shadow-sm flex items-center gap-3">
                  <Star className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Average Assignment Marks</p>
                    <p className="text-lg font-bold text-gray-800">{metrics.assignmentAvgMarks}%</p>
                    <p className="text-[10px] text-gray-400">{metrics.messageCount} chat messages sent</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border rounded-xl bg-white shadow-sm flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Group Class Completion</p>
                    <p className="text-lg font-bold text-gray-800">{metrics.classCompletionRate}%</p>
                    <p className="text-[10px] text-gray-400">
                      Conducted {metrics.completedClasses} of {metrics.totalClasses} classes
                    </p>
                  </div>
                </div>

                <div className="p-3 border rounded-xl bg-white shadow-sm flex items-center gap-3">
                  <Clock className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Class Start Punctuality</p>
                    <p className="text-lg font-bold text-gray-800">{metrics.classPunctualityRate}%</p>
                    <p className="text-[10px] text-gray-400">Average delay: {metrics.avgDelayMins} mins</p>
                  </div>
                </div>

                <div className="p-3 border rounded-xl bg-white shadow-sm flex items-center gap-3">
                  <Clock className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">1-on-1 Sessions Completed</p>
                    <p className="text-lg font-bold text-gray-800">{metrics.oneToOneCompletionRate}%</p>
                    <p className="text-[10px] text-gray-400">
                      Conducted {metrics.completedOto} of {metrics.totalOto} sessions
                    </p>
                  </div>
                </div>

                <div className="p-3 border rounded-xl bg-white shadow-sm flex items-center gap-3">
                  <Star className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase">Student Feedback Rating</p>
                    <p className="text-lg font-bold text-gray-800">{metrics.avgRating} / 5</p>
                    <p className="text-[10px] text-gray-400">From {metrics.feedbackCount} feedback sheets</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Academic Head Remarks */}
          <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-2">
            <h3 className="font-bold text-sm text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              Academic Head Observations & Remarks
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {report.remarks || "No remarks entered for this report."}
            </p>
          </div>
        </div>

        <DialogFooter className="border-t pt-3">
          <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// HISTORY DIALOG
function ReportHistoryDialog({
  isOpen,
  onClose,
  history,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  history: any[];
  isLoading: boolean;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-emerald-950 font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            Report Assessment Version History
          </DialogTitle>
        </DialogHeader>

        <div className="my-2 space-y-4">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading version history...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No version history found.</div>
          ) : (
            <div className="space-y-4 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-emerald-100">
              {history.map((h, i) => (
                <div key={h.id} className="relative pl-8 flex gap-4 items-start">
                  {/* Timeline dot */}
                  <div className={`absolute left-1.5 w-4 h-4 rounded-full border-2 ${
                    i === 0 ? "bg-emerald-600 border-emerald-200 ring-2 ring-emerald-50" : "bg-white border-emerald-300"
                  }`} />
                  
                  <Card className={`flex-1 border shadow-none ${i === 0 ? "border-emerald-100 bg-emerald-50/10" : ""}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-emerald-800 uppercase bg-emerald-50 px-2 py-0.5 rounded">
                          Version {h.version} {h.isLatest ? "(Latest)" : ""}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(h.createdAt).toLocaleDateString()} {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <p className="text-gray-800 font-semibold">Score: {h.totalScore}% • Grade: {h.grade}</p>
                        <span className="text-xs text-gray-500 capitalize">Status: {h.status}</span>
                      </div>
                      {h.remarks && (
                        <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded italic border border-gray-100">
                          &ldquo;{h.remarks}&rdquo;
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400">Evaluated by: {h.createdBy?.name || "Academic Head"}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT PERFORMANCE PORTAL VIEW
// ─────────────────────────────────────────────────────────────────────────────
function StudentPerformanceView({ studentId }: { studentId: number }) {
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Fetch only their own published reports
  const reportsQuery = trpc.performance.listReports.useQuery({
    targetUserId: studentId,
    status: "published",
  });

  const reportsList = reportsQuery.data || [];

  // Format data for Recharts (reverse to display chronologically left-to-right)
  const chartData = [...reportsList]
    .reverse()
    .map((r) => ({
      period: new Date(r.startDate).toLocaleDateString([], { month: "short", year: "2-digit" }),
      Score: Number(r.totalScore),
    }));

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 p-6 rounded-2xl border text-white shadow-md">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Award className="w-7 h-7 text-emerald-300" />
          My Performance Dashboard
        </h1>
        <p className="text-emerald-100 text-sm mt-1">
          Review academic feedback, attendance indicators, assignment evaluations, and track your overall course progress.
        </p>
      </div>

      {reportsQuery.isLoading ? (
        <div className="p-8 text-center text-gray-500 bg-white border rounded-xl">Loading assessments...</div>
      ) : reportsList.length === 0 ? (
        <div className="p-12 text-center text-gray-500 bg-white border rounded-xl">
          <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          No performance reports have been published for you yet.
        </div>
      ) : (
        <>
          {/* Progress Chart */}
          {chartData.length > 1 && (
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Performance Score Trend
                </CardTitle>
                <CardDescription>Visualizing your assessment scores over the academic periods.</CardDescription>
              </CardHeader>
              <CardContent className="h-64 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: -10, right: 10, top: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="period" stroke="#9CA3AF" fontSize={11} />
                    <YAxis domain={[0, 100]} stroke="#9CA3AF" fontSize={11} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="Score"
                      stroke="#059669"
                      strokeWidth={3}
                      dot={{ r: 5, fill: "#059669" }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Reports List */}
          <div className="space-y-4">
            <h2 className="font-bold text-emerald-950 text-md flex items-center gap-1.5">
              <BookMarked className="w-5 h-5 text-emerald-600" />
              Published Academic Assessments
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reportsList.map((report) => (
                <Card
                  key={report.id}
                  className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    setSelectedReport(report);
                    setIsDetailsOpen(true);
                  }}
                >
                  <CardHeader className="p-4 pb-2 border-b flex flex-row justify-between items-center bg-gray-50/50">
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded capitalize">
                      {report.assessmentPeriod} Report
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(report.startDate).toLocaleDateString()} - {new Date(report.endDate).toLocaleDateString()}
                    </span>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Total Performance Score</p>
                        <p className="text-2xl font-black text-emerald-700 mt-0.5">{report.totalScore}%</p>
                      </div>
                      <div className="bg-emerald-600 text-white rounded-lg p-2.5 min-w-[50px] text-center shadow-sm">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-emerald-100">Grade</p>
                        <p className="text-lg font-black">{report.grade}</p>
                      </div>
                    </div>

                    {report.remarks && (
                      <div className="bg-gray-50 p-2.5 rounded border text-xs text-gray-600 line-clamp-2">
                        <strong>Remarks:</strong> &ldquo;{report.remarks}&rdquo;
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs text-emerald-700 font-semibold border-t pt-2 mt-2">
                      <span>Click to view detailed metrics breakdown</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      <ReportDetailsDialog isOpen={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} report={selectedReport} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER PERFORMANCE PORTAL VIEW
// ─────────────────────────────────────────────────────────────────────────────
function TeacherPerformanceView({ teacherId }: { teacherId: number }) {
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Fetch only their own published reports
  const reportsQuery = trpc.performance.listReports.useQuery({
    targetUserId: teacherId,
    status: "published",
  });

  const reportsList = reportsQuery.data || [];

  // Format data for Recharts
  const chartData = [...reportsList]
    .reverse()
    .map((r) => ({
      period: new Date(r.startDate).toLocaleDateString([], { month: "short", year: "2-digit" }),
      Score: Number(r.totalScore),
    }));

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 p-6 rounded-2xl border text-white shadow-md">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Award className="w-7 h-7 text-emerald-300" />
          Teacher Performance Reports
        </h1>
        <p className="text-emerald-100 text-sm mt-1">
          Review your assessment reports compiled by the Academic Head, including punctuality, class completions, and student ratings.
        </p>
      </div>

      {reportsQuery.isLoading ? (
        <div className="p-8 text-center text-gray-500 bg-white border rounded-xl">Loading assessments...</div>
      ) : reportsList.length === 0 ? (
        <div className="p-12 text-center text-gray-500 bg-white border rounded-xl">
          <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          No performance reports have been published for you yet.
        </div>
      ) : (
        <>
          {/* Progress Chart */}
          {chartData.length > 1 && (
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Performance Score Trend
                </CardTitle>
                <CardDescription>Visualizing your assessment scores over the academic periods.</CardDescription>
              </CardHeader>
              <CardContent className="h-64 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: -10, right: 10, top: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="period" stroke="#9CA3AF" fontSize={11} />
                    <YAxis domain={[0, 100]} stroke="#9CA3AF" fontSize={11} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="Score"
                      stroke="#059669"
                      strokeWidth={3}
                      dot={{ r: 5, fill: "#059669" }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Reports List */}
          <div className="space-y-4">
            <h2 className="font-bold text-emerald-950 text-md flex items-center gap-1.5">
              <BookMarked className="w-5 h-5 text-emerald-600" />
              Published Academic Assessments
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reportsList.map((report) => (
                <Card
                  key={report.id}
                  className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    setSelectedReport(report);
                    setIsDetailsOpen(true);
                  }}
                >
                  <CardHeader className="p-4 pb-2 border-b flex flex-row justify-between items-center bg-gray-50/50">
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded capitalize">
                      {report.assessmentPeriod} Report
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(report.startDate).toLocaleDateString()} - {new Date(report.endDate).toLocaleDateString()}
                    </span>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Total Performance Score</p>
                        <p className="text-2xl font-black text-emerald-700 mt-0.5">{report.totalScore}%</p>
                      </div>
                      <div className="bg-emerald-600 text-white rounded-lg p-2.5 min-w-[50px] text-center shadow-sm">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-emerald-100">Grade</p>
                        <p className="text-lg font-black">{report.grade}</p>
                      </div>
                    </div>

                    {report.remarks && (
                      <div className="bg-gray-50 p-2.5 rounded border text-xs text-gray-600 line-clamp-2">
                        <strong>Remarks:</strong> &ldquo;{report.remarks}&rdquo;
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs text-emerald-700 font-semibold border-t pt-2 mt-2">
                      <span>Click to view detailed metrics breakdown</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      <ReportDetailsDialog isOpen={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} report={selectedReport} />
    </div>
  );
}
