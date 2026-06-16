import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Plus, Upload, Edit, Trash2 } from "lucide-react";
import { isValidPhone, PHONE_ERROR_MESSAGE, COUNTRY_CODES, validatePhoneNumber } from "@contracts/validation";

export default function UsersPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<any>(null);
  const [csvData, setCsvData] = useState("");
  const [detailsUser, setDetailsUser] = useState<any>(null);
  const [adjustForm, setAdjustForm] = useState({
    allocatedOneToOne: 0,
    allocatedGroup: 0,
    reason: "",
  });

  const logsQuery = trpc.admin.getSessionAllocationLogs.useQuery(
    { studentId: detailsUser?.id || 0 },
    { enabled: !!detailsUser }
  );

  const adjustSessionsMutation = trpc.admin.adjustStudentSessions.useMutation({
    onSuccess: (updatedProfile) => {
      toast.success("Sessions updated successfully");
      usersQuery.refetch();
      logsQuery.refetch();
      setDetailsUser((prev: any) => prev ? { ...prev, profile: updatedProfile } : null);
      setAdjustForm(prev => ({ ...prev, reason: "" }));
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    name: "", countryCode: "+91", phoneNumber: "", email: "", username: "", password: "", role: "student" as any,
    courseId: "" as any, batchId: "" as any, feesTotal: 0,
    allocatedOneToOneSessions: 0, allocatedGroupSessions: 0,
  });

  const [paymentType, setPaymentType] = useState<"FULL_PAYMENT" | "INSTALLMENT">("FULL_PAYMENT");
  const [installmentCount, setInstallmentCount] = useState<number>(2);
  const [installments, setInstallments] = useState<Array<{ installmentNumber: number; amount: number; dueDate?: string }>>([]);

  useEffect(() => {
    if (paymentType === "INSTALLMENT" && form.feesTotal > 0) {
      const baseAmount = Math.floor(form.feesTotal / installmentCount);
      const remainder = form.feesTotal % installmentCount;
      setInstallments((prev) => {
        const count = installmentCount;
        return Array.from({ length: count }, (_, i) => {
          const prevInst = prev[i];
          return {
            installmentNumber: i + 1,
            amount: baseAmount + (i === count - 1 ? remainder : 0),
            dueDate: prevInst?.dueDate || "",
          };
        });
      });
    } else {
      setInstallments([]);
    }
  }, [paymentType, installmentCount, form.feesTotal]);

  const isInstallmentsValid = paymentType === "FULL_PAYMENT" || 
    (installments.reduce((sum, inst) => sum + inst.amount, 0) === form.feesTotal);

  const canManageUsers = ["super_admin", "admin"].includes(user?.role || "");
  const canViewUsers = ["super_admin", "admin", "academic_head"].includes(user?.role || "");

  const usersQuery = trpc.user.list.useQuery({
    role: roleFilter as any,
    status: statusFilter as any,
    search: search || undefined,
    limit: 50,
    offset: 0,
  }, { enabled: canViewUsers });

  const modulesQuery = trpc.learning.listModules.useQuery(undefined, {
    enabled: canManageUsers && open,
  });

  const activeCourses = modulesQuery.data?.filter((m) => m.status === "active") || [];
  const selectedCourse = activeCourses.find((c) => c.id === Number(form.courseId));
  const activeBatches = selectedCourse?.batches?.filter((b: any) => b.status === "active") || [];

  const createUser = trpc.user.create.useMutation({
    onSuccess: (data: any) => {
      if (data?.emailError) {
        toast.warning(`User created, but credentials email failed: ${data.emailError}`);
      } else {
        toast.success("User created successfully");
      }
      setOpen(false);
      setForm({
        name: "", countryCode: "+91", phoneNumber: "", email: "", username: "", password: "", role: "student",
        courseId: "", batchId: "", feesTotal: 0,
        allocatedOneToOneSessions: 0, allocatedGroupSessions: 0,
      });
      setPaymentType("FULL_PAYMENT");
      setInstallmentCount(2);
      setInstallments([]);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateUser = trpc.user.update.useMutation({
    onSuccess: () => {
      toast.success("User updated");
      setEditOpen(false);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteUser = trpc.user.delete.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      setDeleteId(null);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const importStudents = trpc.user.importStudents.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} students`);
      setImportOpen(false);
      setCsvData("");
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });



  const handleCourseChange = (courseIdVal: string) => {
    setForm((prev) => ({
      ...prev,
      courseId: courseIdVal ? Number(courseIdVal) : "",
      batchId: "",
      feesTotal: 0,
    }));
  };

  const handleBatchChange = (batchIdVal: string) => {
    const bId = batchIdVal ? Number(batchIdVal) : "";
    let fee = 0;
    if (bId) {
      const selectedBatch = activeBatches.find((b: any) => b.id === bId);
      fee = selectedBatch ? parseFloat(selectedBatch.courseFee || "0") : 0;
    }
    setForm((prev) => ({
      ...prev,
      batchId: bId,
      feesTotal: fee,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role === "student") {
      if (!form.courseId) {
        toast.error("Please select a course");
        return;
      }
      if (!form.batchId) {
        toast.error("Please select a batch");
        return;
      }
      if (paymentType === "INSTALLMENT" && !isInstallmentsValid) {
        toast.error("Installment amounts must sum up to the total course fee");
        return;
      }
    }
    const error = validatePhoneNumber(form.countryCode, form.phoneNumber);
    if (error) {
      toast.error(error);
      return;
    }
    createUser.mutate({
      ...form,
      courseId: form.role === "student" ? Number(form.courseId) : undefined,
      batchId: form.role === "student" ? Number(form.batchId) : undefined,
      feesTotal: form.role === "student" ? Number(form.feesTotal) : undefined,
      allocatedOneToOneSessions: form.role === "student" ? Number(form.allocatedOneToOneSessions) : undefined,
      allocatedGroupSessions: form.role === "student" ? Number(form.allocatedGroupSessions) : undefined,
      email: form.email || undefined,
      paymentType: form.role === "student" ? paymentType : undefined,
      installments: form.role === "student" && paymentType === "INSTALLMENT" ? installments : undefined,
    });
  };

  const handleEditOpen = (u: any) => {
    if (!canManageUsers) return;
    setEditUser({
      id: u.id,
      name: u.name,
      countryCode: u.countryCode || "+91",
      phoneNumber: u.phoneNumber || "",
      email: u.email,
      status: u.status,
      course: u.profile?.course || "",
      batch: u.profile?.batch || "",
    });
    setEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageUsers || !editUser) return;
    const error = validatePhoneNumber(editUser.countryCode, editUser.phoneNumber);
    if (error) {
      toast.error(error);
      return;
    }
    updateUser.mutate(editUser);
  };

  const handleImport = () => {
    if (!canManageUsers) return;
    const lines = csvData.trim().split("\n").filter(Boolean);
    const students = [];
    for (const line of lines) {
      const [name, phone, email, course, batch, feesTotal, userId] = line.split(",").map((s) => s.trim());
      if (!phone || !isValidPhone(phone)) {
        toast.error(`Invalid phone number "${phone}" for student "${name}". ${PHONE_ERROR_MESSAGE}`);
        return;
      }
      students.push({ 
        name, 
        phone, 
        email: email || undefined, 
        course: course || undefined, 
        batch: batch || undefined, 
        feesTotal: feesTotal ? Number(feesTotal) : undefined,
        userId: userId || undefined
      });
    }
    importStudents.mutate(students);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "super_admin": return "bg-red-100 text-red-700";
      case "admin": return "bg-orange-100 text-orange-700";
      case "academic_head": return "bg-purple-100 text-purple-700";
      case "teacher": return "bg-blue-100 text-blue-700";
      default: return "bg-emerald-100 text-emerald-700";
    }
  };

  if (!canViewUsers) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Access restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9 w-full sm:w-56" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
            <option value="admin">Admins</option>
          </select>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div className="flex gap-2 shrink-0">
          {canManageUsers && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                  <DialogHeader className="pb-2 border-b">
                    <DialogTitle>Create New User</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
                    <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-4 min-h-0">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name <span className="text-red-500">*</span></label>
                        <Input placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number <span className="text-red-500">*</span></label>
                        <div className="flex flex-col sm:flex-row items-center gap-2">
                          <select
                            className="h-9 w-full sm:w-36 rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                            value={form.countryCode}
                            onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                          >
                            {COUNTRY_CODES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code} ({c.country})
                              </option>
                            ))}
                          </select>
                          <Input
                            className="w-full h-9 flex-1"
                            placeholder={`${COUNTRY_CODES.find((c) => c.code === form.countryCode)?.length || 10} digits`}
                            value={form.phoneNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^\d*$/.test(val)) {
                                setForm({ ...form, phoneNumber: val });
                              }
                            }}
                          />
                        </div>
                        {form.phoneNumber && validatePhoneNumber(form.countryCode, form.phoneNumber) && (
                          <p className="text-xs text-red-500 mt-1">{validatePhoneNumber(form.countryCode, form.phoneNumber)}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email <span className="text-gray-400 text-xs">(optional)</span></label>
                      <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Username <span className="text-red-500">*</span></label>
                        <Input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password <span className="text-red-500">*</span></label>
                        <Input type="password" placeholder="Min 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Role <span className="text-red-500">*</span></label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                      >
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                        <option value="academic_head">Academic Head</option>
                      </select>
                    </div>
                    {form.role === "student" && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Course <span className="text-red-500">*</span></label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                              value={form.courseId}
                              onChange={(e) => handleCourseChange(e.target.value)}
                            >
                              <option value="">Select Course</option>
                              {activeCourses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Batch <span className="text-red-500">*</span></label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                              value={form.batchId}
                              onChange={(e) => handleBatchChange(e.target.value)}
                              disabled={!form.courseId}
                            >
                              <option value="">Select Batch</option>
                              {activeBatches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name} ({b.timeSlot || "No time"})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Course Fee <span className="text-red-500">*</span></label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={form.feesTotal}
                            onChange={(e) => setForm({ ...form, feesTotal: Number(e.target.value) })}
                            disabled={!canManageUsers}
                          />
                        </div>
                        <div className="space-y-1 mt-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Payment Mode</label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                            value={paymentType}
                            onChange={(e) => setPaymentType(e.target.value as any)}
                            disabled={!canManageUsers}
                          >
                            <option value="FULL_PAYMENT">Full Payment</option>
                            <option value="INSTALLMENT">Installment Payment</option>
                          </select>
                        </div>

                        {paymentType === "INSTALLMENT" && (
                          <div className="space-y-3 mt-2 border p-3 rounded-lg bg-gray-50/50 dark:bg-slate-900/50">
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Number of Installments</label>
                              <Input
                                type="number"
                                min={2}
                                max={12}
                                value={installmentCount}
                                onChange={(e) => setInstallmentCount(Math.max(2, Number(e.target.value)))}
                                disabled={!canManageUsers}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Installment Schedule</label>
                              {installments.map((inst, index) => (
                                <div key={index} className="grid grid-cols-2 gap-2 border-b pb-2 last:border-b-0">
                                  <div className="space-y-1">
                                    <label className="text-[11px] font-medium text-gray-500">Installment #{inst.installmentNumber} Amount (₹)</label>
                                    <Input
                                      type="number"
                                      value={inst.amount}
                                      onChange={(e) => {
                                        const updated = [...installments];
                                        updated[index].amount = Number(e.target.value);
                                        setInstallments(updated);
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[11px] font-medium text-gray-500">Due Date (Optional)</label>
                                    <Input
                                      type="date"
                                      value={inst.dueDate || ""}
                                      onChange={(e) => {
                                        const updated = [...installments];
                                        updated[index].dueDate = e.target.value;
                                        setInstallments(updated);
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                              {!isInstallmentsValid && (
                                <p className="text-[11px] text-red-500 font-medium">
                                  ⚠ Sum of installments (₹{installments.reduce((sum, inst) => sum + inst.amount, 0)}) must equal Total Course Fee (₹{form.feesTotal}).
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">1-to-1 Sessions</label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={form.allocatedOneToOneSessions}
                              onChange={(e) => setForm({ ...form, allocatedOneToOneSessions: Number(e.target.value) })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Group Sessions</label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={form.allocatedGroupSessions}
                              onChange={(e) => setForm({ ...form, allocatedGroupSessions: Number(e.target.value) })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Sessions</label>
                            <Input
                              type="number"
                              disabled
                              value={Number(form.allocatedOneToOneSessions || 0) + Number(form.allocatedGroupSessions || 0)}
                            />
                          </div>
                        </div>
                      </>
                    )}
                    </div>
                    <div className="pt-4 border-t mt-4">
                      <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={createUser.isPending || !form.name || !form.countryCode || !form.phoneNumber || !!validatePhoneNumber(form.countryCode, form.phoneNumber) || !form.username || !form.password}>
                        {createUser.isPending ? "Creating..." : "Create User"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.data?.map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button") || target.closest("a")) return;
                    if (u.role === "student") {
                      setDetailsUser(u);
                      setAdjustForm({
                        allocatedOneToOne: u.profile?.allocatedOneToOneSessions || 0,
                        allocatedGroup: u.profile?.allocatedGroupSessions || 0,
                        reason: "",
                      });
                    }
                  }}
                >
                  <TableCell className="font-mono text-xs font-semibold text-gray-600">{u.unionId}</TableCell>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.phone}</TableCell>
                  <TableCell>
                    <Badge className={getRoleColor(u.role)}>{u.role.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.status === "active" ? "default" : "secondary"}>{u.status}</Badge>
                  </TableCell>
                  <TableCell>{u.profile?.course || "-"}</TableCell>
                  <TableCell>{u.profile?.batch || "-"}</TableCell>
                  <TableCell>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>
                    {canManageUsers ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleEditOpen(u)}><Edit className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(u.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 font-semibold">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {usersQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="pb-2 border-b"><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-4 min-h-0">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                  <Input placeholder="Full Name" value={editUser.name} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <select
                      className="h-9 w-full sm:w-36 rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                      value={editUser.countryCode}
                      onChange={(e) => setEditUser({ ...editUser, countryCode: e.target.value })}
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.country})
                        </option>
                      ))}
                    </select>
                    <Input
                      className="w-full h-9 flex-1"
                      placeholder={`${COUNTRY_CODES.find((c) => c.code === editUser.countryCode)?.length || 10} digits`}
                      value={editUser.phoneNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*$/.test(val)) {
                          setEditUser({ ...editUser, phoneNumber: val });
                        }
                      }}
                    />
                  </div>
                  {editUser.phoneNumber && validatePhoneNumber(editUser.countryCode, editUser.phoneNumber) && (
                    <p className="text-xs text-red-500 mt-1">{validatePhoneNumber(editUser.countryCode, editUser.phoneNumber)}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email <span className="text-gray-400 text-xs">(optional)</span></label>
                <Input placeholder="Email" value={editUser.email || ""} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  value={editUser.status}
                  onChange={(e) => setEditUser({ ...editUser, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Course</label>
                  <Input placeholder="Course" value={editUser.course || ""} onChange={(e) => setEditUser({ ...editUser, course: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Batch</label>
                  <Input placeholder="Batch" value={editUser.batch || ""} onChange={(e) => setEditUser({ ...editUser, batch: e.target.value })} />
                </div>
              </div>
              </div>
              <div className="pt-4 border-t mt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={updateUser.isPending || !editUser.countryCode || !editUser.phoneNumber || !!validatePhoneNumber(editUser.countryCode, editUser.phoneNumber)}>
                  {updateUser.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The user will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteId && deleteUser.mutate({ id: deleteId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bulk Import Students</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-gray-500">Paste CSV: <code className="bg-gray-100 px-1 rounded text-xs">name,phone,email,course,batch,feesTotal,userId</code> (one per line, userId is optional and must match the sequential format)</p>
            <Textarea
              placeholder={"John Doe,9876543210,john@example.com,IELTS,Batch A,15000,STU0001\nJane Smith,9876543211,,PTE,Batch B,12000"}
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              rows={8}
            />
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleImport} disabled={importStudents.isPending || !csvData.trim()}>
              {importStudents.isPending ? "Importing..." : "Import Students"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Student Details & Session Balance Dialog */}
      <Dialog open={!!detailsUser} onOpenChange={(open) => { if (!open) setDetailsUser(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Profile & Session Details</DialogTitle>
          </DialogHeader>
          {detailsUser && (
            <div className="space-y-6 mt-3">
              {/* Profile Card */}
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{detailsUser.name}</h3>
                    <p className="text-xs text-slate-400 font-mono font-semibold">{detailsUser.unionId}</p>
                  </div>
                  <Badge variant={detailsUser.status === "active" ? "default" : "secondary"}>
                    {detailsUser.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs mt-2 text-slate-600 dark:text-slate-400">
                  <p><strong>Course:</strong> {detailsUser.profile?.course || "-"}</p>
                  <p><strong>Batch:</strong> {detailsUser.profile?.batch || "-"}</p>
                  <p><strong>Phone:</strong> {detailsUser.phone || "-"}</p>
                  <p><strong>Email:</strong> {detailsUser.email || "-"}</p>
                </div>
              </div>

              {/* Sessions Summary Table */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300">Session Balance Summary</h4>
                <div className="border rounded-xl overflow-hidden bg-white dark:bg-slate-950">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                      <TableRow>
                        <TableHead className="font-semibold text-xs">Session Type</TableHead>
                        <TableHead className="font-semibold text-xs text-center">Allocated</TableHead>
                        <TableHead className="font-semibold text-xs text-center">Attended</TableHead>
                        <TableHead className="font-semibold text-xs text-center">Remaining</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium text-xs">One-to-One Sessions</TableCell>
                        <TableCell className="text-center font-mono text-xs">{detailsUser.profile?.allocatedOneToOneSessions ?? 0}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-emerald-600 font-semibold">{detailsUser.profile?.attendedOneToOneSessions ?? 0}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-blue-600 font-bold">{detailsUser.profile?.remainingOneToOneSessions ?? 0}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-xs">Group Sessions</TableCell>
                        <TableCell className="text-center font-mono text-xs">{detailsUser.profile?.allocatedGroupSessions ?? 0}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-emerald-600 font-semibold">{detailsUser.profile?.attendedGroupSessions ?? 0}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-blue-600 font-bold">{detailsUser.profile?.remainingGroupSessions ?? 0}</TableCell>
                      </TableRow>
                      <TableRow className="bg-slate-50/55 dark:bg-slate-900/10 font-bold border-t">
                        <TableCell className="text-xs">Total Sessions</TableCell>
                        <TableCell className="text-center font-mono text-xs">{detailsUser.profile?.totalAllocatedSessions ?? 0}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-emerald-700">{detailsUser.profile?.totalAttendedSessions ?? 0}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-blue-700">{detailsUser.profile?.totalRemainingSessions ?? 0}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Adjust Allocations (Super Admin Only) */}
              {user?.role === "super_admin" && (
                <div className="space-y-3 p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20">
                  <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300">Adjust Session Allocations</h4>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    adjustSessionsMutation.mutate({
                      studentId: detailsUser.id,
                      allocatedOneToOne: adjustForm.allocatedOneToOne,
                      allocatedGroup: adjustForm.allocatedGroup,
                      reason: adjustForm.reason,
                    });
                  }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500">Allocated One-to-One</label>
                      <Input
                        type="number"
                        min={detailsUser.profile?.attendedOneToOneSessions ?? 0}
                        value={adjustForm.allocatedOneToOne}
                        onChange={(e) => setAdjustForm({ ...adjustForm, allocatedOneToOne: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500">Allocated Group</label>
                      <Input
                        type="number"
                        min={detailsUser.profile?.attendedGroupSessions ?? 0}
                        value={adjustForm.allocatedGroup}
                        onChange={(e) => setAdjustForm({ ...adjustForm, allocatedGroup: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2 space-y-1">
                      <label className="text-xs font-semibold text-slate-500">Adjustment Reason</label>
                      <Input
                        placeholder="Reason for adjustment (e.g., Purchased extra session pack)"
                        value={adjustForm.reason}
                        onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="col-span-1 sm:col-span-2 bg-emerald-600 hover:bg-emerald-700" disabled={adjustSessionsMutation.isPending}>
                      {adjustSessionsMutation.isPending ? "Adjusting..." : "Apply Allocation Adjustment"}
                    </Button>
                  </form>
                </div>
              )}

              {/* Adjustment Logs */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300">Allocation Adjustment History Logs</h4>
                <div className="border rounded-xl overflow-hidden bg-white dark:bg-slate-950 text-xs">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                      <TableRow>
                        <TableHead className="font-semibold text-xs">Date</TableHead>
                        <TableHead className="font-semibold text-xs">Changed By</TableHead>
                        <TableHead className="font-semibold text-xs text-center">One-to-One</TableHead>
                        <TableHead className="font-semibold text-xs text-center">Group</TableHead>
                        <TableHead className="font-semibold text-xs">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsQuery.data?.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-slate-500 font-mono">{new Date(log.changedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                          <TableCell className="font-medium">{log.changedByUser?.name || "Admin"}</TableCell>
                          <TableCell className="text-center font-mono">{log.previousOneToOne} → {log.newOneToOne}</TableCell>
                          <TableCell className="text-center font-mono">{log.previousGroup} → {log.newGroup}</TableCell>
                          <TableCell className="text-slate-500 max-w-[200px] truncate" title={log.reason || ""}>{log.reason || "-"}</TableCell>
                        </TableRow>
                      ))}
                      {logsQuery.data?.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                            No adjustment history logs found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}