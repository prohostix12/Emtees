import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  GitPullRequest,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  HelpCircle,
  FileText,
  Check,
  X,
  Activity,
  UserCheck,
  AlertTriangle,
  Ban
} from "lucide-react";

export default function RequestsPage() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin"].includes(user?.role || "");
  const isTeacher = user?.role === "teacher";

  // Student Queries
  const myBatchesQuery = trpc.user.myBatches.useQuery(undefined, { enabled: user?.role === "student" });
  const allBatchesQuery = trpc.learning.listBatches.useQuery(undefined, { enabled: user?.role === "student" });
  const myRequestsQuery = trpc.student.myRequests.useQuery(undefined, { enabled: user?.role === "student" });
  const createRequestMutation = trpc.student.createRequest.useMutation({
    onSuccess: () => {
      toast.success("Request submitted successfully!");
      setOpenRequestModal(false);
      resetForm();
      myRequestsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit request");
    },
  });
  const cancelRequestMutation = trpc.student.cancelRequest.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled successfully!");
      myRequestsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to cancel request");
    },
  });

  // Teacher Queries
  const myRescheduleQuery = trpc.class.listRescheduleRequests.useQuery(undefined, { enabled: isTeacher });

  // Admin Queries
  const pendingRequestsQuery = trpc.admin.listRequests.useQuery({ status: "pending" }, { enabled: isAdmin });
  const allRequestsQuery = trpc.admin.listRequests.useQuery(undefined, { enabled: isAdmin });
  const resolveRequestMutation = trpc.admin.resolveRequest.useMutation({
    onSuccess: () => {
      toast.success("Request resolved successfully!");
      setOpenResolveModal(false);
      setResolveNote("");
      setSelectedRequest(null);
      pendingRequestsQuery.refetch();
      allRequestsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to resolve request");
    },
  });

  // Admin Reschedule Queries & Mutations
  const pendingRescheduleQuery = trpc.class.listRescheduleRequests.useQuery({ status: "pending" }, { enabled: isAdmin });
  const allRescheduleQuery = trpc.class.listRescheduleRequests.useQuery(undefined, { enabled: isAdmin });
  const resolveRescheduleMutation = trpc.class.resolveRescheduleRequest.useMutation({
    onSuccess: () => {
      toast.success("Reschedule request resolved successfully!");
      setOpenResolveRescheduleModal(false);
      setResolveRescheduleNote("");
      setModifiedDateTime("");
      setSelectedReschedule(null);
      if (isAdmin) {
        pendingRescheduleQuery.refetch();
        allRescheduleQuery.refetch();
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to resolve reschedule request");
    },
  });

  // UI States
  const [openRequestModal, setOpenRequestModal] = useState(false);
  const [openResolveModal, setOpenResolveModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [resolveStatus, setResolveStatus] = useState<"approved" | "rejected">("approved");
  const [resolveNote, setResolveNote] = useState("");

  // Reschedule UI States
  const [openResolveRescheduleModal, setOpenResolveRescheduleModal] = useState(false);
  const [selectedReschedule, setSelectedReschedule] = useState<any>(null);
  const [resolveRescheduleStatus, setResolveRescheduleStatus] = useState<"approved" | "rejected">("approved");
  const [resolveRescheduleNote, setResolveRescheduleNote] = useState("");
  const [modifiedDateTime, setModifiedDateTime] = useState("");

  // Student Form State
  const [requestType, setRequestType] = useState<"batch_change" | "batch_removal">("batch_change");
  const [fromBatchId, setFromBatchId] = useState<string>("");
  const [toBatchId, setToBatchId] = useState<string>("");
  const [reason, setReason] = useState("");

  const resetForm = () => {
    setRequestType("batch_change");
    setFromBatchId("");
    setToBatchId("");
    setReason("");
  };

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromBatchId) {
      toast.error("Please select your current batch");
      return;
    }
    if (requestType === "batch_change" && !toBatchId) {
      toast.error("Please select desired batch");
      return;
    }

    createRequestMutation.mutate({
      requestType,
      fromBatchId: Number(fromBatchId),
      toBatchId: toBatchId ? Number(toBatchId) : undefined,
      reason: reason || undefined,
    });
  };

  const handleCancelRequest = (requestId: number) => {
    if (confirm("Are you sure you want to cancel this request?")) {
      cancelRequestMutation.mutate({ requestId });
    }
  };

  const openResolveDialog = (req: any, status: "approved" | "rejected") => {
    setSelectedRequest(req);
    setResolveStatus(status);
    setResolveNote("");
    setOpenResolveModal(true);
  };

  const handleResolveRequest = () => {
    if (!selectedRequest) return;
    resolveRequestMutation.mutate({
      requestId: selectedRequest.id,
      status: resolveStatus,
      note: resolveNote || undefined,
    });
  };

  // Helper styles
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm hover:bg-emerald-50/80 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize flex items-center gap-1.5 w-fit">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-rose-50 text-rose-700 border border-rose-200/60 shadow-sm hover:bg-rose-50/80 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize flex items-center gap-1.5 w-fit">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-slate-100 text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-150 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize flex items-center gap-1.5 w-fit">
            <Ban className="w-3.5 h-3.5" /> Cancelled
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200/60 shadow-sm hover:bg-amber-50/80 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize flex items-center gap-1.5 w-fit">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> Pending
          </Badge>
        );
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "batch_change":
        return <Badge variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-200 hover:bg-indigo-50 px-2 py-0.5 font-medium rounded-md">Batch Change</Badge>;
      case "batch_removal":
        return <Badge variant="outline" className="bg-red-50/50 text-red-700 border-red-200 hover:bg-red-50 px-2 py-0.5 font-medium rounded-md">Batch Removal</Badge>;
      case "hold":
        return <Badge variant="outline" className="bg-amber-50/50 text-amber-700 border-amber-200 hover:bg-amber-50 px-2 py-0.5 font-medium rounded-md">Course Hold</Badge>;
      case "rejoin":
        return <Badge variant="outline" className="bg-emerald-50/50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 px-2 py-0.5 font-medium rounded-md">Course Rejoin</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  if (user && !["super_admin", "admin", "student", "teacher"].includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center p-8 py-16 border rounded-xl bg-white space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold text-gray-800">Access Denied</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Only Super Admins, Admins, Teachers, and Students can access this page.
          </p>
        </div>
      </div>
    );
  }

  // Teacher Dashboard Page Content
  if (isTeacher) {
    const teacherRequests = myRescheduleQuery.data || [];
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-gray-955 dark:text-white">Reschedule Request Center</h3>
            <p className="text-sm text-gray-500 font-light mt-0.5">Track reschedule requests submitted for your one-to-one sessions.</p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Pending Requests</p>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {teacherRequests.filter(r => r.status === "pending").length}
                </h4>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Approved Requests</p>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {teacherRequests.filter(r => r.status === "approved").length}
                </h4>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-slate-50 text-slate-600 rounded-xl">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total History</p>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{teacherRequests.length}</h4>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Requests Table */}
        <Card className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-gray-50 dark:border-gray-800">
            <CardTitle className="text-base font-semibold text-gray-800 dark:text-gray-200">Request History</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50 dark:bg-gray-900/50 hover:bg-gray-50/50 border-b border-gray-100 dark:border-gray-800">
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Session Details</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Student</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Original Time</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Proposed Time</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Reason</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider">Submission Date</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Status</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Admin Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRescheduleQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-400 font-light">Loading reschedule requests...</TableCell>
                  </TableRow>
                ) : teacherRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-505 text-sm font-medium text-gray-700">No reschedule requests submitted yet.</p>
                      <p className="text-gray-400 text-xs mt-1">Submit reschedule requests directly from upcoming classes in your schedule.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  teacherRequests.map((req) => (
                    <TableRow key={req.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/40 dark:hover:bg-gray-900/40 transition-colors">
                      <TableCell className="px-5 py-3 font-medium text-gray-800 dark:text-gray-200">{req.session?.title || "1-to-1 Session"}</TableCell>
                      <TableCell className="px-5 py-3">{req.session?.student?.name || "-"}</TableCell>
                      <TableCell className="px-5 py-3 text-sm">{new Date(req.previousScheduledAt).toLocaleString()}</TableCell>
                      <TableCell className="px-5 py-3 text-sm font-semibold text-emerald-600">{new Date(req.proposedScheduledAt).toLocaleString()}</TableCell>
                      <TableCell className="px-5 py-3 text-gray-600 max-w-xs truncate" title={req.reason || undefined}>{req.reason}</TableCell>
                      <TableCell className="px-5 py-3 text-gray-400 font-light">
                        {new Date(req.requestedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </TableCell>
                      <TableCell className="px-5 py-3">{getStatusBadge(req.status)}</TableCell>
                      <TableCell className="px-5 py-3 text-gray-500 max-w-xs truncate" title={req.adminRemarks || undefined}>
                        {req.adminRemarks || <span className="text-gray-300 font-light italic">N/A</span>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Student Dashboard Page Content
  if (user?.role === "student") {
    const studentRequests = myRequestsQuery.data || [];
    const activeEnrollments = myBatchesQuery.data?.filter(e => e.status === "active") || [];
    const otherBatches = allBatchesQuery.data?.filter(b => !activeEnrollments.some(e => e.batchId === b.id)) || [];

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-gray-950 dark:text-white">Request Center</h3>
            <p className="text-sm text-gray-500 font-light mt-0.5">Submit and track batch transfer or batch removal requests.</p>
          </div>
          <Button
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium shadow-md transition-all self-start sm:self-auto shrink-0 flex items-center gap-2"
            onClick={() => setOpenRequestModal(true)}
          >
            <GitPullRequest className="w-4 h-4" /> Submit Request
          </Button>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Pending Requests</p>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {studentRequests.filter(r => r.status === "pending").length}
                </h4>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Approved Requests</p>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {studentRequests.filter(r => r.status === "approved").length}
                </h4>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-slate-50 text-slate-600 rounded-xl">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Submitted</p>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{studentRequests.length}</h4>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Requests Table */}
        <Card className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-gray-50 dark:border-gray-800">
            <CardTitle className="text-base font-semibold text-gray-800 dark:text-gray-200">Request History</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50 dark:bg-gray-900/50 hover:bg-gray-50/50 border-b border-gray-100 dark:border-gray-800">
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Type</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Current Batch</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Desired Batch</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Reason</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Submission Date</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Status</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Remarks</TableHead>
                  <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRequestsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-400 font-light">Loading request history...</TableCell>
                  </TableRow>
                ) : studentRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm font-medium">No requests submitted yet.</p>
                      <p className="text-gray-400 text-xs mt-1">Submit a request to change or remove batches.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  studentRequests.map((req) => (
                    <TableRow key={req.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/40 dark:hover:bg-gray-900/40 transition-colors">
                      <TableCell className="px-5 py-3">{getTypeBadge(req.requestType)}</TableCell>
                      <TableCell className="px-5 py-3 font-medium text-gray-700 dark:text-gray-300">{req.fromBatch?.name || "-"}</TableCell>
                      <TableCell className="px-5 py-3 text-gray-600 dark:text-gray-400">{req.toBatch?.name || "-"}</TableCell>
                      <TableCell className="px-5 py-3 text-gray-505 max-w-xs truncate" title={req.reason || undefined}>{req.reason || <span className="text-gray-300 font-light italic">No reason provided</span>}</TableCell>
                      <TableCell className="px-5 py-3 text-gray-400 font-light">
                        {new Date(req.requestedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </TableCell>
                      <TableCell className="px-5 py-3">{getStatusBadge(req.status)}</TableCell>
                      <TableCell className="px-5 py-3 text-gray-500 max-w-xs truncate" title={req.adminNote || undefined}>
                        {req.adminNote || <span className="text-gray-300 font-light italic">N/A</span>}
                      </TableCell>
                      <TableCell className="px-5 py-3 text-right">
                        {req.status === "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-655 hover:bg-red-50 dark:hover:bg-red-955/20 px-2 py-1 font-medium text-xs rounded-md flex items-center gap-1 w-fit ml-auto transition-all"
                            onClick={() => handleCancelRequest(req.id)}
                            disabled={cancelRequestMutation.isPending}
                          >
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create Request Modal */}
        <Dialog open={openRequestModal} onOpenChange={(open) => { setOpenRequestModal(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <GitPullRequest className="w-5 h-5 text-emerald-600" /> Submit New Request
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateRequest} className="space-y-5 mt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Request Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`py-2 px-3 text-sm font-medium border rounded-lg transition-all ${
                      requestType === "batch_change"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                    onClick={() => { setRequestType("batch_change"); setToBatchId(""); }}
                  >
                    Batch Change
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 text-sm font-medium border rounded-lg transition-all ${
                      requestType === "batch_removal"
                        ? "bg-red-50/50 text-red-700 border-red-200 shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                    onClick={() => { setRequestType("batch_removal"); setToBatchId(""); }}
                  >
                    Batch Removal
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Current Batch *</label>
                <select
                  required
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white border-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={fromBatchId}
                  onChange={(e) => setFromBatchId(e.target.value)}
                >
                  <option value="">Select Batch</option>
                  {activeEnrollments.map((e) => (
                    <option key={e.id} value={e.batchId}>
                      {e.batch?.name} ({e.batch?.timeSlot})
                    </option>
                  ))}
                </select>
                {activeEnrollments.length === 0 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" /> You are not currently active in any batches.
                  </p>
                )}
              </div>

              {requestType === "batch_change" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Desired Batch *</label>
                  <select
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white border-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    value={toBatchId}
                    onChange={(e) => setToBatchId(e.target.value)}
                  >
                    <option value="">Select Target Batch</option>
                    {otherBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.timeSlot || "Time not set"}) — Fee: ₹{b.courseFee || "0"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reason (Optional)</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="Explain why you are making this request..."
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setOpenRequestModal(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  disabled={createRequestMutation.isPending || activeEnrollments.length === 0}
                >
                  {createRequestMutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
  // Admin View Page Content
  const pendingRequests = pendingRequestsQuery.data || [];
  const auditLogs = allRequestsQuery.data?.filter(r => r.status !== "pending") || [];

  const pendingReschedules = pendingRescheduleQuery.data || [];
  const rescheduleHistory = allRescheduleQuery.data?.filter(r => r.status !== "pending") || [];

  const handleOpenResolveReschedule = (res: any, status: "approved" | "rejected") => {
    setSelectedReschedule(res);
    setResolveRescheduleStatus(status);
    setResolveRescheduleNote("");
    setModifiedDateTime(res.proposedScheduledAt ? new Date(res.proposedScheduledAt).toISOString().slice(0, 16) : "");
    setOpenResolveRescheduleModal(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-gray-955 dark:text-white">Academy Request Management</h3>
        <p className="text-sm text-gray-500 font-light mt-0.5">Manage student batch transfers/removals and teacher session rescheduling requests.</p>
      </div>

      <Tabs defaultValue="batch" className="space-y-6">
        <TabsList className="bg-gray-100 p-1 rounded-lg border w-fit">
          <TabsTrigger value="batch" className="px-4 py-1.5 text-sm font-medium rounded-md transition-all">
            Student Batch Requests
          </TabsTrigger>
          <TabsTrigger value="reschedule" className="px-4 py-1.5 text-sm font-medium rounded-md transition-all">
            Reschedule Requests ({pendingReschedules.length})
          </TabsTrigger>
        </TabsList>

        {/* BATCH REQUESTS CONTENT */}
        <TabsContent value="batch" className="space-y-6 mt-2">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="bg-white border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-455 text-gray-400 uppercase tracking-wider">Pending Requests</p>
                  <h4 className="text-xl font-bold text-gray-900 mt-0.5">{pendingRequests.length}</h4>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Approved Requests</p>
                  <h4 className="text-xl font-bold text-gray-900 mt-0.5">
                    {auditLogs.filter(r => r.status === "approved").length}
                  </h4>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Rejected Requests</p>
                  <h4 className="text-xl font-bold text-gray-900 mt-0.5">
                    {auditLogs.filter(r => r.status === "rejected").length}
                  </h4>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-slate-50 text-slate-600 rounded-xl">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total History</p>
                  <h4 className="text-xl font-bold text-gray-900 mt-0.5">{pendingRequests.length + auditLogs.length}</h4>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="pending">
            <TabsList className="bg-gray-100 p-1 rounded-lg border w-fit">
              <TabsTrigger value="pending" className="px-4 py-1.5 text-sm font-medium rounded-md transition-all">
                Pending Requests ({pendingRequests.length})
              </TabsTrigger>
              <TabsTrigger value="audit" className="px-4 py-1.5 text-sm font-medium rounded-md transition-all">
                Audit Log / History ({auditLogs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4 space-y-4">
              <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b">
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Student</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Request Type</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Current Batch</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Requested Batch</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Fee Difference</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Reason</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Submission Date</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequestsQuery.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-gray-400 font-light">Loading pending requests...</TableCell>
                        </TableRow>
                      ) : pendingRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12">
                            <Check className="w-12 h-12 text-emerald-500 bg-emerald-50 rounded-full p-2 mx-auto mb-3" />
                            <p className="text-gray-805 text-sm font-semibold text-gray-800">No pending requests!</p>
                            <p className="text-gray-400 text-xs mt-1">All student flexibility requests have been processed.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        pendingRequests.map((req) => (
                          <TableRow key={req.id} className="border-b hover:bg-gray-55/30 transition-colors">
                            <TableCell className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 bg-emerald-50 text-emerald-700 rounded-full font-bold flex items-center justify-center text-xs shrink-0">
                                  {req.student?.name?.[0]?.toUpperCase() || "U"}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{req.student?.name}</p>
                                  <p className="text-[10px] text-gray-400 tracking-wider font-light uppercase">{req.student?.profile?.enrollmentId || req.student?.unionId}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-3">{getTypeBadge(req.requestType)}</TableCell>
                            <TableCell className="px-5 py-3 font-medium text-gray-700">{req.fromBatch?.name || "-"}</TableCell>
                            <TableCell className="px-5 py-3 text-gray-600">{req.toBatch?.name || "-"}</TableCell>
                            <TableCell className="px-5 py-3">
                              {req.requestType === "batch_change" ? (
                                <div className="space-y-0.5">
                                  <div className="text-xs text-gray-400 font-light">Cur: ₹{req.fromBatchFee} | New: ₹{req.toBatchFee}</div>
                                  {req.feeDifference > 0 ? (
                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200/50 text-[10px] font-semibold flex items-center gap-1 w-fit">
                                      <AlertTriangle className="w-3 h-3" /> +₹{req.feeDifference}
                                    </Badge>
                                  ) : req.feeDifference < 0 ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200/50 text-[10px] font-semibold flex items-center gap-1 w-fit">
                                      <CheckCircle2 className="w-3 h-3" /> -₹{Math.abs(req.feeDifference)}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px] w-fit">
                                      No Diff
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300 font-light italic">N/A</span>
                              )}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-gray-500 max-w-xs truncate" title={req.reason || undefined}>
                              {req.reason || <span className="text-gray-300 font-light italic">No reason provided</span>}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-gray-400 font-light">
                              {new Date(req.requestedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1 flex items-center gap-1 shadow-sm transition-all"
                                  onClick={() => openResolveDialog(req, "approved")}
                                  disabled={resolveRequestMutation.isPending}
                                >
                                  <Check className="w-3.5 h-3.5" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 font-semibold text-xs px-3 py-1 flex items-center gap-1 transition-all"
                                  onClick={() => openResolveDialog(req, "rejected")}
                                  disabled={resolveRequestMutation.isPending}
                                >
                                  <X className="w-3.5 h-3.5" /> Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="mt-4 space-y-4">
              <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b">
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Student</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Request Type</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider">Current Batch</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider">Requested Batch</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider">Request Date</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider">Resolved Date</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider">Status</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider">Remarks / Comments</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-505 text-gray-500 uppercase tracking-wider">Processed By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRequestsQuery.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-gray-400 font-light">Loading audit log...</TableCell>
                        </TableRow>
                      ) : auditLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-808 text-sm font-semibold text-gray-800">Audit log is empty</p>
                            <p className="text-gray-400 text-xs mt-1">No completed or resolved requests found in database.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        auditLogs.map((req) => (
                          <TableRow key={req.id} className="border-b hover:bg-gray-55/30 transition-colors">
                            <TableCell className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 bg-gray-100 text-gray-700 rounded-full font-bold flex items-center justify-center text-xs shrink-0">
                                  {req.student?.name?.[0]?.toUpperCase() || "U"}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{req.student?.name}</p>
                                  <p className="text-[10px] text-gray-400 tracking-wider font-light uppercase">{req.student?.profile?.enrollmentId || req.student?.unionId}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-3">{getTypeBadge(req.requestType)}</TableCell>
                            <TableCell className="px-5 py-3 font-medium text-gray-700">{req.fromBatch?.name || "-"}</TableCell>
                            <TableCell className="px-5 py-3 text-gray-650 text-gray-600">{req.toBatch?.name || "-"}</TableCell>
                            <TableCell className="px-5 py-3 text-gray-400 font-light">
                              {new Date(req.requestedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-gray-400 font-light">
                              {req.resolvedAt ? new Date(req.resolvedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : "-"}
                            </TableCell>
                            <TableCell className="px-5 py-3">{getStatusBadge(req.status)}</TableCell>
                            <TableCell className="px-5 py-3 text-gray-500 max-w-xs truncate" title={req.adminNote || undefined}>
                              {req.adminNote || <span className="text-gray-300 font-light italic">N/A</span>}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-gray-600">
                              {req.status === "cancelled" ? (
                                <span className="text-gray-400 font-light italic">Student</span>
                              ) : (
                                req.resolver?.name || "-"
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* RESCHEDULE REQUESTS CONTENT */}
        <TabsContent value="reschedule" className="space-y-6 mt-2">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="bg-white border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Pending Requests</p>
                  <h4 className="text-xl font-bold text-gray-900 mt-0.5">{pendingReschedules.length}</h4>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Approved Requests</p>
                  <h4 className="text-xl font-bold text-gray-900 mt-0.5">
                    {rescheduleHistory.filter(r => r.status === "approved").length}
                  </h4>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Rejected Requests</p>
                  <h4 className="text-xl font-bold text-gray-900 mt-0.5">
                    {rescheduleHistory.filter(r => r.status === "rejected").length}
                  </h4>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-gray-100 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-slate-50 text-slate-600 rounded-xl">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total History</p>
                  <h4 className="text-xl font-bold text-gray-900 mt-0.5">{pendingReschedules.length + rescheduleHistory.length}</h4>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="pending">
            <TabsList className="bg-gray-100 p-1 rounded-lg border w-fit">
              <TabsTrigger value="pending" className="px-4 py-1.5 text-sm font-medium rounded-md transition-all">
                Pending Requests ({pendingReschedules.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="px-4 py-1.5 text-sm font-medium rounded-md transition-all">
                Audit Log / History ({rescheduleHistory.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4 space-y-4">
              <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b">
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-550 text-gray-500 uppercase tracking-wider">Teacher</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-550 text-gray-500 uppercase tracking-wider">Student</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-550 text-gray-500 uppercase tracking-wider">Session</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-550 text-gray-500 uppercase tracking-wider">Original Time</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-550 text-gray-500 uppercase tracking-wider text-emerald-600">Proposed Time</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-550 text-gray-500 uppercase tracking-wider">Reason</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-550 text-gray-500 uppercase tracking-wider">Submitted At</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-550 text-gray-500 uppercase tracking-wider text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRescheduleQuery.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-gray-400 font-light">Loading pending reschedule requests...</TableCell>
                        </TableRow>
                      ) : pendingReschedules.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12">
                            <Check className="w-12 h-12 text-emerald-500 bg-emerald-50 rounded-full p-2 mx-auto mb-3" />
                            <p className="text-gray-805 text-sm font-semibold text-gray-800">No pending reschedule requests!</p>
                            <p className="text-gray-400 text-xs mt-1">All teacher rescheduling requests have been processed.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        pendingReschedules.map((req) => (
                          <TableRow key={req.id} className="border-b hover:bg-gray-55/30 transition-colors">
                            <TableCell className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 bg-emerald-50 text-emerald-700 rounded-full font-bold flex items-center justify-center text-xs shrink-0">
                                  {req.requestedByUser?.name?.[0]?.toUpperCase() || "T"}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{req.requestedByUser?.name}</p>
                                  <p className="text-[10px] text-gray-400 tracking-wider font-light uppercase">{req.requestedByUser?.unionId}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 bg-slate-50 text-slate-700 rounded-full font-bold flex items-center justify-center text-xs shrink-0">
                                  {req.session?.student?.name?.[0]?.toUpperCase() || "S"}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{req.session?.student?.name}</p>
                                  <p className="text-[10px] text-gray-400 tracking-wider font-light uppercase">{req.session?.student?.profile?.enrollmentId || req.session?.student?.unionId}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-3 font-medium text-gray-700">{req.session?.title || "1-to-1 Session"}</TableCell>
                            <TableCell className="px-5 py-3 text-sm">{new Date(req.previousScheduledAt).toLocaleString()}</TableCell>
                            <TableCell className="px-5 py-3 text-sm font-semibold text-emerald-600">{new Date(req.proposedScheduledAt).toLocaleString()}</TableCell>
                            <TableCell className="px-5 py-3 text-gray-500 max-w-xs truncate" title={req.reason}>{req.reason}</TableCell>
                            <TableCell className="px-5 py-3 text-gray-400 font-light">
                              {new Date(req.requestedAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1 flex items-center gap-1 shadow-sm transition-all"
                                  onClick={() => handleOpenResolveReschedule(req, "approved")}
                                  disabled={resolveRescheduleMutation.isPending}
                                >
                                  <Check className="w-3.5 h-3.5" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 font-semibold text-xs px-3 py-1 flex items-center gap-1 transition-all"
                                  onClick={() => handleOpenResolveReschedule(req, "rejected")}
                                  disabled={resolveRescheduleMutation.isPending}
                                >
                                  <X className="w-3.5 h-3.5" /> Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-4 space-y-4">
              <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b">
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Teacher</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Student</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Session</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Original Time</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Approved/Proposed Time</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Submission Date</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Resolved Date</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Status</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Admin Remarks</TableHead>
                        <TableHead className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Processed By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRescheduleQuery.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-gray-400 font-light">Loading audit log...</TableCell>
                        </TableRow>
                      ) : rescheduleHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-808 text-sm font-semibold text-gray-800">Audit log is empty</p>
                            <p className="text-gray-400 text-xs mt-1">No completed or resolved reschedule requests found.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rescheduleHistory.map((req) => (
                          <TableRow key={req.id} className="border-b hover:bg-gray-55/30 transition-colors">
                            <TableCell className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 bg-gray-100 text-gray-700 rounded-full font-bold flex items-center justify-center text-xs shrink-0">
                                  {req.requestedByUser?.name?.[0]?.toUpperCase() || "T"}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{req.requestedByUser?.name}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-3">{req.session?.student?.name || "-"}</TableCell>
                            <TableCell className="px-5 py-3 font-medium text-gray-700">{req.session?.title || "1-to-1 Session"}</TableCell>
                            <TableCell className="px-5 py-3 text-sm">{new Date(req.previousScheduledAt).toLocaleString()}</TableCell>
                            <TableCell className="px-5 py-3 text-sm font-semibold text-emerald-600">
                              {new Date(req.proposedScheduledAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-gray-400 font-light">
                              {new Date(req.requestedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-gray-400 font-light">
                              {req.resolvedAt ? new Date(req.resolvedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : "-"}
                            </TableCell>
                            <TableCell className="px-5 py-3">{getStatusBadge(req.status)}</TableCell>
                            <TableCell className="px-5 py-3 text-gray-500 max-w-xs truncate" title={req.adminRemarks || undefined}>
                              {req.adminRemarks || <span className="text-gray-300 font-light italic">N/A</span>}
                            </TableCell>
                            <TableCell className="px-5 py-3 text-gray-650 text-gray-600">
                              {req.resolvedByUser?.name || "-"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Admin Resolve Student Request Modal */}
      <Dialog open={openResolveModal} onOpenChange={setOpenResolveModal}>
        <DialogContent className="max-w-md bg-white border border-gray-100 rounded-xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {resolveStatus === "approved" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600" />
              )}
              {resolveStatus === "approved" ? "Approve Request" : "Reject Request"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="bg-gray-50 p-3.5 rounded-lg border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Student:</span>
                <span className="text-gray-800 font-bold">{selectedRequest?.student?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Type:</span>
                <span className="text-gray-800 font-bold capitalize">{selectedRequest?.requestType?.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Current Batch:</span>
                <span className="text-gray-800 font-bold">{selectedRequest?.fromBatch?.name}</span>
              </div>
              {selectedRequest?.requestType === "batch_change" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-medium">Requested Batch:</span>
                    <span className="text-gray-850 font-bold text-gray-800">{selectedRequest?.toBatch?.name}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-dashed">
                    <span className="text-gray-400 font-medium">Fee Difference:</span>
                    <span className={`font-bold text-sm ${selectedRequest?.feeDifference > 0 ? "text-red-600" : selectedRequest?.feeDifference < 0 ? "text-emerald-600" : "text-gray-600"}`}>
                      {selectedRequest?.feeDifference > 0 ? `+₹${selectedRequest.feeDifference}` : selectedRequest?.feeDifference < 0 ? `-₹${Math.abs(selectedRequest.feeDifference)}` : "₹0"}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Add Remarks / Notes (Optional)</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                placeholder="Remarks will be visible to the student..."
                rows={3}
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setOpenResolveModal(false)}>
                Cancel
              </Button>
              <Button
                className={`text-white font-semibold ${
                  resolveStatus === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
                onClick={handleResolveRequest}
                disabled={resolveRequestMutation.isPending}
              >
                {resolveRequestMutation.isPending
                  ? "Processing..."
                  : resolveStatus === "approved"
                  ? "Confirm Approval"
                  : "Confirm Rejection"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Resolve Reschedule Request Modal */}
      <Dialog open={openResolveRescheduleModal} onOpenChange={setOpenResolveRescheduleModal}>
        <DialogContent className="max-w-md bg-white border border-gray-100 rounded-xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {resolveRescheduleStatus === "approved" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600" />
              )}
              {resolveRescheduleStatus === "approved" ? "Approve Reschedule" : "Reject Reschedule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="bg-gray-50 p-3.5 rounded-lg border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Teacher:</span>
                <span className="text-gray-800 font-bold">{selectedReschedule?.requestedByUser?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Student:</span>
                <span className="text-gray-800 font-bold">{selectedReschedule?.session?.student?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Session:</span>
                <span className="text-gray-800 font-bold">{selectedReschedule?.session?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Original Time:</span>
                <span className="text-gray-800 font-bold">{selectedReschedule?.previousScheduledAt ? new Date(selectedReschedule.previousScheduledAt).toLocaleString() : "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Proposed Time:</span>
                <span className="text-gray-800 font-semibold text-emerald-600">{selectedReschedule?.proposedScheduledAt ? new Date(selectedReschedule.proposedScheduledAt).toLocaleString() : "-"}</span>
              </div>
              {selectedReschedule?.reason && (
                <div className="mt-2 text-xs italic border-t pt-2 max-w-xs break-words">
                  <b>Reason:</b> "{selectedReschedule.reason}"
                </div>
              )}
            </div>

            {resolveRescheduleStatus === "approved" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-705 text-gray-750 flex items-center justify-between">
                  <span>Approved Time (Modify if required)</span>
                  <span className="text-[10px] text-gray-400 font-light">(Defaults to proposed time)</span>
                </label>
                <Input
                  type="datetime-local"
                  value={modifiedDateTime}
                  onChange={(e) => setModifiedDateTime(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Admin Remarks / Notes (Optional)</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                placeholder="Enter remarks for the audit trail..."
                rows={3}
                value={resolveRescheduleNote}
                onChange={(e) => setResolveRescheduleNote(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setOpenResolveRescheduleModal(false)}>
                Cancel
              </Button>
              <Button
                className={`text-white font-semibold ${
                  resolveRescheduleStatus === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
                onClick={() => {
                  if (!selectedReschedule) return;
                  resolveRescheduleMutation.mutate({
                    requestId: selectedReschedule.id,
                    status: resolveRescheduleStatus,
                    proposedScheduledAt: modifiedDateTime ? new Date(modifiedDateTime) : undefined,
                    adminRemarks: resolveRescheduleNote || undefined,
                  });
                }}
                disabled={resolveRescheduleMutation.isPending}
              >
                {resolveRescheduleMutation.isPending
                  ? "Processing..."
                  : resolveRescheduleStatus === "approved"
                  ? "Confirm Approval"
                  : "Confirm Rejection"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
