"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Plus, RefreshCw, Key, ToggleLeft, ToggleRight, Copy, Edit, MoreVertical, GraduationCap, BarChart3, Coins, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";

export default function SalesExecutivesAdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Client-side route guard: only allow admin/super_admin
  useEffect(() => {
    if (user && !["super_admin", "admin"].includes(user.role)) {
      router.replace("/?reason=You+do+not+have+permission+to+access+the+sales+executives+page.");
    }
  }, [user, router]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passModalOpen, setPassModalOpen] = useState(false);

  // New Modals
  const [studentsModalOpen, setStudentsModalOpen] = useState(false);
  const [selectedExecForStudents, setSelectedExecForStudents] = useState<any>(null);

  const [perfModalOpen, setPerfModalOpen] = useState(false);
  const [selectedExecForPerf, setSelectedExecForPerf] = useState<any>(null);

  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [selectedExecForSalary, setSelectedExecForSalary] = useState<any>(null);

  // Form states
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [countryISO, setCountryISO] = useState("IN");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const execsQuery = trpc.salesExecutive.listExecutives.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
  });

  const registrationsQuery = trpc.salesExecutive.getAllRegistrations.useQuery();

  const selectedExecStudents = registrationsQuery.data?.filter(
    (reg) => reg.salesExecutiveId === selectedExecForStudents?.id
  ) || [];

  const perfQuery = trpc.salesExecutive.getPerformanceDashboard.useQuery(
    { salesExecutiveId: selectedExecForPerf?.id || 0, period: "all" },
    { enabled: !!selectedExecForPerf }
  );
  const perfData = perfQuery.data?.[0];

  const createMutation = trpc.salesExecutive.createExecutive.useMutation({
    onSuccess: () => {
      toast.success("Sales Executive created successfully");
      setAddModalOpen(false);
      resetForm();
      execsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create sales executive");
    },
  });

  const editMutation = trpc.salesExecutive.editExecutive.useMutation({
    onSuccess: () => {
      toast.success("Sales Executive updated successfully");
      setEditModalOpen(false);
      resetForm();
      execsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update details");
    },
  });

  const toggleStatusMutation = trpc.salesExecutive.toggleStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      execsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const resetPasswordMutation = trpc.salesExecutive.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password reset successfully");
      setPassModalOpen(false);
      setPassword("");
      setSelectedId(null);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const regenerateReferralMutation = trpc.salesExecutive.regenerateReferralCode.useMutation({
    onSuccess: () => {
      toast.success("Referral code regenerated");
      execsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const resetForm = () => {
    setSelectedId(null);
    setName("");
    setEmail("");
    setCountryCode("+91");
    setCountryISO("IN");
    setPhoneNumber("");
    setUsername("");
    setPassword("");
    setStatus("active");
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
    if (!name || !email || !phoneNumber || !username || !password) {
      toast.error("Please fill in all fields.");
      return;
    }
    createMutation.mutate({ name, email, phone, username, password, status });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
    if (!selectedId || !name || !email || !phoneNumber) return;
    editMutation.mutate({ id: selectedId, name, email, phone, status });
  };

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !password) return;
    resetPasswordMutation.mutate({ id: selectedId, newPassword: password });
  };

  const handleOpenEdit = (exec: any) => {
    setSelectedId(exec.id);
    setName(exec.name);
    setEmail(exec.email);
    // Parse existing phone into parts (it may already be E.164 or formatted)
    const rawPhone = exec.phone || "";
    setCountryCode(exec.countryCode || "+91");
    setCountryISO(exec.countryISO || "IN");
    setPhoneNumber(exec.phoneNumber || rawPhone);
    setStatus(exec.status);
    setEditModalOpen(true);
  };

  const handleOpenResetPassword = (id: number) => {
    setSelectedId(id);
    setPassword("");
    setPassModalOpen(true);
  };

  const copyReferralLink = (code: string) => {
    if (typeof window !== "undefined") {
      const link = `${window.location.origin}/admission/${code}`;
      navigator.clipboard.writeText(link);
      toast.success("Referral link copied!");
    }
  };

  const execs = execsQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Sales Executives</h1>
          <p className="text-xs text-gray-500 mt-1">Manage Sales Executives, passwords, status, and referral codes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => execsQuery.refetch()} disabled={execsQuery.isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${execsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setAddModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Executive
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <Card className="border-gray-100 shadow-sm">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, employee ID, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs rounded-lg border-gray-200"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="text-xs rounded-lg border-gray-200 bg-white">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="inactive">Inactive Only</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Executives List */}
      <Card className="border-gray-100 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="text-xs font-semibold">Employee ID</TableHead>
                  <TableHead className="text-xs font-semibold">Full Name</TableHead>
                  <TableHead className="text-xs font-semibold">Username</TableHead>
                  <TableHead className="text-xs font-semibold">Email & Phone</TableHead>
                  <TableHead className="text-xs font-semibold">Referrals</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {execsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-gray-500 py-10">
                      Loading Sales Executives...
                    </TableCell>
                  </TableRow>
                ) : execs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-gray-500 py-10">
                      No Sales Executives found.
                    </TableCell>
                  </TableRow>
                ) : (
                  execs.map((exec) => (
                    <TableRow key={exec.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="text-xs font-semibold text-emerald-800 font-mono">
                        {exec.employeeId}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-gray-900">{exec.name}</TableCell>
                      <TableCell className="text-xs text-gray-600">{exec.username}</TableCell>
                      <TableCell className="text-xs space-y-0.5">
                        <div className="text-gray-900">{exec.email}</div>
                        <div className="text-gray-500 text-[10px]">{exec.phone}</div>
                      </TableCell>
                      <TableCell className="text-xs font-bold text-gray-800">{exec.studentCount}</TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className={
                            exec.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : "bg-red-50 text-red-700 border-red-100"
                          }
                        >
                          {exec.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right space-x-1">
                        {/* Students Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-emerald-100 text-emerald-700 hover:bg-emerald-50 px-2.5 font-medium"
                          onClick={() => {
                            setSelectedExecForStudents(exec);
                            setStudentsModalOpen(true);
                          }}
                          title="View Referred Students"
                        >
                          <GraduationCap className="w-3.5 h-3.5 mr-1" />
                          Students
                        </Button>

                        {/* Performance Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-blue-100 text-blue-700 hover:bg-blue-50 px-2.5 font-medium"
                          onClick={() => {
                            setSelectedExecForPerf(exec);
                            setPerfModalOpen(true);
                          }}
                          title="View Enrollment Performance"
                        >
                          <BarChart3 className="w-3.5 h-3.5 mr-1" />
                          Performance
                        </Button>

                        {/* Options Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-7 h-7 hover:bg-gray-100 rounded-lg">
                              <MoreVertical className="w-4 h-4 text-gray-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem onClick={() => copyReferralLink(exec.referralCode)} className="flex items-center gap-2 cursor-pointer py-1.5">
                              <Copy className="w-3.5 h-3.5 text-gray-500" />
                              Copy Referral Link
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => regenerateReferralMutation.mutate({ id: exec.id })} className="flex items-center gap-2 cursor-pointer py-1.5 text-emerald-700">
                              <RefreshCw className="w-3.5 h-3.5" />
                              Regenerate Referral Code
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleOpenEdit(exec)} className="flex items-center gap-2 cursor-pointer py-1.5 text-blue-600">
                              <Edit className="w-3.5 h-3.5" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenResetPassword(exec.id)} className="flex items-center gap-2 cursor-pointer py-1.5 text-amber-600">
                              <Key className="w-3.5 h-3.5" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setSelectedExecForSalary(exec); setSalaryModalOpen(true); }} className="flex items-center gap-2 cursor-pointer py-1.5 text-indigo-600">
                              <Coins className="w-3.5 h-3.5" />
                              View Salary & Incentives
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => toggleStatusMutation.mutate({ id: exec.id, status: exec.status === "active" ? "inactive" : "active" })}
                              className={`flex items-center gap-2 cursor-pointer py-1.5 font-medium ${exec.status === "active" ? "text-red-600" : "text-emerald-600"}`}
                            >
                              {exec.status === "active" ? (
                                <>
                                  <ToggleRight className="w-4 h-4" />
                                  Deactivate Account
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="w-4 h-4" />
                                  Activate Account
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Executive Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md w-full rounded-2xl">
          <form onSubmit={handleAddSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-gray-900">Add Sales Executive</DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Create login credentials and a referral link for a new Sales Executive.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="exec-name" className="font-semibold text-gray-600">Full Name *</Label>
                <Input id="exec-name" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exec-email" className="font-semibold text-gray-600">Email Address *</Label>
                <Input id="exec-email" type="email" placeholder="john@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <PhoneNumberInput
                id="exec-phone"
                label="Phone Number"
                required
                countryCode={countryCode}
                countryISO={countryISO}
                value={phoneNumber}
                placeholder="Phone number"
                onChange={(data) => {
                  setCountryCode(data.countryCode);
                  setCountryISO(data.countryISO);
                  setPhoneNumber(data.phoneNumber);
                }}
              />

              <div className="space-y-1.5">
                <Label htmlFor="exec-user" className="font-semibold text-gray-600">Username *</Label>
                <Input id="exec-user" placeholder="johndoe" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exec-pass" className="font-semibold text-gray-600">Password *</Label>
                <Input id="exec-pass" type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exec-status" className="font-semibold text-gray-600">Initial Status</Label>
                <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                  <SelectTrigger id="exec-status" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                {createMutation.isPending ? "Saving..." : "Create Executive"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Executive Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md w-full rounded-2xl">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-gray-900">Edit Sales Executive</DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Update details for this Sales Executive.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="font-semibold text-gray-600">Full Name *</Label>
                <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-email" className="font-semibold text-gray-600">Email Address *</Label>
                <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <PhoneNumberInput
                id="edit-phone"
                label="Phone Number"
                required
                countryCode={countryCode}
                countryISO={countryISO}
                value={phoneNumber}
                placeholder="Phone number"
                onChange={(data) => {
                  setCountryCode(data.countryCode);
                  setCountryISO(data.countryISO);
                  setPhoneNumber(data.phoneNumber);
                }}
              />

              <div className="space-y-1.5">
                <Label htmlFor="edit-status" className="font-semibold text-gray-600">Status</Label>
                <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                  <SelectTrigger id="edit-status" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={editMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={passModalOpen} onOpenChange={setPassModalOpen}>
        <DialogContent className="max-w-sm w-full rounded-2xl">
          <form onSubmit={handleResetPasswordSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-gray-900">Reset Password</DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Change password for this Sales Executive.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 text-xs space-y-1.5">
              <Label htmlFor="reset-pass-field" className="font-semibold text-gray-600">New Password *</Label>
              <Input
                id="reset-pass-field"
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setPassModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={resetPasswordMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                {resetPasswordMutation.isPending ? "Updating..." : "Reset Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Referred Students Modal */}
      <Dialog open={studentsModalOpen} onOpenChange={setStudentsModalOpen}>
        <DialogContent className="max-w-3xl w-full rounded-2xl flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              Referred Students — {selectedExecForStudents?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              List of all students registered using referral code <span className="font-mono font-bold text-emerald-800">{selectedExecForStudents?.referralCode}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 min-h-0">
            {registrationsQuery.isLoading ? (
              <div className="text-center py-10 text-xs text-gray-500">Loading students...</div>
            ) : selectedExecStudents.length === 0 ? (
              <div className="text-center py-10 text-xs text-gray-500">No referred students registered yet for this executive.</div>
            ) : (
              <div className="overflow-hidden border border-gray-100 rounded-xl">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Student ID</TableHead>
                      <TableHead className="text-xs font-semibold">Name</TableHead>
                      <TableHead className="text-xs font-semibold">Course</TableHead>
                      <TableHead className="text-xs font-semibold">Date Registered</TableHead>
                      <TableHead className="text-xs font-semibold">Payment Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedExecStudents.map((student) => (
                      <TableRow key={student.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="text-xs font-semibold font-mono text-emerald-800">{student.profile?.enrollmentId || student.unionId}</TableCell>
                        <TableCell className="text-xs font-semibold text-gray-900">{student.name}</TableCell>
                        <TableCell className="text-xs text-gray-700">{student.profile?.course || "-"}</TableCell>
                        <TableCell className="text-xs text-gray-500">{new Date(student.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] capitalize">
                            {student.profile?.paymentStatus || "unpaid"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setStudentsModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Enrollment Performance Modal */}
      <Dialog open={perfModalOpen} onOpenChange={setPerfModalOpen}>
        <DialogContent className="max-w-md w-full rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Sales Performance — {selectedExecForPerf?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Overview of registrations, enrollments, and revenue metrics.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {perfQuery.isLoading ? (
              <div className="text-center py-10 text-xs text-gray-500">Loading performance data...</div>
            ) : !perfData ? (
              <div className="text-center py-10 text-xs text-gray-500">No performance records found.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Card className="bg-slate-50/50 border-gray-100">
                  <CardContent className="p-3.5 space-y-0.5">
                    <span className="text-gray-500 block">Total Registrations</span>
                    <span className="text-xl font-bold text-gray-900">{perfData.totalRegistrations}</span>
                  </CardContent>
                </Card>

                <Card className="bg-slate-50/50 border-gray-100">
                  <CardContent className="p-3.5 space-y-0.5">
                    <span className="text-gray-500 block">Total Enrollments</span>
                    <span className="text-xl font-bold text-gray-900">{perfData.totalEnrollments}</span>
                  </CardContent>
                </Card>

                <Card className="bg-slate-50/50 border-gray-100">
                  <CardContent className="p-3.5 space-y-0.5">
                    <span className="text-gray-500 block">Active Students</span>
                    <span className="text-xl font-bold text-emerald-700">{perfData.activeStudents}</span>
                  </CardContent>
                </Card>

                <Card className="bg-slate-50/50 border-gray-100">
                  <CardContent className="p-3.5 space-y-0.5">
                    <span className="text-gray-500 block">Revenue Generated</span>
                    <span className="text-xl font-bold text-indigo-700">₹{perfData.revenueGenerated.toLocaleString()}</span>
                  </CardContent>
                </Card>


              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setPerfModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Salary / Incentives Modal */}
      <Dialog open={salaryModalOpen} onOpenChange={setSalaryModalOpen}>
        <DialogContent className="max-w-sm w-full rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Coins className="w-5 h-5 text-indigo-600" />
              Salary & Incentives
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Salary configuration for {selectedExecForSalary?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            <div className="bg-indigo-50/60 border border-indigo-100 p-4 rounded-xl space-y-2 text-xs text-indigo-900">
              <div className="flex justify-between font-semibold border-b border-indigo-100/50 pb-1.5 mb-1.5">
                <span>Metric</span>
                <span>Configured Amount</span>
              </div>
              <div className="flex justify-between">
                <span className="text-indigo-700">Base Salary:</span>
                <span className="font-mono font-bold text-gray-700">N/A</span>
              </div>
              <div className="flex justify-between">
                <span className="text-indigo-700">Referral Incentive:</span>
                <span className="font-mono font-bold text-gray-700">N/A</span>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-100 p-3 rounded-lg text-[11px] text-amber-800 leading-relaxed">
              ⚠️ <strong>Salary & Incentives Module is currently disabled</strong> for Sales Executives. In the current platform settings, basic salary and class-based rates are only enabled for Teachers.
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setSalaryModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
