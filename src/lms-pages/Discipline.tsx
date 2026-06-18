import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Shield,
  Plus,
  AlertTriangle,
  CheckCircle,
  Eye,
  Edit2,
  Info,
  Calendar,
  UserCheck,
  FileText,
  UserX,
  CheckCircle2,
} from "lucide-react";

export default function DisciplinePage() {
  const { user } = useAuth();
  
  // Role checks
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";
  const canCreate = isAdmin || isTeacher;
  const canEdit = isAdmin;

  // tRPC Queries & Mutations
  const utils = trpc.useUtils();
  const listQuery = trpc.discipline.list.useQuery(undefined, { enabled: !!user });
  const statsQuery = trpc.discipline.getStats.useQuery(undefined, { enabled: !!user });
  const studentsQuery = trpc.discipline.listStudents.useQuery(undefined, { enabled: canCreate });

  const createMutation = trpc.discipline.create.useMutation({
    onSuccess: () => {
      toast.success("Disciplinary record created successfully!");
      setCreateOpen(false);
      resetCreateForm();
      utils.discipline.list.invalidate();
      utils.discipline.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.discipline.update.useMutation({
    onSuccess: () => {
      toast.success("Disciplinary record updated successfully!");
      setEditOpen(false);
      setEditingRecord(null);
      utils.discipline.list.invalidate();
      utils.discipline.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const resolveMutation = trpc.discipline.resolve.useMutation({
    onSuccess: () => {
      toast.success("Disciplinary record marked as resolved.");
      utils.discipline.list.invalidate();
      utils.discipline.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // State Management
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  
  // Create Form State
  const [createForm, setCreateForm] = useState({
    studentId: "",
    unionId: "",
    batch: "",
    level: "Warning" as "Warning" | "Final Warning" | "Suspension",
    reason: "",
    description: "",
  });
  const resetCreateForm = () => {
    setCreateForm({
      studentId: "",
      unionId: "",
      batch: "",
      level: "Warning",
      reason: "",
      description: "",
    });
  };

  // Edit Form State
  const [editingRecord, setEditingRecord] = useState<any>(null);

  // Auto-populate Create Form when student changes
  useEffect(() => {
    if (createForm.studentId && studentsQuery.data) {
      const student = studentsQuery.data.find((s) => s.id === Number(createForm.studentId));
      if (student) {
        setCreateForm((prev) => ({
          ...prev,
          unionId: student.unionId || "",
          batch: student.profile?.batch || "No Batch Assigned",
        }));
      }
    } else {
      setCreateForm((prev) => ({ ...prev, unionId: "", batch: "" }));
    }
  }, [createForm.studentId, studentsQuery.data]);

  // Load Edit Form details when editingRecord changes
  useEffect(() => {
    if (editingRecord) {
      setEditOpen(true);
    }
  }, [editingRecord]);

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            Disciplinary Center
          </h3>
          <p className="text-xs text-gray-500">
            {isStudent
              ? "View your disciplinary history and status"
              : "Create, edit, and track student disciplinary records"}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm text-xs">
            <Plus className="w-4 h-4 mr-1.5" /> Record Action
          </Button>
        )}
      </div>

      {/* Dashboard Stats */}
      {statsQuery.data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Records</span>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <h3 className="text-2xl font-extrabold text-gray-800">{statsQuery.data.total}</h3>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-amber-100 bg-amber-50/10 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Active Cases</span>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <h3 className="text-2xl font-extrabold text-amber-600">{statsQuery.data.active}</h3>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Warnings</span>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <h3 className="text-2xl font-extrabold text-blue-600">{statsQuery.data.warnings}</h3>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Final Warnings</span>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <h3 className="text-2xl font-extrabold text-orange-600">{statsQuery.data.finalWarnings}</h3>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Suspensions</span>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <h3 className="text-2xl font-extrabold text-red-600">{statsQuery.data.suspensions}</h3>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Records Table */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="font-bold text-gray-700">Student Name</TableHead>
                <TableHead className="font-bold text-gray-700">User ID</TableHead>
                <TableHead className="font-bold text-gray-700">Batch</TableHead>
                <TableHead className="font-bold text-gray-700">Level</TableHead>
                <TableHead className="font-bold text-gray-700">Reason</TableHead>
                <TableHead className="font-bold text-gray-700">Date</TableHead>
                <TableHead className="font-bold text-gray-700">Status</TableHead>
                <TableHead className="font-bold text-gray-700 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.data && listQuery.data.length > 0 ? (
                listQuery.data.map((record) => (
                  <TableRow key={record.id} className="hover:bg-gray-50/50">
                    <TableCell className="font-medium text-gray-900">{record.user.name}</TableCell>
                    <TableCell className="text-xs text-gray-500 font-semibold">{record.user.unionId}</TableCell>
                    <TableCell className="text-xs text-gray-500">{record.batch || "N/A"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-bold border-none ${
                          record.level === "Suspension"
                            ? "bg-red-50 text-red-700"
                            : record.level === "Final Warning"
                            ? "bg-orange-50 text-orange-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {record.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 truncate max-w-xs">{record.reason}</TableCell>
                    <TableCell className="text-[10px] text-gray-400 font-medium">
                      {new Date(record.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold uppercase ${
                          record.status === "resolved"
                            ? "border-emerald-200 text-emerald-700 bg-emerald-50/30"
                            : "border-amber-200 text-amber-700 bg-amber-50/30"
                        }`}
                      >
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setSelectedRecord(record);
                            setDetailsOpen(true);
                          }}
                          className="w-7 h-7 rounded-lg text-gray-500 hover:bg-gray-100"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        
                        {canEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingRecord(record)}
                            className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50"
                            title="Edit Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {canEdit && record.status === "active" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("Mark this record as resolved?")) {
                                resolveMutation.mutate({ id: record.id });
                              }
                            }}
                            className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50"
                            title="Mark as Resolved"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-gray-400 text-xs">
                    No disciplinary actions recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ==================== dialog MODALS ==================== */}

      {/* 1. Create Record Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Record Disciplinary Action</DialogTitle>
            <DialogDescription>Create a Warning, Final Warning, or Suspension. Students receive instant notification alerts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold text-gray-600 block mb-1">Student Name *</Label>
              <select
                value={createForm.studentId}
                onChange={(e) => setCreateForm({ ...createForm, studentId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select Student</option>
                {studentsQuery.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.unionId})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-gray-600 block mb-1">User ID</Label>
                <Input value={createForm.unionId} disabled className="rounded-xl bg-gray-50 text-gray-500 text-xs h-10" />
              </div>
              <div>
                <Label className="text-xs font-bold text-gray-600 block mb-1">Batch</Label>
                <Input value={createForm.batch} disabled className="rounded-xl bg-gray-50 text-gray-500 text-xs h-10" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-600 block mb-1">Discipline Level *</Label>
              <div className="flex gap-2">
                {["Warning", "Final Warning", "Suspension"].map((l) => (
                  <Button
                    key={l}
                    type="button"
                    variant={createForm.level === l ? "default" : "outline"}
                    onClick={() => setCreateForm({ ...createForm, level: l as any })}
                    className={`rounded-xl text-xs flex-1 h-9 ${
                      createForm.level === l
                        ? l === "Suspension"
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : l === "Final Warning"
                          ? "bg-orange-500 hover:bg-orange-600 text-white"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                        : ""
                    }`}
                  >
                    {l}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-600 block mb-1">Reason *</Label>
              <Input
                placeholder="Reason summary (e.g. Consecutive Absences)"
                value={createForm.reason}
                onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-600 block mb-1">Description *</Label>
              <Textarea
                placeholder="Detailed explanation of the incident..."
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                className="rounded-xl resize-none h-20"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!createForm.studentId || !createForm.reason || !createForm.description) {
                  toast.error("Please fill in all required fields.");
                  return;
                }
                createMutation.mutate({
                  userId: Number(createForm.studentId),
                  batch: createForm.batch,
                  level: createForm.level,
                  reason: createForm.reason,
                  description: createForm.description,
                });
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
              disabled={createMutation.isPending}
            >
              Record Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Edit Record Modal */}
      {editingRecord && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Disciplinary Action</DialogTitle>
              <DialogDescription>Modify record levels, reason, or change status between Active and Resolved.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-bold text-gray-600 block mb-1">Student</Label>
                <Input value={editingRecord.user.name} disabled className="rounded-xl bg-gray-50 text-gray-500 text-xs h-10" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-gray-600 block mb-1">User ID</Label>
                  <Input value={editingRecord.user.unionId} disabled className="rounded-xl bg-gray-50 text-gray-500 text-xs h-10" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-600 block mb-1">Batch *</Label>
                  <Input
                    value={editingRecord.batch || ""}
                    onChange={(e) => setEditingRecord({ ...editingRecord, batch: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-gray-600 block mb-1">Discipline Level *</Label>
                <div className="flex gap-2">
                  {["Warning", "Final Warning", "Suspension"].map((l) => (
                    <Button
                      key={l}
                      type="button"
                      variant={editingRecord.level === l ? "default" : "outline"}
                      onClick={() => setEditingRecord({ ...editingRecord, level: l as any })}
                      className={`rounded-xl text-xs flex-1 h-9 ${
                        editingRecord.level === l
                          ? l === "Suspension"
                            ? "bg-red-600 hover:bg-red-700 text-white"
                            : l === "Final Warning"
                            ? "bg-orange-500 hover:bg-orange-600 text-white"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                          : ""
                      }`}
                    >
                      {l}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-gray-600 block mb-1">Reason *</Label>
                <Input
                  value={editingRecord.reason}
                  onChange={(e) => setEditingRecord({ ...editingRecord, reason: e.target.value })}
                  className="rounded-xl"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-gray-600 block mb-1">Description *</Label>
                <Textarea
                  value={editingRecord.description}
                  onChange={(e) => setEditingRecord({ ...editingRecord, description: e.target.value })}
                  className="rounded-xl resize-none h-20"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-gray-600 block mb-1">Status *</Label>
                <div className="flex gap-2">
                  {["active", "resolved"].map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={editingRecord.status === s ? "default" : "outline"}
                      onClick={() => setEditingRecord({ ...editingRecord, status: s as any })}
                      className={`rounded-xl text-xs flex-1 h-9 capitalize ${
                        editingRecord.status === s
                          ? s === "resolved"
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-amber-500 hover:bg-amber-600 text-white"
                          : ""
                      }`}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditOpen(false);
                  setEditingRecord(null);
                }}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!editingRecord.batch || !editingRecord.reason || !editingRecord.description) {
                    toast.error("Please fill in all required fields.");
                    return;
                  }
                  updateMutation.mutate({
                    id: editingRecord.id,
                    userId: editingRecord.userId,
                    batch: editingRecord.batch,
                    level: editingRecord.level,
                    reason: editingRecord.reason,
                    description: editingRecord.description,
                    status: editingRecord.status,
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
                disabled={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 3. View Details Modal */}
      {selectedRecord && (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Info className="w-5 h-5 text-emerald-600" />
                Case Details
              </DialogTitle>
              <DialogDescription>Full disciplinary incident details and status.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Student Name</span>
                  <p className="font-semibold text-gray-800 text-sm mt-0.5">{selectedRecord.user.name}</p>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">User ID</span>
                  <p className="font-semibold text-gray-800 text-sm mt-0.5">{selectedRecord.user.unionId}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Discipline Level</span>
                  <div className="mt-0.5">
                    <Badge
                      variant="secondary"
                      className={`text-[9px] font-bold border-none ${
                        selectedRecord.level === "Suspension"
                          ? "bg-red-50 text-red-700"
                          : selectedRecord.level === "Final Warning"
                          ? "bg-orange-50 text-orange-700"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {selectedRecord.level}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Batch</span>
                  <p className="font-medium text-gray-700 mt-0.5">{selectedRecord.batch || "N/A"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Reported By</span>
                  <p className="font-medium text-gray-700 mt-0.5">{selectedRecord.reporter?.name || "System"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Date Created</span>
                  <p className="font-medium text-gray-700 mt-0.5">
                    {new Date(selectedRecord.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Status</span>
                  <div className="mt-0.5">
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-bold uppercase ${
                        selectedRecord.status === "resolved"
                          ? "border-emerald-200 text-emerald-700 bg-emerald-50/30"
                          : "border-amber-200 text-amber-700 bg-amber-50/30"
                      }`}
                    >
                      {selectedRecord.status}
                    </Badge>
                  </div>
                </div>
                {selectedRecord.resolvedAt && (
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Date Resolved</span>
                    <p className="font-medium text-gray-700 mt-0.5">
                      {new Date(selectedRecord.resolvedAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-b pb-3">
                <span className="text-[10px] text-gray-400 font-bold uppercase">Reason Summary</span>
                <p className="font-medium text-gray-800 mt-0.5">{selectedRecord.reason}</p>
              </div>

              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase">Incident Description</span>
                <p className="text-gray-600 mt-1 leading-relaxed bg-gray-50 p-2.5 rounded-lg border whitespace-pre-wrap">
                  {selectedRecord.description}
                </p>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button onClick={() => setDetailsOpen(false)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
